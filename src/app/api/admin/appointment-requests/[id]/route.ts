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

    const response: AppointmentDetailResponse = {
      request: {
        ...appointment,
        assigned_staff,
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
