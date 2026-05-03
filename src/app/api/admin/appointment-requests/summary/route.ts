import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth/require";
import type { SummaryCounts } from "@/lib/types/database";

export async function GET() {
  try {
    await requireAdmin();

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
  } catch (error) {
    if (error instanceof NextResponse) return error;
    throw error;
  }
}
