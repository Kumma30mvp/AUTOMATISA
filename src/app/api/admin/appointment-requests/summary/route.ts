import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { verifySession } from "@/lib/auth/verify-session";
import type { SummaryCounts } from "@/lib/types/database";

export async function GET() {
  const staff = await verifySession();
  if (!staff) {
    return NextResponse.json(
      { success: false, error: "No autorizado" },
      { status: 401 }
    );
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_appointment_summary");

  if (error) {
    console.error("Failed to get appointment summary:", error);
    return NextResponse.json(
      { success: false, error: "Error al obtener resumen" },
      { status: 500 }
    );
  }

  // RPC returns a TABLE — Supabase gives us an array with one row
  const row = Array.isArray(data) ? data[0] : data;
  const counts: SummaryCounts = {
    pendiente: Number(row?.pendiente ?? 0),
    confirmada: Number(row?.confirmada ?? 0),
    cancelada: Number(row?.cancelada ?? 0),
    completada: Number(row?.completada ?? 0),
  };

  return NextResponse.json(counts);
}
