import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin, requireStaff } from "@/lib/auth/require";
import {
  statusUpdateSchema,
  isValidTransition,
} from "@/lib/validations/admin";
import type {
  AppointmentDetailResponse,
  AppointmentRequestFull,
  AppointmentStatus,
  AssignedStaffSummary,
  StatusHistoryActorRole,
  StatusHistoryEntry,
  StatusHistoryEntryWithActor,
} from "@/lib/types/database";
import type {
  ReportStatus,
  TechnicalReportSummary,
} from "@/lib/types/reports";

type Params = { params: Promise<{ id: string }> };

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

    // 1. Appointment + joined service name. select("*") includes
    // assigned_staff_id (added in migration 006).
    const { data: appointmentRow, error: requestError } = await supabase
      .from("appointment_requests")
      .select("*, service_catalog(name)")
      .eq("id", id)
      .maybeSingle();

    if (requestError) {
      console.error("Failed to fetch appointment request:", requestError);
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

    const appointment = appointmentRow as AppointmentRequestFull & {
      assigned_staff_id: string | null;
    };

    // Role-aware access:
    //   - admin can read any appointment detail.
    //   - staff can read only confirmadas (operational scope).
    // Non-confirmada access by staff returns 403, not 404, so the
    // UI can distinguish "exists but you can't see it" from
    // "doesn't exist". Staff workspace queries should never link
    // to non-confirmada IDs in the first place; this is defense
    // in depth for direct URL access.
    if (session.role === "staff" && appointment.status !== "confirmada") {
      return NextResponse.json(
        {
          success: false,
          error: "Acceso restringido a citas confirmadas",
        },
        { status: 403 }
      );
    }

    // 2. Resolve the assigned technician (if any). Done as a
    // separate query — appointment_requests.assigned_staff_id is
    // a single FK to staff_profiles, but completed_by_admin_id
    // (migration 006) also FKs the same table, so an embedded
    // PostgREST join would need an explicit FK alias. A discrete
    // lookup is simpler, returns the same data, and keeps the
    // query unambiguous.
    let assigned_staff: AssignedStaffSummary | null = null;
    if (appointment.assigned_staff_id) {
      const { data: assignedRow, error: assignedError } = await supabase
        .from("staff_profiles")
        .select("id, full_name")
        .eq("id", appointment.assigned_staff_id)
        .maybeSingle();

      if (assignedError) {
        console.error("Failed to fetch assigned staff:", assignedError);
        // Soft-fail: return the appointment with assigned_staff=null
        // so the rest of the surface is still usable.
      } else if (assignedRow) {
        assigned_staff = {
          id: assignedRow.id,
          full_name: assignedRow.full_name,
        };
      }
    }

    // 3. History rows.
    const { data: historyRows, error: historyError } = await supabase
      .from("appointment_status_history")
      .select("id, previous_status, new_status, changed_by, notes, created_at")
      .eq("appointment_request_id", id)
      .order("created_at", { ascending: true });

    if (historyError) {
      console.error("Failed to fetch history:", historyError);
      return NextResponse.json(
        { success: false, error: "Error al obtener el historial" },
        { status: 500 }
      );
    }

    const baseHistory = (historyRows ?? []) as StatusHistoryEntry[];

    // 4. Resolve actor names. Trigger 003 writes changed_by=NULL
    // for the initial "Solicitud creada por el cliente" row, so
    // that entry stays { actor_full_name: null, actor_role: null }.
    // For other rows, changed_by references auth.users.id, which
    // shares its UUID space with staff_profiles.id (migration 001
    // FK). We collect unique non-null IDs in one IN-list query.
    const actorIds = Array.from(
      new Set(
        baseHistory
          .map((h) => h.changed_by)
          .filter((value): value is string => value !== null)
      )
    );

    const actorMap = new Map<
      string,
      { full_name: string; role: StatusHistoryActorRole }
    >();

    if (actorIds.length > 0) {
      const { data: actorRows, error: actorsError } = await supabase
        .from("staff_profiles")
        .select("id, full_name, role")
        .in("id", actorIds);

      if (actorsError) {
        console.error("Failed to fetch actor names:", actorsError);
        // Soft-fail: leave actorMap empty so all rows render with
        // actor_full_name=null. This is consistent with the UX for
        // anon-created entries and keeps the timeline functional.
      } else {
        for (const row of actorRows ?? []) {
          actorMap.set(row.id, {
            full_name: row.full_name as string,
            role: row.role as StatusHistoryActorRole,
          });
        }
      }
    }

    const enrichedHistory: StatusHistoryEntryWithActor[] = baseHistory.map(
      (h) => {
        const actor = h.changed_by ? actorMap.get(h.changed_by) ?? null : null;
        return {
          ...h,
          actor_full_name: actor?.full_name ?? null,
          actor_role: actor?.role ?? null,
        };
      }
    );

    // 5. Phase 9: technical report summary. 1:1 with the appointment via
    // the UNIQUE(appointment_request_id) constraint on technical_reports.
    // RLS gates the SELECT (admin: any; staff: own OR confirmada-tied;
    // staff is already past the confirmada guard above so the join works).
    // Soft-fail on lookup error → technical_report=null (consistent with
    // the assigned_staff posture).
    let technical_report: TechnicalReportSummary | null = null;

    const { data: reportRow, error: reportError } = await supabase
      .from("technical_reports")
      .select(
        "id, report_status, technician_staff_id, updated_at, approved_by_admin_id, sent_at"
      )
      .eq("appointment_request_id", id)
      .maybeSingle();

    if (reportError) {
      console.error("Failed to fetch technical report summary:", reportError);
      // Soft-fail: technical_report stays null.
    } else if (reportRow) {
      const row = reportRow as {
        id: string;
        report_status: ReportStatus;
        technician_staff_id: string;
        updated_at: string;
        approved_by_admin_id: string | null;
        sent_at: string | null;
      };

      // Reuse actorMap when the technician already appears in history
      // (overlap is common — most reports are written by staff who
      // also moved the appointment to confirmada).
      let technician_full_name: string | null =
        actorMap.get(row.technician_staff_id)?.full_name ?? null;

      if (!technician_full_name) {
        const { data: techRow, error: techError } = await supabase
          .from("staff_profiles")
          .select("full_name")
          .eq("id", row.technician_staff_id)
          .maybeSingle();

        if (techError) {
          console.error("Failed to fetch report technician:", techError);
          // Soft-fail: technician_full_name stays null.
        } else if (techRow) {
          technician_full_name = techRow.full_name as string;
        }
      }

      technical_report = {
        id: row.id,
        report_status: row.report_status,
        technician_staff_id: row.technician_staff_id,
        technician_full_name,
        updated_at: row.updated_at,
        approved_by_admin_id: row.approved_by_admin_id,
        sent_at: row.sent_at,
      };
    }

    const response: AppointmentDetailResponse = {
      request: {
        ...appointment,
        assigned_staff,
        technical_report,
      },
      history: enrichedHistory,
    };

    return NextResponse.json(response);
  } catch (error) {
    if (error instanceof NextResponse) return error;
    throw error;
  }
}

