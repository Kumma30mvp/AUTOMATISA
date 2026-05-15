import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireStaff } from "@/lib/auth/require";
import { staffQueueQuerySchema } from "@/lib/validations/staff";
import type {
  AdminListResponse,
  AppointmentRequestFull,
} from "@/lib/types/database";

/**
 * GET /api/admin/staff/queue
 * Returns confirmed appointments only. Both admin and staff may
 * call it — the route always restricts to status='confirmada'
 * regardless of role.
 *
 * Why a dedicated route (vs. reusing /api/admin/appointment-requests):
 *   - The full list endpoint is admin-only (see Step 4 RBAC patch).
 *   - Staff must never see pending / cancelled / completed rows.
 *   - Filtering is enforced server-side (.eq("status","confirmada"))
 *     so a malicious query string cannot widen the result set.
 *
 * Response shape reuses AdminListResponse for UI parity with the
 * admin list (data + total + page + pageSize).
 */
export async function GET(request: Request) {
  try {
    await requireStaff();

    const url = new URL(request.url);
    const raw = Object.fromEntries(url.searchParams.entries());
    const parsed = staffQueueQuerySchema.safeParse(raw);

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

    const { page, pageSize, placa } = parsed.data;
    const supabase = await createClient();

    let query = supabase
      .from("appointment_requests")
      .select("*, service_catalog(name)", { count: "exact" })
      .eq("status", "confirmada")
      .order("preferred_date", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: false });

    // Phase 10d — optional plate filter. Exact match on the canonical
    // `XXX-XXX` form. The schema normalized the input + validated the
    // regex; no `.ilike()` (kept deterministic and avoids prefix leaks).
    if (placa) {
      query = query.eq("car_plate", placa);
    }

    const fromIdx = (page - 1) * pageSize;
    const toIdx = fromIdx + pageSize - 1;
    query = query.range(fromIdx, toIdx);

    const { data, count, error } = await query;

    if (error) {
      console.error("Failed to fetch staff queue:", error);
      return NextResponse.json(
        { success: false, error: "Error al obtener la cola" },
        { status: 500 }
      );
    }

    const response: AdminListResponse = {
      data: (data ?? []) as AppointmentRequestFull[],
      total: count ?? 0,
      page,
      pageSize,
    };
    return NextResponse.json(response);
  } catch (error) {
    if (error instanceof NextResponse) return error;
    throw error;
  }
}
