import "server-only";

import { cache } from "react";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

export const StaffRoleSchema = z.enum(["admin", "staff"]);
export type StaffRole = z.infer<typeof StaffRoleSchema>;

export type VerifiedStaff = {
  userId: string;
  email: string;
  fullName: string;
  role: StaffRole;
};

/**
 * Server-side session verification — the real security boundary.
 *
 * 1. Calls supabase.auth.getUser() which validates the token against
 *    the Supabase Auth server (NOT just reading from cookies).
 * 2. Checks that the authenticated user exists in staff_profiles
 *    and is marked as active.
 * 3. Parses the role with StaffRoleSchema. Anything outside
 *    {'admin','staff'} is treated as unauthenticated (fail-closed).
 *    Migration 005 adds a CHECK constraint that prevents bad role
 *    values at write time; this parse is the second line of defense.
 *
 * Wrapped with React `cache()` so multiple calls within the same request
 * (layout + page + route handlers) only hit Supabase once.
 *
 * Returns the verified staff member or null if unauthorized.
 */
export const verifySession = cache(_verifySession);

async function _verifySession(): Promise<VerifiedStaff | null> {
  const supabase = await createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return null;
  }

  const { data: staff, error: staffError } = await supabase
    .from("staff_profiles")
    .select("full_name, email, role, is_active")
    .eq("id", user.id)
    .single();

  if (staffError || !staff || !staff.is_active) {
    return null;
  }

  const roleParse = StaffRoleSchema.safeParse(staff.role);
  if (!roleParse.success) {
    return null;
  }

  return {
    userId: user.id,
    email: staff.email,
    fullName: staff.full_name,
    role: roleParse.data,
  };
}
