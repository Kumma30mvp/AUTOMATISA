import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireStaff } from "@/lib/auth/require";
import { reportUpdateSchema } from "@/lib/validations/reports";
import type { AppointmentStatus } from "@/lib/types/database";
import type {
  TechnicalReportFull,
  TechnicalReportResponse,
  TechnicalReportRow,
  TechnicalReportUpdateResponse,
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

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

/**
 * Joins a TechnicalReportRow with the parent appointment slice and
 * resolves the three actor names (technician / approved_by_admin /
 * last_editor) in a single IN-list lookup against staff_profiles.
 *
 * Soft-fail on the actor lookup — leaves null names rather than 500.
 * Returns null if the parent appointment is missing (data-integrity
 * issue; ON DELETE RESTRICT on the FK should prevent this).
 */
async function buildFullReport(
  supabase: SupabaseServerClient,
  report: TechnicalReportRow
): Promise<TechnicalReportFull | null> {
  const { data: appointmentRow, error: appointmentError } = await supabase
    .from("appointment_requests")
    .select(APPOINTMENT_SLICE_FIELDS)
    .eq("id", report.appointment_request_id)
    .maybeSingle();

  if (appointmentError) {
    console.error("Failed to fetch appointment for report:", appointmentError);
    return null;
  }
  if (!appointmentRow) {
    return null;
  }
  const appointment = appointmentRow as AppointmentSlice;

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
      console.error("Failed to fetch report actor names:", actorsError);
      // soft-fail: leave map empty
    } else {
      for (const row of (actorRows ?? []) as {
        id: string;
        full_name: string;
      }[]) {
        actorMap.set(row.id, row);
      }
    }
  }

  return {
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
}

/**
 * GET /api/admin/reports/[id]
 *
 * Returns a single technical report by id, joined with the parent
 * appointment slice + technician / approved_by_admin / last_editor
 * names.
 *
 * Visibility is enforced by RLS staff_select_technical_reports:
 * admin sees all; staff sees own reports OR reports for currently-
 * confirmada appointments. If RLS hides the row, the response is
 * 404 — same as a non-existent id, intentional to avoid leaking
 * existence to unauthorized callers.
 */
export async function GET(_request: Request, { params }: Params) {
  try {
    await requireStaff();

    const { id } = await params;
    if (!UUID_REGEX.test(id)) {
      return NextResponse.json(
        { success: false, error: "ID inválido" },
        { status: 400 }
      );
    }

    const supabase = await createClient();

    const { data: reportRow, error: reportError } = await supabase
      .from("technical_reports")
      .select("*")
      .eq("id", id)
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
        { success: false, error: "Informe no encontrado" },
        { status: 404 }
      );
    }

    const full = await buildFullReport(
      supabase,
      reportRow as TechnicalReportRow
    );

    if (!full) {
      return NextResponse.json(
        { success: false, error: "Error al obtener el informe" },
        { status: 500 }
      );
    }

    const response: TechnicalReportResponse = { data: full };
    return NextResponse.json(response);
  } catch (error) {
    if (error instanceof NextResponse) return error;
    throw error;
  }
}

/**
 * PATCH /api/admin/reports/[id]
 *
 * Updates structured fields on a technical report.
 *
 * What this route does NOT do:
 *   - Change report_status. .strict() in reportUpdateSchema rejects
 *     it. State transitions go through POST .../transition.
 *   - Allow staff to edit another technician's report. RLS
 *     staff_update predicate denies; this route surfaces a friendly
 *     403 before the UPDATE hits the wire.
 *   - Allow staff to edit a non-draft report. Same friendly 403.
 *   - Allow staff to change technician_staff_id. Admin-only at the
 *     API; RLS WITH CHECK would deny anyway.
 *
 * Pre-checks (in order):
 *   1. UUID validation.
 *   2. zod schema validation (rejects report_status; trims / caps).
 *   3. Load the row (RLS-gated). Missing → 404.
 *   4. If body.technician_staff_id is present:
 *      a. Staff role → 403 ("admin only").
 *      b. Different from current → admin pre-check that the new
 *         technician is active (DB trigger trg_06 is the safety net).
 *   5. Staff-only enforcement: row must be draft AND own.
 *
 * UPDATE then runs RLS-gated. trg_20 (lock-sent) fires on a sent
 * row → mapped to 400. trg_06 (active-tech) fires if the active
 * pre-check raced → mapped to 400.
 *
 * Success returns 200 with the freshly-joined TechnicalReportFull.
 */
