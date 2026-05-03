import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireStaff } from "@/lib/auth/require";
import { vehicleHistoryQuerySchema } from "@/lib/validations/staff";
import type {
  VehicleHistoryItem,
  VehicleHistoryResponse,
} from "@/lib/types/history";
import type { AppointmentStatus } from "@/lib/types/database";

const HISTORY_LIMIT = 50;

type VehicleHistoryRow = {
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
 * GET /api/admin/vehicle-history
 * Returns up to 50 past appointments for a given license plate.
 * Lookup uses ILIKE (no wildcards) for case-insensitive exact
 * match against historical rows that may differ in stored case.
 *
 * Both admin and staff may call this.
 */
export async function GET(request: Request) {
  try {
    await requireStaff();

    const url = new URL(request.url);
    const raw = Object.fromEntries(url.searchParams.entries());
    const parsed = vehicleHistoryQuerySchema.safeParse(raw);

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

    const { car_plate } = parsed.data;
    const supabase = await createClient();

    const { data, error } = await supabase
      .from("appointment_requests")
      .select(
        "id, status, created_at, preferred_date, vehicle_brand, vehicle_model, car_plate, service_id, service_catalog(name)"
      )
      .ilike("car_plate", car_plate)
      .order("created_at", { ascending: false })
      .limit(HISTORY_LIMIT);

    if (error) {
      console.error("Failed to fetch vehicle history:", error);
      return NextResponse.json(
        { success: false, error: "Error al obtener historial vehicular" },
        { status: 500 }
      );
    }

    const items: VehicleHistoryItem[] = (
      (data ?? []) as unknown as VehicleHistoryRow[]
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

    const response: VehicleHistoryResponse = { data: items };
    return NextResponse.json(response);
  } catch (error) {
    if (error instanceof NextResponse) return error;
    throw error;
  }
}
