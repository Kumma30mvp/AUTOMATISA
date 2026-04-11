import "server-only";

import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

export type VerifiedStaff = {
  userId: string;
  email: string;
  fullName: string;
  role: string;
};

/**
 * Server-side session verification — the real security boundary.
 *
 * 1. Calls supabase.auth.getUser() which validates the token against
 *    the Supabase Auth server (NOT just reading from cookies).
 * 2. Checks that the authenticated user exists in staff_profiles
 *    and is marked as active.
 *
 * Wrapped with React `cache()` so multiple calls within the same request
 * (layout + page + route handlers) only hit Supabase once.
 *
 * Returns the verified staff member or null if unauthorized.
 * Use this in every admin route handler before performing any operations.
 */
export const verifySession = cache(_verifySession);

async function _verifySession(): Promise<VerifiedStaff | null> {
  const supabase = await createClient();

  // getUser() contacts the Auth server — verified identity
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return null;
  }

  // Check staff_profiles for active staff membership
  const { data: staff, error: staffError } = await supabase
    .from("staff_profiles")
    .select("full_name, email, role, is_active")
    .eq("id", user.id)
    .single();

  if (staffError || !staff || !staff.is_active) {
    return null;
  }

  return {
    userId: user.id,
    email: staff.email,
    fullName: staff.full_name,
    role: staff.role,
  };
}