export async function PATCH(request: Request, { params }: Params) {
  try {
    await requireAdmin();

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

    const parsed = statusUpdateSchema.safeParse(body);
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

    // Permanent completion guard (Phase 10).
    // The canonical completion path is POST /api/admin/reports/[id]/send,
    // which calls fn_send_and_complete_report and atomically writes:
    //   technical_reports.report_status='sent'
    //   appointment_requests.status='completada'
    //   appointment_requests.completed_at
    //   appointment_requests.completed_by_admin_id
    // Direct PATCH to 'completada' stays blocked so the audit columns
    // (completed_at, completed_by_admin_id) can never be left null.
    // The matching UI hint lives in StatusActions.tsx.
    if (parsed.data.status === "completada") {
      return NextResponse.json(
        {
          success: false,
          error:
            "Para completar la cita, envía el informe técnico al cliente desde el editor del informe.",
        },
        { status: 400 }
      );
    }

    const supabase = await createClient();

    // Fetch current status to validate transition server-side
    const { data: current, error: fetchError } = await supabase
      .from("appointment_requests")
      .select("status")
      .eq("id", id)
      .maybeSingle();

    if (fetchError) {
      console.error("Failed to fetch current status:", fetchError);
      return NextResponse.json(
        { success: false, error: "Error al obtener estado actual" },
        { status: 500 }
      );
    }

    if (!current) {
      return NextResponse.json(
        { success: false, error: "Solicitud no encontrada" },
        { status: 404 }
      );
    }

    const currentStatus = current.status as AppointmentStatus;
    const newStatus = parsed.data.status;

    if (currentStatus === newStatus) {
      return NextResponse.json(
        {
          success: false,
          error: `La solicitud ya está en estado ${newStatus}`,
        },
        { status: 400 }
      );
    }

    if (!isValidTransition(currentStatus, newStatus)) {
      return NextResponse.json(
        {
          success: false,
          error: `No se puede cambiar de ${currentStatus} a ${newStatus}`,
        },
        { status: 400 }
      );
    }

    // UPDATE — no .select(); the trigger writes the history row atomically.
    const { error: updateError } = await supabase
      .from("appointment_requests")
      .update({ status: newStatus })
      .eq("id", id);

    if (updateError) {
      console.error("Failed to update status:", updateError);
      return NextResponse.json(
        { success: false, error: "Error al actualizar el estado" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, status: newStatus });
  } catch (error) {
    if (error instanceof NextResponse) return error;
    throw error;
  }
}
