import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { verifySession } from "@/lib/auth/verify-session";
import { adminListQuerySchema } from "@/lib/validations/admin";
import type { AdminListResponse } from "@/lib/types/database";

export async function GET(request: Request) {
  const staff = await verifySession();
  if (!staff) {
    return NextResponse.json(
      { success: false, error: "No autorizado" },
      { status: 401 }
    );
  }

  // Parse and validate query params
  const url = new URL(request.url);
  const raw = Object.fromEntries(url.searchParams.entries());
  const parsed = adminListQuerySchema.safeParse(raw);

  if (!parsed.success) {
    return NextResponse.json(
      {
        success: false,
        error: "Parámetros inválidos",
        details: parsed.error.issues.map((i) => ({
          field: String(i.path[0] ?? "unknown"),
          message: i.message,
        })),
      },
      { status: 400 }
    );
  }

  const { dni, car_plate, status, from, to, page, pageSize } = parsed.data;
  const supabase = await createClient();

  let query = supabase
    .from("appointment_requests")
    .select("*, service_catalog(name)", { count: "exact" })
    .order("created_at", { ascending: false });

  if (dni) query = query.ilike("dni", `${dni}%`);
  if (car_plate) query = query.ilike("car_plate", `${car_plate}%`);
  if (status) query = query.eq("status", status);
  if (from) query = query.gte("created_at", `${from}T00:00:00`);
  if (to) query = query.lte("created_at", `${to}T23:59:59.999`);

  const fromIdx = (page - 1) * pageSize;
  const toIdx = fromIdx + pageSize - 1;
  query = query.range(fromIdx, toIdx);

  const { data, count, error } = await query;

  if (error) {
    console.error("Failed to list appointment requests:", error);
    return NextResponse.json(
      { success: false, error: "Error al listar solicitudes" },
      { status: 500 }
    );
  }

  const response: AdminListResponse = {
    data: data ?? [],
    total: count ?? 0,
    page,
    pageSize,
  };

  return NextResponse.json(response);
}
