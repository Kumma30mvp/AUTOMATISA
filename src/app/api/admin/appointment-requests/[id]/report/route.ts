import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireStaff } from "@/lib/auth/require";
import { reportCreateSchema } from "@/lib/validations/reports";
import type { AppointmentStatus } from "@/lib/types/database";
import type {
  ReportStatus,
  TechnicalReportCreateResponse,
  TechnicalReportFull,
  TechnicalReportResponse,
  TechnicalReportRow,
} from "@/lib/types/reports";

type Params = { params: Promise<{ id: string }> };

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const APPOINTMENT_SLICE_FIELDS =
  "id, car_plate, vehicle_brand, vehicle_model, full_name, dni, email, phone, status";

type AppointmentSlice = {
  id: string;
  car_plate: string;
  vehicle_brand: string | null;
  vehicle_model: string | null;
  full_name: string | null;
  dni: string;
  email: string;
  phone: string;
  status: AppointmentStatus;
};

/**
 * GET /api/admin/appointment-requests/[id]/report
 *
 * Returns the technical report attached to the appointment, with
 * joined technician / approved_by_admin / last_editor names and a
 * read-only slice of the parent appointment.
 *
 * Role-aware status guard mirrors the Phase 8 appointment-detail
 * route: admin can read any appointment's report; staff can only
 * access reports tied to a `confirmada` appointment.
 *
 * 404 cases distinguish "appointment not found" from "appointment
 * exists but has no report yet". 403 distinguishes "exists, but you
 * cannot see it" from either. RLS still enforces the ultimate
 * boundary on report visibility.
 */
export async function GET(_request: Request, { params }: Params) {
  try {
    const session = await requireStaff();

    const { id } = await params;
    if (!UUID_REGEX.test(id)) {
      return NextResponse.json(
        { success: false, error: "ID inválido" },
        { status: 400 }
      );
    }

    const supabase = await createClient();

    // 1. Appointment slice for status check + response embed.
    const { data: appointmentRow, error: appointmentError } = await supabase
      .from("appointment_requests")
      .select(APPOINTMENT_SLICE_FIELDS)
      .eq("id", id)
      .maybeSingle();

    if (appointmentError) {
      console.error("Failed to fetch appointment:", appointmentError);
      return NextResponse.json(
        { success: false, error: "Error al obtener la solicitud" },
        { status: 500 }
      );
    }

    if (!appointmentRow) {
      return NextResponse.json(
        { success: false, error: "Solicitud no encontrada" },
        { status: 404 }
      );
    }

    const appointment = appointmentRow as AppointmentSlice;

    // 2. Role-aware status guard (matches Phase 8 detail route).
    if (session.role === "staff" && appointment.status !== "confirmada") {
      return NextResponse.json(
        {
          success: false,
          error: "Acceso restringido a citas confirmadas",
        },
        { status: 403 }
      );
    }

    // 3. Load the report (RLS-gated). For staff, the SELECT policy
    // requires own-report OR a confirmada-linked appointment; the
    // status guard above ensures the latter for staff callers.
    const { data: reportRow, error: reportError } = await supabase
      .from("technical_reports")
      .select("*")
      .eq("appointment_request_id", id)
      .maybeSingle();

    if (reportError) {
      console.error("Failed to fetch report:", reportError);
      return NextResponse.json(
        { success: false, error: "Error al obtener el informe" },
        { status: 500 }
      );
    }

    if (!reportRow) {
      return NextResponse.json(
        {
          success: false,
          error: "No hay informe técnico para esta cita",
        },
        { status: 404 }
      );
    }

    const report = reportRow as TechnicalReportRow;

    // 4. Resolve actor names in a single IN-list lookup.
    const actorIds = Array.from(
      new Set(
        [
          report.technician_staff_id,
          report.approved_by_admin_id,
          report.last_edited_by,
        ].filter((v): v is string => v !== null)
      )
    );

    const actorMap = new Map<string, { id: string; full_name: string }>();
    if (actorIds.length > 0) {
      const { data: actorRows, error: actorsError } = await supabase
        .from("staff_profiles")
        .select("id, full_name")
        .in("id", actorIds);

      if (actorsError) {
        // Soft-fail: leave actorMap empty so the UI renders null
        // names. Consistent with the Phase 8 detail handler's
        // posture on auxiliary lookups.
        console.error("Failed to fetch report actor names:", actorsError);
      } else {
        for (const row of (actorRows ?? []) as {
          id: string;
          full_name: string;
        }[]) {
          actorMap.set(row.id, row);
        }
      }
    }

    const full: TechnicalReportFull = {
      ...report,
      technician: actorMap.get(report.technician_staff_id) ?? null,
      approved_by_admin: report.approved_by_admin_id
        ? actorMap.get(report.approved_by_admin_id) ?? null
        : null,
      last_editor: report.last_edited_by
        ? actorMap.get(report.last_edited_by) ?? null
        : null,
      appointment,
    };

    const response: TechnicalReportResponse = { data: full };
    return NextResponse.json(response);
  } catch (error) {
    if (error instanceof NextResponse) return error;
    throw error;
  }
}

