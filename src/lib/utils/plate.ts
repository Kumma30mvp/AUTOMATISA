/**
 * Phase 10d — shared plate-format utilities.
 *
 * Pure functions only. No zod, no Next.js, no Supabase, no
 * "use server" / "use client" directive — safe to import from both
 * server modules (validations, route handlers) and client components
 * (filter inputs, public form) without pulling validation/schema code
 * into the client bundle.
 *
 * Canonical regex matches the migration 009 DB CHECK
 * (`appointment_requests_car_plate_format`) and the public form's
 * PLATE_REGEX in src/lib/validations/appointment.ts. Both groups
 * accept alphanumeric characters.
 */

export const PLATE_REGEX = /^[A-Z0-9]{3}-[A-Z0-9]{3}$/;

/**
 * Normalize a user-typed plate to the canonical `XXX-XXX` form.
 *
 *   - strips spaces and any non-alphanumeric separators
 *   - uppercases
 *   - inserts a hyphen between position 3 and 4 if the cleaned value is
 *     exactly 6 alphanumeric characters; otherwise returns the cleaned
 *     value as-is (caller decides how to surface "incomplete" input)
 *
 * Behaviour examples:
 *   - "abc123"  → "ABC-123"
 *   - "a1b2c3"  → "A1B-2C3"
 *   - "A1B 2C3" → "A1B-2C3"
 *   - "xy"      → "XY"      (under 6 chars; not yet a valid plate)
 *   - "abc12345"→ "ABC1234"  (over 6 chars; caller can reject)
 */
export function normalizePlate(raw: string): string {
  const cleaned = raw.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
  if (cleaned.length === 6) {
    return `${cleaned.slice(0, 3)}-${cleaned.slice(3)}`;
  }
  return cleaned;
}