export async function PATCH(request: Request, { params }: Params) {
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

    const parsed = reportUpdateSchema.safeParse(body);
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

    if (Object.keys(parsed.data).length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: "No se enviaron campos para actualizar",
        },
        { status: 400 }
      );
    }

    const supabase = await createClient();

    // Pre-fetch the current row (RLS-gated). Lets us:
    //   - Distinguish 404 (not visible) from "exists but RLS denies UPDATE"
    //   - Run friendly role/status checks before the UPDATE
    //   - Detect if technician_staff_id is actually changing (admin path)
    const { data: currentRow, error: currentError } = await supabase
      .from("technical_reports")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (currentError) {
      console.error("Failed to fetch current report:", currentError);
      return NextResponse.json(
        { success: false, error: "Error al obtener el informe" },
        { status: 500 }
      );
    }

    if (!currentRow) {
      return NextResponse.json(
        { success: false, error: "Informe no encontrado" },
        { status: 404 }
      );
    }

    const current = currentRow as TechnicalReportRow;

    // Pre-check 4: technician_staff_id change is admin-only.
    if (parsed.data.technician_staff_id !== undefined) {
      if (session.role !== "admin") {
        return NextResponse.json(
          {
            success: false,
            error: "Solo administradores pueden cambiar el técnico",
          },
          { status: 403 }
        );
      }

      // Pre-check 4b: only validate active when actually changing.
      if (parsed.data.technician_staff_id !== current.technician_staff_id) {
        const { data: techRow, error: techError } = await supabase
          .from("staff_profiles")
          .select("id")
          .eq("id", parsed.data.technician_staff_id)
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
      }
    }

    // Pre-check 5: staff-only enforcement. Friendlier than 0-row UPDATE.
    if (session.role === "staff") {
      if (current.technician_staff_id !== session.userId) {
        return NextResponse.json(
          {
            success: false,
            error: "No puedes editar el informe de otro técnico",
          },
          { status: 403 }
        );
      }
      if (current.report_status !== "draft") {
        return NextResponse.json(
          {
            success: false,
            error: "El informe ya no está en borrador",
          },
          { status: 403 }
        );
      }
    }

    // Build update payload — only fields that were actually sent.
    // updated_at and last_edited_by are set by trg_10_audit (DB).
    const payload: Record<string, unknown> = {};
    if (parsed.data.technician_staff_id !== undefined) {
      payload.technician_staff_id = parsed.data.technician_staff_id;
    }
    if (parsed.data.vehicle_year !== undefined) {
      payload.vehicle_year = parsed.data.vehicle_year;
    }
    if (parsed.data.initial_symptoms !== undefined) {
      payload.initial_symptoms = parsed.data.initial_symptoms;
    }
    if (parsed.data.diagnosis_work_performed !== undefined) {
      payload.diagnosis_work_performed = parsed.data.diagnosis_work_performed;
    }
    if (parsed.data.replaced_parts !== undefined) {
      payload.replaced_parts = parsed.data.replaced_parts;
    }
    if (parsed.data.final_observations !== undefined) {
      payload.final_observations = parsed.data.final_observations;
    }
    if (parsed.data.conclusions !== undefined) {
      payload.conclusions = parsed.data.conclusions;
    }

    const { data: updatedRow, error: updateError } = await supabase
      .from("technical_reports")
      .update(payload)
      .eq("id", id)
      .select("*")
      .maybeSingle();

    if (updateError) {
      // 23514 = check_violation. trg_20_lock_sent or trg_06 raise.
      if (updateError.code === "23514") {
        console.error("DB invariant raised on report PATCH:", updateError);
        return NextResponse.json(
          {
            success: false,
            error: "El informe no puede modificarse en su estado actual",
          },
          { status: 400 }
        );
      }
      console.error("Failed to update report:", updateError);
      return NextResponse.json(
        { success: false, error: "Error al actualizar el informe" },
        { status: 500 }
      );
    }

    if (!updatedRow) {
      // Either RLS denied the UPDATE (returns 0 rows, no error) or
      // the row vanished mid-request. Pre-checks above should have
      // caught the common cases — this is the defensive fallback.
      console.error("Report PATCH returned 0 rows — RLS deny or race");
      return NextResponse.json(
        { success: false, error: "No se pudo actualizar el informe" },
        { status: 500 }
      );
    }

    const full = await buildFullReport(
      supabase,
      updatedRow as TechnicalReportRow
    );

    if (!full) {
      return NextResponse.json(
        { success: false, error: "Error al obtener el informe actualizado" },
        { status: 500 }
      );
    }

    const response: TechnicalReportUpdateResponse = {
      success: true,
      data: full,
    };
    return NextResponse.json(response);
  } catch (error) {
    if (error instanceof NextResponse) return error;
    throw error;
  }
}
