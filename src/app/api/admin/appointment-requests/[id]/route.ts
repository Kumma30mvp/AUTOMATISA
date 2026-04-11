import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { verifySession } from "@/lib/auth/verify-session";
import {
  statusUpdateSchema,
  isValidTransition,
} from "@/lib/validations/admin";
import type {
  AppointmentDetailResponse,
  AppointmentRequestFull,
  AppointmentStatus,
  StatusHistoryEntry,
} from "@/lib/types/database";

type Params = { params: Promise<{ id: string }> };

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(_request: Request, { params }: Params) {
  const staff = await verifySession();
  if (!staff) {
    return NextResponse.json(
      { success: false, error: "No autorizado" },
      { status: 401 }
    );
  }

  const { id } = await params;
  if (!UUID_REGEX.test(id)) {
    return NextResponse.json(
      { success: false, error: "ID inválido" },
      { status: 400 }
    );
  }

  const supabase = await createClient();

  const { data: request, error: requestError } = await supabase
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

  if (!request) {
    return NextResponse.json(
      { success: false, error: "Solicitud no encontrada" },
      { status: 404 }
    );
  }

  const { data: history, error: historyError } = await supabase
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

  const response: AppointmentDetailResponse = {
    request: request as AppointmentRequestFull,
    history: (history ?? []) as StatusHistoryEntry[],
  };

  return NextResponse.json(response);
}

export async function PATCH(request: Request, { params }: Params) {
  const staff = await verifySession();
  if (!staff) {
    return NextResponse.json(
      { success: false, error: "No autorizado" },
      { status: 401 }
    );
  }

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
}
