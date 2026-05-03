import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth/require";
import { assignmentUpdateSchema } from "@/lib/validations/staff";
import type { AssignmentUpdateResponse } from "@/lib/types/staff";

type Params = { params: Promise<{ id: string }> };

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * PATCH /api/admin/appointment-requests/[id]/assignment
 * Admin-only. Sets or clears assigned_staff_id.
 *
 * Business rules enforced:
 *   - Appointment must be in 'confirmada' status (per approved
 *     adjustment #2 from the Phase 8 plan).
 *   - assigned_staff_id, when not null, must reference an active
 *     staff_profiles row.
 *
 * Does NOT write to appointment_status_history — assignment is
 * not a status transition.
 */
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

    const parsed = assignmentUpdateSchema.safeParse(body);
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

    const { data: appointment, error: fetchError } = await supabase
      .from("appointment_requests")
      .select("status")
      .eq("id", id)
      .maybeSingle();

    if (fetchError) {
      console.error("Failed to fetch appointment:", fetchError);
      return NextResponse.json(
        { success: false, error: "Error al obtener la cita" },
        { status: 500 }
      );
    }

    if (!appointment) {
      return NextResponse.json(
        { success: false, error: "Solicitud no encontrada" },
        { status: 404 }
      );
    }

    if (appointment.status !== "confirmada") {
      return NextResponse.json(
        {
          success: false,
          error: "Solo se puede asignar técnico a citas confirmadas",
        },
        { status: 400 }
      );
    }

    if (parsed.data.assigned_staff_id !== null) {
      const { data: staff, error: staffError } = await supabase
        .from("staff_profiles")
        .select("id")
        .eq("id", parsed.data.assigned_staff_id)
        .eq("is_active", true)
        .maybeSingle();

      if (staffError) {
        console.error("Failed to verify staff:", staffError);
        return NextResponse.json(
          { success: false, error: "Error al verificar staff" },
          { status: 500 }
        );
      }

      if (!staff) {
        return NextResponse.json(
          { success: false, error: "Staff no encontrado o inactivo" },
          { status: 400 }
        );
      }
    }

    const { error: updateError } = await supabase
      .from("appointment_requests")
      .update({ assigned_staff_id: parsed.data.assigned_staff_id })
      .eq("id", id);

    if (updateError) {
      console.error("Failed to update assignment:", updateError);
      return NextResponse.json(
        { success: false, error: "Error al actualizar la asignación" },
        { status: 500 }
      );
    }

    const response: AssignmentUpdateResponse = {
      success: true,
      data: {
        id,
        assigned_staff_id: parsed.data.assigned_staff_id,
      },
    };
    return NextResponse.json(response);
  } catch (error) {
    if (error instanceof NextResponse) return error;
    throw error;
  }
}
