import type { AppointmentStatus } from "./database";

// =============================================================
// Enum + transition map
// =============================================================

/**
 * report_status enum — mirrors the Postgres enum from migration 007.
 * The DB is the source of truth; this union must stay in sync with
 * the ENUM in supabase/migrations/007_technical_reports.sql.
 */
export type ReportStatus =
  | "draft"
  | "ready_for_review"
  | "approved_for_delivery"
  | "sent";

/**
 * Caller-facing transition targets. 'sent' is intentionally excluded:
 * Phase 9 has no path that writes 'sent' (the block-into-sent trigger
 * raises if any UPDATE attempts it). Phase 10's atomic Send-PDF-and-
 * complete RPC will be the only path that writes 'sent'.
 */
export type ReportTransitionTarget = Exclude<ReportStatus, "sent">;

/**
 * Legal report state transitions per the Phase 9 plan (§4).
 * Role-gating (admin-only vs staff-allowed) is enforced separately
 * at the API layer; this map only encodes the structural state
 * machine.
 *
 * 'sent' has an empty target list — it is terminal at this layer.
 * The block-into-sent trigger guarantees no row reaches 'sent' in
 * Phase 9 regardless of this map.
 */
export const ALLOWED_REPORT_TRANSITIONS: Record<
  ReportStatus,
  ReportTransitionTarget[]
> = {
  draft: ["ready_for_review"],
  ready_for_review: ["draft", "approved_for_delivery"],
  approved_for_delivery: ["ready_for_review"],
  sent: [],
};

// =============================================================
// Row + summary + full shapes
// =============================================================

/**
 * Full technical_reports row as returned by Supabase. Timestamps
 * are ISO strings (Supabase serializes TIMESTAMPTZ that way over
 * the JSON wire). Mirrors the table defined in migration 007.
 */
export type TechnicalReportRow = {
  id: string;
  appointment_request_id: string;
  technician_staff_id: string;
  report_status: ReportStatus;
  vehicle_year: number | null;
  initial_symptoms: string;
  diagnosis_work_performed: string;
  replaced_parts: string;
  final_observations: string;
  conclusions: string;
  approved_by_admin_id: string | null;
  last_edited_by: string | null;
  pdf_storage_path: string | null; // Phase 10 — never written in Phase 9
  sent_at: string | null;          // Phase 10 — never written in Phase 9
  created_at: string;
  updated_at: string;
};

/**
 * Compact summary embedded in AppointmentDetailResponse.request so
 * the appointment-detail UI can decide between "Crear informe" and
 * "Ver informe" without an extra round-trip. Joined technician name
 * comes from a staff_profiles lookup in the route handler (soft-fail
 * to null on lookup error).
 *
 * approved_by_admin_id is included so the UI can render an
 * "Aprobado por …" hint when the report is `approved_for_delivery`.
 * sent_at is null in Phase 9 (no path writes `sent`); included now
 * so Phase 10's "informe enviado el …" rendering doesn't require
 * another type/route change.
 */
export type TechnicalReportSummary = {
  id: string;
  report_status: ReportStatus;
  technician_staff_id: string;
  technician_full_name: string | null;
  updated_at: string;
  approved_by_admin_id: string | null;
  sent_at: string | null;
};

/**
 * Full report shape for the editor page — row plus joined people
 * and a slice of the parent appointment for read-only display.
 * Used by GET /api/admin/reports/[id] and the appointment-scoped
 * GET .../report endpoint.
 */
export type TechnicalReportFull = TechnicalReportRow & {
  technician: { id: string; full_name: string } | null;
  approved_by_admin: { id: string; full_name: string } | null;
  last_editor: { id: string; full_name: string } | null;
  appointment: {
    id: string;
    car_plate: string;
    vehicle_brand: string | null;
    vehicle_model: string | null;
    full_name: string | null;
    dni: string;
    email: string;
    phone: string;
    status: AppointmentStatus;
  };
};

// =============================================================
// Input shapes (API request bodies)
// =============================================================

/**
 * POST /api/admin/appointment-requests/[id]/report — create draft.
 * For staff role the route forces technician_staff_id = auth.uid()
 * server-side regardless of what the client sends. Admin may set
 * any active staff id.
 *
 * Narrative fields are optional at creation; the content gate for
 * marking ready_for_review is enforced at the transition route,
 * not at create.
 */
export type TechnicalReportInsert = {
  appointment_request_id: string;
  technician_staff_id: string;
  vehicle_year?: number | null;
  initial_symptoms?: string;
  diagnosis_work_performed?: string;
  replaced_parts?: string;
  final_observations?: string;
  conclusions?: string;
};

/**
 * PATCH /api/admin/reports/[id] — update structured fields.
 *
 * report_status is NOT in this shape — state transitions go through
 * POST /api/admin/reports/[id]/transition. PATCH is for content edits.
 *
 * technician_staff_id is admin-only at the API layer. Staff attempts
 * to change it are blocked by RLS (the staff_update predicate forces
 * technician_staff_id = auth.uid() on both USING and WITH CHECK), and
 * the active-technician trigger validates any new value at the DB.
 */
export type TechnicalReportUpdate = {
  technician_staff_id?: string;
  vehicle_year?: number | null;
  initial_symptoms?: string;
  diagnosis_work_performed?: string;
  replaced_parts?: string;
  final_observations?: string;
  conclusions?: string;
};

/**
 * POST /api/admin/reports/[id]/transition — change report state.
 * 'sent' is excluded by ReportTransitionTarget; the route returns
 * 400 if a client somehow sends it. Role and content-gate checks
 * happen in the route handler.
 */
export type ReportTransitionInput = {
  to: ReportTransitionTarget;
};

// =============================================================
// Response shapes
// =============================================================

/**
 * GET /api/admin/reports/[id]
 * GET /api/admin/appointment-requests/[id]/report
 * (when a report exists; otherwise routes return 404 in the standard
 * ApiErrorResponse shape from database.ts)
 */
export type TechnicalReportResponse = {
  data: TechnicalReportFull;
};

/**
 * POST /api/admin/appointment-requests/[id]/report — create draft.
 * Returns the freshly created row's id and starting status. UI
 * navigates to the editor page on success.
 */
export type TechnicalReportCreateResponse = {
  success: true;
  data: {
    id: string;
    report_status: ReportStatus;
  };
};

/**
 * PATCH /api/admin/reports/[id]. Returns the updated full row so
 * the client can refresh local state (including updated_at and
 * the joined last-editor name).
 */
export type TechnicalReportUpdateResponse = {
  success: true;
  data: TechnicalReportFull;
};

/**
 * POST /api/admin/reports/[id]/transition. Returns the new state
 * plus updated_at so the editor can refresh optimistic state.
 */
export type ReportTransitionResponse = {
  success: true;
  data: {
    id: string;
    report_status: ReportStatus;
    updated_at: string;
  };
};
