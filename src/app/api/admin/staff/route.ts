import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth/require";
import type { StaffListResponse, StaffSummary } from "@/lib/types/staff";

/**
 * GET /api/admin/staff
 * Returns active staff profiles for the assignment dropdown.
 * Admin-only because assignment is an admin-driven action.
 *
 * Note on the role cast: Migration 005 enforces a CHECK constraint
 * on staff_profiles.role IN ('admin','staff'), so the cast to
 * StaffRole is safe at the DB boundary. Defense-in-depth narrowing
 * for individual sessions happens in verify-session.ts.
 */
export async function GET() {
  try {
    await requireAdmin();

    const supabase = await createClient();
    const { data, error } = await supabase
      .from("staff_profiles")
      .select("id, full_name, email, role")
      .eq("is_active", true)
      .order("full_name", { ascending: true });

    if (error) {
      console.error("Failed to list staff:", error);
      return NextResponse.json(
        { success: false, error: "Error al listar staff" },
        { status: 500 }
      );
    }

    const response: StaffListResponse = {
      data: (data ?? []) as StaffSummary[],
    };
    return NextResponse.json(response);
  } catch (error) {
    if (error instanceof NextResponse) return error;
    throw error;
  }
}
