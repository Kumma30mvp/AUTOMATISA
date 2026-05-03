import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireStaff } from "@/lib/auth/require";
import { customerHistoryQuerySchema } from "@/lib/validations/staff";
import type {
  CustomerHistoryItem,
  CustomerHistoryResponse,
} from "@/lib/types/history";
import type { AppointmentStatus } from "@/lib/types/database";

const HISTORY_LIMIT = 50;

type CustomerHistoryRow = {
  id: string;
  status: AppointmentStatus;
  created_at: string;
  preferred_date: string | null;
  vehicle_brand: string | null;
  vehicle_model: string | null;
  car_plate: string;
  service_id: string | null;
  service_catalog: { name: string } | null;
};

/**
 * GET /api/admin/customer-history
 * Returns up to 50 past appointments matching the given dni and/or
 * email (OR semantics — rows where either matches).
 *
 * Both admin and staff may call this. Customer privacy is preserved
 * by requiring an exact dni or email match — no fuzzy / prefix
 * search is exposed (those would enable enumeration).
 */
export async function GET(request: Request) {
  try {
    await requireStaff();

    const url = new URL(request.url);
    const raw = Object.fromEntries(url.searchParams.entries());
    const parsed = customerHistoryQuerySchema.safeParse(raw);

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

    const { dni, email } = parsed.data;
    const supabase = await createClient();

    let query = supabase
      .from("appointment_requests")
      .select(
        "id, status, created_at, preferred_date, vehicle_brand, vehicle_model, car_plate, service_id, service_catalog(name)"
      )
      .order("created_at", { ascending: false })
      .limit(HISTORY_LIMIT);

    if (dni && email) {
      query = query.or(`dni.eq.${dni},email.eq.${email}`);
    } else if (dni) {
      query = query.eq("dni", dni);
    } else if (email) {
      query = query.eq("email", email);
    }

    const { data, error } = await query;

    if (error) {
      console.error("Failed to fetch customer history:", error);
      return NextResponse.json(
        { success: false, error: "Error al obtener historial del cliente" },
        { status: 500 }
      );
    }

    const items: CustomerHistoryItem[] = (
      (data ?? []) as unknown as CustomerHistoryRow[]
    ).map((row) => ({
      id: row.id,
      status: row.status,
      created_at: row.created_at,
      preferred_date: row.preferred_date,
      vehicle_brand: row.vehicle_brand,
      vehicle_model: row.vehicle_model,
      car_plate: row.car_plate,
      service_id: row.service_id,
      service_name: row.service_catalog?.name ?? null,
    }));

    const response: CustomerHistoryResponse = { data: items };
    return NextResponse.json(response);
  } catch (error) {
    if (error instanceof NextResponse) return error;
    throw error;
  }
}
