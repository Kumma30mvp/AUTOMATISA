import "server-only";

import { NextResponse } from "next/server";
import { verifySession, type VerifiedStaff } from "./verify-session";

/**
 * Verified staff member that is guaranteed to be an admin.
 * Returned by requireAdmin() so callers get type-safe access
 * to admin-only operations without re-checking the role.
 */
export type AdminStaff = VerifiedStaff & { role: "admin" };

/**
 * Authorization helpers for API route handlers.
 *
 * Both helpers wrap verifySession() and THROW a NextResponse on
 * failure (401 if unauthenticated, 403 if authenticated but not
 * admin). Route handlers must catch and return that response:
 *
 *   try {
 *     const admin = await requireAdmin();
 *     // ... admin-only work
 *     return NextResponse.json({ success: true, ... });
 *   } catch (error) {
 *     if (error instanceof NextResponse) return error;
 *     throw error; // unexpected — let Next.js convert to 500
 *   }
 *
 * Defense-in-depth: every admin-only mutation route calls
 * requireAdmin() at entry AND relies on RLS (Migration 005) as
 * the underlying safety net. Code-level enforcement gives clean
 * 4xx responses; RLS ensures security holds even if a route
 * forgets the check.
 *
 * Server components / layouts should continue to call
 * verifySession() directly and handle the null case with
 * `redirect()`. These helpers are designed for route handlers
 * where throwing a Response is the cleaner control flow.
 */

const UNAUTHENTICATED_RESPONSE = () =>
  NextResponse.json(
    { success: false, error: "No autorizado" },
    { status: 401 }
  );

const FORBIDDEN_ADMIN_RESPONSE = () =>
  NextResponse.json(
    { success: false, error: "Permisos de administrador requeridos" },
    { status: 403 }
  );

/**
 * Resolves to the verified staff member (admin or staff).
 * Throws a 401 NextResponse if no valid session exists.
 */
export async function requireStaff(): Promise<VerifiedStaff> {
  const session = await verifySession();
  if (!session) {
    throw UNAUTHENTICATED_RESPONSE();
  }
  return session;
}

/**
 * Resolves to the verified admin. Throws 401 if no session,
 * 403 if the session is staff-only.
 *
 * The returned type is narrowed to `role: "admin"` so downstream
 * code can rely on the role at compile time.
 */
export async function requireAdmin(): Promise<AdminStaff> {
  const session = await requireStaff();
  if (session.role !== "admin") {
    throw FORBIDDEN_ADMIN_RESPONSE();
  }
  return session as AdminStaff;
}
