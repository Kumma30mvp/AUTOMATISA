-- ============================================================
-- AUTOMATISA - Appointment Assignment + Completion Audit
-- Phase 8 Step 2: add three nullable operational columns to
-- appointment_requests so admins can record technician
-- assignment and (later, in Phase 10) capture the completion
-- actor and timestamp.
--
-- Pure additive change. No data backfill. No policy changes.
-- No code in Phase 8 writes completed_at or completed_by_admin_id;
-- those columns are pre-created here to keep the Phase 10
-- migration small and to avoid a second ALTER on a table that
-- already carries strict format constraints.
--
-- Visibility rule (per business rule 8/9):
-- the SELECT policy on appointment_requests stays unchanged.
-- Staff sees ALL appointments, not just rows where
-- assigned_staff_id = auth.uid(). Assignment is metadata only,
-- not a visibility filter.
--
-- Reversibility: drop the index, then drop the three columns.
-- ============================================================

-- -------------------------------------------------------
-- 1. assigned_staff_id
-- Operational assignment of a technician to a confirmed
-- appointment. Nullable (no assignment yet, or cleared).
-- ON DELETE SET NULL so that removing a staff_profiles row
-- does not cascade into appointment data loss.
-- -------------------------------------------------------

ALTER TABLE appointment_requests
  ADD COLUMN IF NOT EXISTS assigned_staff_id UUID
  REFERENCES staff_profiles(id) ON DELETE SET NULL;

-- -------------------------------------------------------
-- 2. completed_at
-- Timestamp captured when an admin completes the appointment
-- via the "Send PDF and complete" flow (Phase 10). Until then
-- this column is never written.
-- -------------------------------------------------------

ALTER TABLE appointment_requests
  ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;

-- -------------------------------------------------------
-- 3. completed_by_admin_id
-- Admin who executed the completion. AUDIT metadata — once
-- Phase 10 starts writing this field, the value must be
-- preserved. ON DELETE RESTRICT prevents deletion of any
-- staff_profiles row referenced by a completed appointment.
-- Operational hygiene: deactivate departing staff with
-- is_active = false instead of deleting their row.
-- -------------------------------------------------------

ALTER TABLE appointment_requests
  ADD COLUMN IF NOT EXISTS completed_by_admin_id UUID
  REFERENCES staff_profiles(id) ON DELETE RESTRICT;

-- -------------------------------------------------------
-- 4. INDEX FOR ASSIGNMENT FILTERING
-- Supports staff workspace queries that group / filter by
-- assigned technician, and admin views that show "unassigned"
-- vs. "assigned" appointments.
-- -------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_appointment_requests_assigned_staff
  ON appointment_requests(assigned_staff_id);
