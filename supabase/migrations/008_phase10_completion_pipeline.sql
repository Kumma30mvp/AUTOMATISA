-- =============================================================================
-- Migration 008 — Phase 10 completion pipeline
-- =============================================================================
-- Purpose:
--   Lay the data + storage + RPC foundation for the atomic "Send PDF and
--   complete" workflow that ships in Phase 10. Contents:
--     1. notification_type / notification_status enums
--     2. notification_logs table + indexes + updated_at trigger + RLS
--     3. private 'technical-reports' storage bucket + restrictive RLS
--     4. trg_30 redefined as a conditional sent-guard (TRIGGER STAYS
--        INSTALLED; only the function body is replaced)
--     5. fn_send_and_complete_report (SECURITY DEFINER) + EXECUTE grants
--
-- trg_30 LIFECYCLE:
--   Phase 9 installed trg_30_technical_reports_block_into_sent_phase9 as
--   an unconditional RAISE on any UPDATE that set report_status='sent'.
--   Phase 10 KEEPS the trigger installed and uses CREATE OR REPLACE to
--   redefine the function body so it allows NEW.report_status='sent'
--   ONLY when the transaction-local GUC `app.allow_report_sent='true'`
--   is present. Direct UPDATE technical_reports SET report_status='sent'
--   from any authenticated REST or SQL session still RAISES (the GUC
--   is unset). Only fn_send_and_complete_report sets the GUC, and that
--   function has EXECUTE granted to service_role only.
--
-- SEMANTICS OF report_status = 'sent' (Option A — explicit):
--   'sent' means the report is FINALIZED AND LOCKED FOR CUSTOMER DELIVERY.
--   It is NOT proof that the email reached the customer's inbox. Email
--   delivery evidence lives entirely in notification_logs:
--     - status='sent'   on latest attempt → provider accepted the message
--     - status='failed' on latest attempt → admin must resend (plan §10)
--   This separation keeps DB consistency strong (the report+appointment
--   transition is one atomic commit), keeps retry-send a clean operation
--   that doesn't touch report_status or appointment status, and treats
--   email delivery as a best-effort notification layered on top of the
--   source-of-truth DB state.
--
-- IDEMPOTENCY:
--   - Enums use DO blocks so reapplication is a no-op.
--   - Tables use IF NOT EXISTS.
--   - Indexes use IF NOT EXISTS.
--   - Triggers use DROP IF EXISTS + CREATE.
--   - Policies use DROP IF EXISTS + CREATE.
--   - Storage bucket uses INSERT ... ON CONFLICT DO NOTHING.
--   - Functions use CREATE OR REPLACE.
--
-- REVERSIBILITY (manual rollback):
--   - To restore the Phase 9 hard block on trg_30: CREATE OR REPLACE the
--     function with the unconditional RAISE body from migration 007.
--   - To remove fn_send_and_complete_report: DROP FUNCTION (cascade not
--     needed; nothing depends on it).
--   - To remove notification_logs: DROP TABLE (no FKs point INTO it).
--     DROP TYPE notification_type, notification_status afterwards.
--   - To remove the bucket: empty it first
--     (DELETE FROM storage.objects WHERE bucket_id='technical-reports'),
--     then DELETE FROM storage.buckets WHERE id='technical-reports'.
--   - Storage policies: DROP POLICY ... ON storage.objects.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. ENUMs
-- -----------------------------------------------------------------------------

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'notification_type') THEN
    CREATE TYPE notification_type AS ENUM ('report_pdf_email');
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'notification_status') THEN
    CREATE TYPE notification_status AS ENUM ('pending', 'sent', 'failed');
  END IF;
END$$;

