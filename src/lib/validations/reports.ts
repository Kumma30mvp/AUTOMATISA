import { z } from "zod";
import type { TechnicalReportRow } from "@/lib/types/reports";

// Per-narrative-section length cap. The DB stores TEXT (unbounded);
// this cap is a UI/UX guard analogous to the appointment form's
// problem_description max (2000). 5000 per section accommodates a
// detailed technical report (~25k total when fully filled).
const NARRATIVE_MAX = 5000;

// Vehicle year accepts model years from 1900 through next-year+1
// (allows pre-orders / bleeding-edge models). Tightened later if
// data shows a narrower range is appropriate.
const VEHICLE_YEAR_MIN = 1900;
const VEHICLE_YEAR_MAX = new Date().getFullYear() + 1;

// =============================================================
// Create / Update / Transition schemas
// =============================================================

/**
 * POST /api/admin/appointment-requests/[id]/report — body schema.
 * `appointment_request_id` comes from the URL path, not the body.
 *
 * `technician_staff_id` is optional at the schema layer because:
 *   - Staff callers omit it; the route forces it to `session.userId`
 *     (`auth.uid()`) server-side.
 *   - Admin callers must provide it; the route enforces presence
 *     with a 400 + field-level detail if missing, and additionally
 *     pre-checks that it references an active staff profile.
 * The DB trigger `trg_06_…_require_active_technician_ins` is the
 * safety net for the active-staff invariant in either case.
 *
 * Narrative fields default to '' so the DB NOT NULL DEFAULT ''
 * columns are populated cleanly. The content gate for transitioning
 * to ready_for_review is enforced separately at the transition
 * route, NOT here.
 *
 * .strict() rejects unknown keys (defense against `report_status`
 * leakage and other unintended field smuggling).
 */
export const reportCreateSchema = z
  .object({
    technician_staff_id: z.string().uuid().optional(),
    vehicle_year: z
      .number()
      .int()
      .min(VEHICLE_YEAR_MIN)
      .max(VEHICLE_YEAR_MAX)
      .nullable()
      .optional(),
    initial_symptoms: z
      .string()
      .trim()
      .max(NARRATIVE_MAX)
      .default(""),
    diagnosis_work_performed: z
      .string()
      .trim()
      .max(NARRATIVE_MAX)
      .default(""),
    replaced_parts: z
      .string()
      .trim()
      .max(NARRATIVE_MAX)
      .default(""),
    final_observations: z
      .string()
      .trim()
      .max(NARRATIVE_MAX)
      .default(""),
    conclusions: z
      .string()
      .trim()
      .max(NARRATIVE_MAX)
      .default(""),
  })
  .strict();

export type ReportCreateInput = z.infer<typeof reportCreateSchema>;

/**
 * PATCH /api/admin/reports/[id] — body schema.
 *
 * report_status is intentionally NOT in this schema. .strict() rejects
 * any attempt to set it via PATCH. State transitions go through
 * POST /api/admin/reports/[id]/transition instead.
 *
 * technician_staff_id is admin-only at the API layer; staff attempts
 * to change it are blocked by RLS (the staff_update predicate forces
 * technician_staff_id = auth.uid() on both USING and WITH CHECK).
 *
 * All fields are optional; the route accepts any subset. Empty
 * narrative strings ARE valid here — they only fail the content gate
 * when transitioning to ready_for_review.
 */
export const reportUpdateSchema = z
  .object({
    technician_staff_id: z.string().uuid().optional(),
    vehicle_year: z
      .number()
      .int()
      .min(VEHICLE_YEAR_MIN)
      .max(VEHICLE_YEAR_MAX)
      .nullable()
      .optional(),
    initial_symptoms: z.string().trim().max(NARRATIVE_MAX).optional(),
    diagnosis_work_performed: z
      .string()
      .trim()
      .max(NARRATIVE_MAX)
      .optional(),
    replaced_parts: z.string().trim().max(NARRATIVE_MAX).optional(),
    final_observations: z.string().trim().max(NARRATIVE_MAX).optional(),
    conclusions: z.string().trim().max(NARRATIVE_MAX).optional(),
  })
  .strict();

export type ReportUpdateInput = z.infer<typeof reportUpdateSchema>;

/**
 * POST /api/admin/reports/[id]/transition — body schema.
 *
 * Excludes 'sent' from the enum: Phase 9 has no path that writes
 * 'sent' (the block-into-sent trigger raises). If a client sends
 * 'sent', zod returns "Invalid enum value" → route returns 400.
 * Phase 10's atomic Send-PDF-and-complete RPC is the only path to
 * 'sent', and that path does not flow through this schema.
 *
 * Role-gating (admin-only for approve / unapprove / send-back; staff
 * allowed only for own draft → ready_for_review) is enforced at the
 * route handler.
 */
export const reportTransitionSchema = z
  .object({
    to: z.enum(["draft", "ready_for_review", "approved_for_delivery"]),
  })
  .strict();

export type ReportTransitionInputParsed = z.infer<
  typeof reportTransitionSchema
>;

// =============================================================
// Content gate for draft → ready_for_review
// =============================================================

export type ContentGateField =
  | "initial_symptoms"
  | "diagnosis_work_performed"
  | "final_observations"
  | "conclusions";

export type ContentGateFailure = {
  field: ContentGateField;
  message: string;
};

export type ContentGateResult =
  | { ok: true }
  | { ok: false; missing: ContentGateFailure[] };

/**
 * Asserts a report has all the narrative content required to leave
 * 'draft' for 'ready_for_review'. Required-non-empty (after .trim()):
 *   - initial_symptoms
 *   - diagnosis_work_performed
 *   - final_observations
 *   - conclusions
 *
 * `replaced_parts` and `vehicle_year` are intentionally NOT required
 * (some service types have no parts replaced; the year is optional
 * metadata).
 *
 * Used by the transition route only — never at create or PATCH.
 *
 * Returns a discriminated union so the caller can convert a failure
 * into a 400 ApiErrorResponse with field-level details.
 */
export function reportReadyForReviewContentGate(
  content: Pick<TechnicalReportRow, ContentGateField>
): ContentGateResult {
  const required: ContentGateField[] = [
    "initial_symptoms",
    "diagnosis_work_performed",
    "final_observations",
    "conclusions",
  ];
  const missing: ContentGateFailure[] = required
    .filter((field) => content[field].trim() === "")
    .map((field) => ({ field, message: "Sección obligatoria" }));
  return missing.length === 0 ? { ok: true } : { ok: false, missing };
}