/**
 * POST /api/admin/appointment-requests/[id]/report
 *
 * Creates a draft technical report for the given appointment.
 * Pre-checks (in order):
 *   1. Path id is a valid UUID.
 *   2. Body matches reportCreateSchema (zod, .strict()).
 *   3. Appointment exists.
 *   4. Appointment status === 'confirmada'.
 *      (DB trigger trg_05 is the safety net — fires if API bypassed.)
 *   5. No report already exists for this appointment.
 *      (UNIQUE constraint is the safety net — fires on race.)
 *   6. For admin role: the requested technician_staff_id references
 *      an active staff_profiles row.
 *      (DB trigger trg_06 is the safety net.)
 *
 * Role-aware technician_staff_id handling:
 *   - Staff: server forces technician_staff_id = session.userId
 *     (auth.uid()) regardless of body. Staff can only register
 *     themselves as the technician.
 *   - Admin: uses whatever the body provides, after the active-staff
 *     pre-check.
 *
 * Returns 201 with TechnicalReportCreateResponse on success.
 */
export async function POST(request: Request, { params }: Params) {
  try {
    const session = await requireStaff();

    const { id } = await params;
    if (!UUID_REGEX.test(id)) {
      return NextResponse.json(
        { success: false, error: "ID inválido" },
        { status: 400 }
      );
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { success: false, error: "Cuerpo inválido" },
        { status: 400 }
      );
    }

    const parsed = reportCreateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          error: "Datos inválidos",
          details: parsed.error.issues.map((i) => ({
            field: String(i.path[0] ?? "unknown"),
            message: i.message,
          })),
        },
        { status: 400 }
      );
    }

    const supabase = await createClient();

    // Pre-check 3 + 4: appointment exists and is in 'confirmada'.
    const { data: appointmentRow, error: appointmentError } = await supabase
      .from("appointment_requests")
      .select("id, status")
      .eq("id", id)
      .maybeSingle();

    if (appointmentError) {
      console.error("Failed to fetch appointment:", appointmentError);
      return NextResponse.json(
        { success: false, error: "Error al obtener la solicitud" },
        { status: 500 }
      );
    }

    if (!appointmentRow) {
      return NextResponse.json(
        { success: false, error: "Solicitud no encontrada" },
        { status: 404 }
      );
    }

    if (
      (appointmentRow as { status: AppointmentStatus }).status !== "confirmada"
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Solo se puede crear un informe técnico cuando la cita está confirmada",
        },
        { status: 400 }
      );
    }

    // Pre-check 5: no existing report (UNIQUE on appointment_request_id).
    const { data: existingRow, error: existingError } = await supabase
      .from("technical_reports")
      .select("id")
      .eq("appointment_request_id", id)
      .maybeSingle();

    if (existingError) {
      console.error("Failed to check existing report:", existingError);
      return NextResponse.json(
        {
          success: false,
          error: "Error al verificar el informe existente",
        },
        { status: 500 }
      );
    }

    if (existingRow) {
      return NextResponse.json(
        {
          success: false,
          error: "Ya existe un informe técnico para esta cita",
        },
        { status: 409 }
      );
    }

    // Role-aware technician_staff_id resolution:
    //   - Staff: schema makes the field optional. The route forces
    //     it to session.userId regardless of body content.
    //   - Admin: schema is optional too, so the handler enforces
    //     presence here with a 400 + field-level detail. The
    //     subsequent active-staff pre-check still validates the
    //     value when present.
    let technician_staff_id: string;
    if (session.role === "admin") {
      const adminTech = parsed.data.technician_staff_id;
      if (!adminTech) {
        return NextResponse.json(
          {
            success: false,
            error: "Datos inválidos",
            details: [
              {
                field: "technician_staff_id",
                message: "Requerido para administrador",
              },
            ],
          },
          { status: 400 }
        );
      }

      // Pre-check 6 (admin path only): technician must be active.
      const { data: techRow, error: techError } = await supabase
        .from("staff_profiles")
        .select("id")
        .eq("id", adminTech)
        .eq("is_active", true)
        .maybeSingle();

      if (techError) {
        console.error("Failed to verify technician:", techError);
        return NextResponse.json(
          { success: false, error: "Error al verificar el técnico" },
          { status: 500 }
        );
      }
      if (!techRow) {
        return NextResponse.json(
          {
            success: false,
            error: "Técnico no encontrado o inactivo",
          },
          { status: 400 }
        );
      }

      technician_staff_id = adminTech;
    } else {
      technician_staff_id = session.userId;
    }

    // INSERT. RLS allows: staff via staff_insert (self-author),
    // admin via admin_insert. DB triggers 05 + 06 are the safety
    // net for confirmada and active-tech invariants.
    const insertPayload = {
      appointment_request_id: id,
      technician_staff_id,
      vehicle_year: parsed.data.vehicle_year ?? null,
      initial_symptoms: parsed.data.initial_symptoms,
      diagnosis_work_performed: parsed.data.diagnosis_work_performed,
      replaced_parts: parsed.data.replaced_parts,
      final_observations: parsed.data.final_observations,
      conclusions: parsed.data.conclusions,
    };

    const { data: insertedRow, error: insertError } = await supabase
      .from("technical_reports")
      .insert(insertPayload)
      .select("id, report_status")
      .single();

    if (insertError) {
      // 23505 = unique_violation. Race with another concurrent INSERT.
      if (insertError.code === "23505") {
        return NextResponse.json(
          {
            success: false,
            error: "Ya existe un informe técnico para esta cita",
          },
          { status: 409 }
        );
      }
      // 23514 = check_violation. A DB trigger (trg_05 / trg_06)
      // raised — typically only reachable on race conditions
      // (appointment cancelled between the API check and the INSERT,
      // or the technician deactivated in the same window).
      if (insertError.code === "23514") {
        console.error("DB invariant raised on report INSERT:", insertError);
        return NextResponse.json(
          { success: false, error: "Error al crear el informe" },
          { status: 400 }
        );
      }
      console.error("Failed to insert report:", insertError);
      return NextResponse.json(
        { success: false, error: "Error al crear el informe" },
        { status: 500 }
      );
    }

    const inserted = insertedRow as { id: string; report_status: ReportStatus };
    const response: TechnicalReportCreateResponse = {
      success: true,
      data: {
        id: inserted.id,
        report_status: inserted.report_status,
      },
    };
    return NextResponse.json(response, { status: 201 });
  } catch (error) {
    if (error instanceof NextResponse) return error;
    throw error;
  }
}