-- -----------------------------------------------------------------------------
-- 2. notification_logs table
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS notification_logs (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_type        notification_type NOT NULL,
  appointment_request_id   UUID NOT NULL REFERENCES appointment_requests(id) ON DELETE RESTRICT,
  technical_report_id      UUID NOT NULL REFERENCES technical_reports(id)   ON DELETE RESTRICT,
  recipient_email          TEXT NOT NULL,
  status                   notification_status NOT NULL DEFAULT 'pending',
  provider                 TEXT NOT NULL,
  provider_message_id      TEXT,
  error_message            TEXT,
  attempt                  INTEGER NOT NULL DEFAULT 1 CHECK (attempt >= 1),
  sent_at                  TIMESTAMPTZ,
  created_by               UUID REFERENCES staff_profiles(id) ON DELETE SET NULL,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE notification_logs IS
  'Audit log for outbound notifications about technical reports. Each row '
  'represents one delivery attempt. Insert-mostly: retries produce new '
  'rows with higher `attempt`. status flips happen on the row inserted '
  'for that attempt only (pending → sent or pending → failed) inside the '
  'same request.';

COMMENT ON COLUMN notification_logs.status IS
  'Lifecycle: ''pending'' on insert; UPDATEd to ''sent'' (with '
  'provider_message_id and sent_at) or ''failed'' (with error_message) by '
  'the API route after the email send completes. report_status=''sent'' on '
  'the parent technical_report does NOT imply this column is ''sent''.';

-- Indexes

CREATE INDEX IF NOT EXISTS idx_notification_logs_report_created
  ON notification_logs (technical_report_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notification_logs_appointment_created
  ON notification_logs (appointment_request_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notification_logs_status
  ON notification_logs (status);

-- updated_at trigger (reuses the helper from migration 001).

DROP TRIGGER IF EXISTS trg_notification_logs_updated_at ON notification_logs;
CREATE TRIGGER trg_notification_logs_updated_at
  BEFORE UPDATE ON notification_logs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- RLS

ALTER TABLE notification_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "staff_select_notification_logs" ON notification_logs;
CREATE POLICY "staff_select_notification_logs"
  ON notification_logs
  FOR SELECT
  TO authenticated
  USING (
    is_active_staff() AND (
      is_admin()
      OR EXISTS (
        SELECT 1 FROM technical_reports tr
         WHERE tr.id = notification_logs.technical_report_id
           AND tr.technician_staff_id = auth.uid()
      )
    )
  );

DROP POLICY IF EXISTS "admin_insert_notification_logs" ON notification_logs;
CREATE POLICY "admin_insert_notification_logs"
  ON notification_logs
  FOR INSERT
  TO authenticated
  WITH CHECK (is_admin());

DROP POLICY IF EXISTS "admin_update_notification_logs" ON notification_logs;
CREATE POLICY "admin_update_notification_logs"
  ON notification_logs
  FOR UPDATE
  TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

DROP POLICY IF EXISTS "admin_delete_notification_logs" ON notification_logs;
CREATE POLICY "admin_delete_notification_logs"
  ON notification_logs
  FOR DELETE
  TO authenticated
  USING (is_admin());

-- (Production callers go through the service-role client which bypasses
-- RLS. The admin_*_notification_logs policies above are defense-in-depth
-- so the table remains reachable through standard RLS for any future
-- admin tooling that runs under an authenticated session.)

-- -----------------------------------------------------------------------------
-- 3. Storage bucket: 'technical-reports' (private)
-- -----------------------------------------------------------------------------

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'technical-reports',
  'technical-reports',
  false,
  10485760,                                  -- 10 MB
  ARRAY['application/pdf']::text[]
)
ON CONFLICT (id) DO NOTHING;

-- Restrictive RLS on storage.objects for this bucket.
--
-- Rationale: Supabase's storage.objects table has RLS enabled and may have
-- bucket-agnostic permissive policies installed by other features (or
-- future migrations). To guarantee anon and authenticated callers cannot
-- SELECT/INSERT/UPDATE/DELETE objects in our bucket regardless of any
-- permissive policy elsewhere, we add RESTRICTIVE policies that AND with
-- existing permissive policies and force `bucket_id <> 'technical-reports'`.
--
-- service_role bypasses RLS entirely, so uploads / signed-URL minting from
-- the API route are unaffected.

DROP POLICY IF EXISTS "deny_select_technical_reports_bucket" ON storage.objects;
CREATE POLICY "deny_select_technical_reports_bucket"
  ON storage.objects
  AS RESTRICTIVE
  FOR SELECT
  TO authenticated, anon
  USING (bucket_id <> 'technical-reports');

DROP POLICY IF EXISTS "deny_insert_technical_reports_bucket" ON storage.objects;
CREATE POLICY "deny_insert_technical_reports_bucket"
  ON storage.objects
  AS RESTRICTIVE
  FOR INSERT
  TO authenticated, anon
  WITH CHECK (bucket_id <> 'technical-reports');

DROP POLICY IF EXISTS "deny_update_technical_reports_bucket" ON storage.objects;
CREATE POLICY "deny_update_technical_reports_bucket"
  ON storage.objects
  AS RESTRICTIVE
  FOR UPDATE
  TO authenticated, anon
  USING (bucket_id <> 'technical-reports')
  WITH CHECK (bucket_id <> 'technical-reports');

DROP POLICY IF EXISTS "deny_delete_technical_reports_bucket" ON storage.objects;
CREATE POLICY "deny_delete_technical_reports_bucket"
  ON storage.objects
  AS RESTRICTIVE
  FOR DELETE
  TO authenticated, anon
  USING (bucket_id <> 'technical-reports');

-- -----------------------------------------------------------------------------
-- 4. Redefine the trg_30 function body as a conditional sent-guard.
--    (Trigger stays installed under the existing trigger name.)
-- -----------------------------------------------------------------------------
-- IMPORTANT — function vs trigger naming:
--   The Phase 9 trigger declared in migration 007 is named
--     trg_30_technical_reports_block_into_sent_phase9   (the TRIGGER)
--   and is bound to the function
--     trg_fn_technical_reports_block_into_sent_phase9() (the FUNCTION)
--   Migration 007 follows the project convention of `trg_fn_…` for trigger
--   functions paired with `trg_NN_…` for the trigger itself. We redefine
--   the FUNCTION here via CREATE OR REPLACE; the trigger declaration is
--   untouched and continues to fire BEFORE UPDATE on every row.
--
-- After migration 008:
--   - Direct UPDATE technical_reports SET report_status='sent' from any
--     authenticated REST or SQL session still RAISES (the GUC is unset).
--   - fn_send_and_complete_report (below) sets the GUC transaction-locally,
--     so the UPDATE inside the RPC succeeds.
-- PostgREST does not expose pg_catalog.set_config to `authenticated`, so
-- a REST-level admin cannot interleave set_config + UPDATE within a single
-- request. Only service_role (or a SECURITY DEFINER function in `public`
-- that calls set_config) can set the flag. Code review on every new
-- SECURITY DEFINER function in `public` is the operational discipline.
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION trg_fn_technical_reports_block_into_sent_phase9()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF NEW.report_status = 'sent'
     AND OLD.report_status IS DISTINCT FROM 'sent'
     AND current_setting('app.allow_report_sent', true) IS DISTINCT FROM 'true'
  THEN
    RAISE EXCEPTION
      'Direct transitions into sent are not allowed; '
      'use fn_send_and_complete_report'
      USING ERRCODE = '22023';  -- invalid_parameter_value
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION trg_fn_technical_reports_block_into_sent_phase9() IS
  'Phase 10 conditional sent-guard backing the trg_30_technical_reports_block_into_sent_phase9 '
  'trigger. Allows NEW.report_status=''sent'' only when the transaction-local '
  'GUC `app.allow_report_sent` = ''true''. The only function that sets that '
  'GUC is fn_send_and_complete_report, which has EXECUTE granted to '
  'service_role only. The trigger and function names retain their _phase9 '
  'suffix for git-history continuity; the trigger is permanent in Phase 10. '
  'See migration header for full rationale.';

-- -----------------------------------------------------------------------------
-- 5. fn_send_and_complete_report — SECURITY DEFINER, service_role only
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION fn_send_and_complete_report(
  p_report_id UUID,
  p_pdf_path  TEXT,
  p_admin_id  UUID
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_report   technical_reports%ROWTYPE;
  v_appt     appointment_requests%ROWTYPE;
BEGIN
  -- 0a. Validate p_report_id (defense-in-depth — the API route will
  --     have done this, but the SECURITY DEFINER RPC must enforce its
  --     own preconditions independently).
  IF p_report_id IS NULL THEN
    RAISE EXCEPTION 'Report id is required'
      USING ERRCODE = '22023';
  END IF;

  -- 0b. Validate p_pdf_path: not null, not blank, and matches the
  --     storage object-path convention that pairs the path to this
  --     report id. Prevents a misconfigured caller from writing a
  --     stored path that points to another report's PDF.
  IF p_pdf_path IS NULL OR btrim(p_pdf_path) = '' THEN
    RAISE EXCEPTION 'PDF storage path is required'
      USING ERRCODE = '22023';
  END IF;
  IF p_pdf_path NOT LIKE ('reports/' || p_report_id::text || '/%.pdf') THEN
    RAISE EXCEPTION
      'PDF storage path does not match report id (expected reports/%/...pdf, got %)',
      p_report_id, p_pdf_path
      USING ERRCODE = '22023';
  END IF;

  -- 0c. Validate p_admin_id: not null, references an active admin
  --     staff profile. The completion audit columns
  --     (appointment_requests.completed_by_admin_id) will hold this
  --     value forever; we refuse to write a stale or non-admin id.
  IF p_admin_id IS NULL OR NOT EXISTS (
    SELECT 1
      FROM staff_profiles
     WHERE id        = p_admin_id
       AND role      = 'admin'
       AND is_active = true
  ) THEN
    RAISE EXCEPTION 'Active admin id is required'
      USING ERRCODE = '22023';
  END IF;

  -- 1. Lock the report row; verify it's in approved_for_delivery.
  SELECT * INTO v_report
    FROM technical_reports
   WHERE id = p_report_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Technical report % not found', p_report_id
      USING ERRCODE = 'P0002';  -- no_data_found
  END IF;
  IF v_report.report_status <> 'approved_for_delivery' THEN
    RAISE EXCEPTION
      'Report % is not in approved_for_delivery (was %)',
      p_report_id, v_report.report_status
      USING ERRCODE = '22023';  -- invalid_parameter_value
  END IF;

  -- 2. Lock the parent appointment; verify confirmada.
  SELECT * INTO v_appt
    FROM appointment_requests
   WHERE id = v_report.appointment_request_id
   FOR UPDATE;
  IF v_appt.status <> 'confirmada' THEN
    RAISE EXCEPTION
      'Appointment % is not confirmada (was %)',
      v_appt.id, v_appt.status
      USING ERRCODE = '22023';
  END IF;

  -- 3. Open the conditional sent-guard for this transaction only.
  --    set_config(.., is_local := true) ties the GUC to the current
  --    transaction; it auto-resets at COMMIT or ROLLBACK.
  PERFORM set_config('app.allow_report_sent', 'true', true);

  -- 4. Mark report as sent.
  UPDATE technical_reports
     SET report_status    = 'sent',
         sent_at          = now(),
         pdf_storage_path = p_pdf_path
   WHERE id = p_report_id;

  -- 5. Mark appointment as completada. trg_00_appointment_require_sent_report
  --    sees the report we just updated (same transaction) → its EXISTS
  --    subquery returns true → no RAISE. completed_at and
  --    completed_by_admin_id are written atomically with the status
  --    transition, so the canonical completion path can never leave them
  --    null.
  UPDATE appointment_requests
     SET status                = 'completada',
         completed_at          = now(),
         completed_by_admin_id = p_admin_id
   WHERE id = v_appt.id;
END;
$$;

COMMENT ON FUNCTION fn_send_and_complete_report(UUID, TEXT, UUID) IS
  'Phase 10 atomic Send-PDF-and-complete RPC. SECURITY DEFINER + EXECUTE '
  'granted to service_role only. Sets app.allow_report_sent=true for the '
  'current transaction so trg_30''s conditional guard allows the report '
  'to transition into ''sent''. Marks the parent appointment as '
  '''completada'' in the same transaction so completed_at and '
  'completed_by_admin_id are never left null. The API route owns the '
  'notification_logs lifecycle (this function does NOT touch that table) '
  'and side effects (PDF gen, storage upload, email send) stay in Node '
  'where retries are easier.';

REVOKE ALL ON FUNCTION fn_send_and_complete_report(UUID, TEXT, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION fn_send_and_complete_report(UUID, TEXT, UUID) FROM authenticated;
GRANT EXECUTE ON FUNCTION fn_send_and_complete_report(UUID, TEXT, UUID) TO service_role;

COMMIT;
