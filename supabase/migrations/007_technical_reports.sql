-- ============================================================
-- AUTOMATISA - Technical Reports + Phase 9 Completion Guard
-- Phase 9 Step 1: introduce the technical_reports data model,
-- the report lifecycle (state machine), six DB triggers on
-- technical_reports that enforce ownership and immutability,
-- and one BEFORE UPDATE trigger on appointment_requests that
-- raises if anyone tries to set status='completada' without
-- a 'sent' technical report.
--
-- Phase 9 boundary:
--   - 'sent' is the terminal report state and can only be
--     reached via the Phase 10 atomic Send-PDF-and-complete
--     flow. The trg_30_…_block_into_sent_phase9 trigger
--     refuses any UPDATE that would set report_status='sent'
--     in Phase 9. Phase 10's first migration drops trigger 30.
--   - The Phase 8 temporary UI/API completion guards remain
--     active. They become redundant beneath this migration
--     (the DB trigger now blocks any non-'sent'-backed
--     completion) but stay because they provide a friendlier
--     user-facing message and clean Phase 8/9 separation.
--
-- Trigger naming: trg_NN_… where NN locks intra-phase ordering
-- (Postgres fires triggers within the same phase in name-
-- alphabetical order).
--
-- Reversibility: see DOWN-MIGRATION HINT block at the end.
-- ============================================================

-- -------------------------------------------------------
-- 1. report_status ENUM (idempotent guard)
-- PostgreSQL has no CREATE TYPE IF NOT EXISTS, so use a DO block.
-- -------------------------------------------------------

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'report_status') THEN
    CREATE TYPE report_status AS ENUM (
      'draft',
      'ready_for_review',
      'approved_for_delivery',
      'sent'
    );
  END IF;
END
$$;

-- -------------------------------------------------------
-- 2. technical_reports TABLE
-- One report per appointment_request (UNIQUE FK).
-- vehicle_brand/model are joined from appointment_requests at
-- read time, not duplicated. vehicle_year is new.
-- pdf_storage_path and sent_at are pre-created for Phase 10
-- and are never written by Phase 9 code.
-- -------------------------------------------------------

CREATE TABLE IF NOT EXISTS technical_reports (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_request_id   UUID NOT NULL UNIQUE
                           REFERENCES appointment_requests(id) ON DELETE RESTRICT,
  technician_staff_id      UUID NOT NULL
                           REFERENCES staff_profiles(id) ON DELETE RESTRICT,
  report_status            report_status NOT NULL DEFAULT 'draft',

  -- Structured narrative fields
  vehicle_year             INTEGER,
  initial_symptoms         TEXT NOT NULL DEFAULT '',
  diagnosis_work_performed TEXT NOT NULL DEFAULT '',
  replaced_parts           TEXT NOT NULL DEFAULT '',
  final_observations       TEXT NOT NULL DEFAULT '',
  conclusions              TEXT NOT NULL DEFAULT '',

  -- Audit metadata
  approved_by_admin_id     UUID REFERENCES staff_profiles(id) ON DELETE RESTRICT,
  last_edited_by           UUID REFERENCES staff_profiles(id) ON DELETE SET NULL,

  -- Phase 10 columns (pre-created; never written in Phase 9)
  pdf_storage_path         TEXT,
  sent_at                  TIMESTAMPTZ,

  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- -------------------------------------------------------
-- 3. INDEXES
-- -------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_technical_reports_status
  ON technical_reports(report_status);

CREATE INDEX IF NOT EXISTS idx_technical_reports_technician
  ON technical_reports(technician_staff_id, updated_at DESC);

-- -------------------------------------------------------
-- 4. TRIGGER FUNCTIONS
-- search_path is locked to public on all functions.
-- SECURITY mode is mixed by purpose:
--   - DEFINER (4.1, 4.2, 4.6): invariant checks that read other
--     tables — must see the truth regardless of caller RLS.
--   - INVOKER (4.3, 4.4, 4.5): no SELECT in the body; safer to
--     keep at INVOKER (no privilege creep).
-- -------------------------------------------------------

-- 4.1 require_confirmada — appointment must be confirmada at INSERT.
-- SECURITY DEFINER so the invariant check sees the truth regardless
-- of the caller's RLS visibility on appointment_requests. Important
-- if a future migration ever tightens that table's SELECT policy:
-- this trigger must succeed/fail on the actual row state, not on
-- what the calling user happens to see.
CREATE OR REPLACE FUNCTION public.trg_fn_technical_reports_require_confirmada()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM appointment_requests
    WHERE id = NEW.appointment_request_id AND status = 'confirmada'
  ) THEN
    RAISE EXCEPTION 'Cannot create technical report: appointment must be confirmada'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

-- 4.2 require_active_technician — technician_staff_id must reference active staff.
-- SECURITY DEFINER so the invariant check sees the truth regardless
-- of the caller's RLS visibility on staff_profiles.
CREATE OR REPLACE FUNCTION public.trg_fn_technical_reports_require_active_technician()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM staff_profiles
    WHERE id = NEW.technician_staff_id AND is_active = true
  ) THEN
    RAISE EXCEPTION 'Technical report technician must reference an active staff profile'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

-- 4.3 audit — set updated_at and last_edited_by on every UPDATE
CREATE OR REPLACE FUNCTION public.trg_fn_technical_reports_audit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();
  NEW.last_edited_by := auth.uid();
  RETURN NEW;
END;
$$;

-- 4.4 lock_sent — sent reports are immutable forever
CREATE OR REPLACE FUNCTION public.trg_fn_technical_reports_lock_sent()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF OLD.report_status = 'sent' THEN
    RAISE EXCEPTION 'Technical report is sent and immutable'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

-- 4.5 block_into_sent_phase9 — Phase 9 cannot transition into sent.
-- Phase 10's first migration DROPs this trigger so the atomic
-- Send-PDF-and-complete RPC can write 'sent' inside its transaction.
CREATE OR REPLACE FUNCTION public.trg_fn_technical_reports_block_into_sent_phase9()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF NEW.report_status = 'sent' AND OLD.report_status IS DISTINCT FROM 'sent' THEN
    RAISE EXCEPTION 'Sent state is not available in Phase 9'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

-- 4.6 appointment_require_sent_report — completion guard.
-- BEFORE UPDATE on appointment_requests. Permanent rule.
-- Predicate is = 'sent' (NOT IN ('approved_for_delivery','sent')):
-- approved_for_delivery means "ready for the customer-facing send",
-- and only the actual send (Phase 10) qualifies as completion.
-- SECURITY DEFINER so the invariant check sees the truth regardless
-- of the caller's RLS visibility on technical_reports. Phase 9 staff
-- cannot UPDATE appointment_requests at all (admin-only RLS), so
-- only admin currently triggers this — but DEFINER future-proofs
-- against any later code path (e.g., a service-role RPC) that might
-- have a narrower RLS context.
CREATE OR REPLACE FUNCTION public.trg_fn_appointment_require_sent_report()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'completada' AND OLD.status IS DISTINCT FROM 'completada' THEN
    IF NOT EXISTS (
      SELECT 1 FROM technical_reports
      WHERE appointment_request_id = NEW.id
        AND report_status = 'sent'
    ) THEN
      RAISE EXCEPTION 'Cannot complete appointment without a sent technical report'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- -------------------------------------------------------
-- 5. TRIGGER DECLARATIONS (idempotent — drop if exists, recreate)
-- Seven triggers total: six on technical_reports, one on
-- appointment_requests. Numeric prefixes lock name-alphabetical
-- firing order within the BEFORE phase. trg_00 fires first.
-- -------------------------------------------------------

DROP TRIGGER IF EXISTS trg_05_technical_reports_require_confirmada ON technical_reports;
CREATE TRIGGER trg_05_technical_reports_require_confirmada
  BEFORE INSERT ON technical_reports
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_fn_technical_reports_require_confirmada();

DROP TRIGGER IF EXISTS trg_06_technical_reports_require_active_technician_ins ON technical_reports;
CREATE TRIGGER trg_06_technical_reports_require_active_technician_ins
  BEFORE INSERT ON technical_reports
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_fn_technical_reports_require_active_technician();

-- Fires only when technician_staff_id is the column being updated.
-- Other UPDATEs (field edits, status transitions) do not re-validate
-- the technician — once a report is in flight, deactivating the
-- technician later does not retroactively block field edits. The
-- RESTRICT FK still prevents deletion of the referenced staff row.
DROP TRIGGER IF EXISTS trg_06_technical_reports_require_active_technician_upd ON technical_reports;
CREATE TRIGGER trg_06_technical_reports_require_active_technician_upd
  BEFORE UPDATE OF technician_staff_id ON technical_reports
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_fn_technical_reports_require_active_technician();

DROP TRIGGER IF EXISTS trg_10_technical_reports_audit ON technical_reports;
CREATE TRIGGER trg_10_technical_reports_audit
  BEFORE UPDATE ON technical_reports
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_fn_technical_reports_audit();

DROP TRIGGER IF EXISTS trg_20_technical_reports_lock_sent ON technical_reports;
CREATE TRIGGER trg_20_technical_reports_lock_sent
  BEFORE UPDATE ON technical_reports
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_fn_technical_reports_lock_sent();

DROP TRIGGER IF EXISTS trg_30_technical_reports_block_into_sent_phase9 ON technical_reports;
CREATE TRIGGER trg_30_technical_reports_block_into_sent_phase9
  BEFORE UPDATE ON technical_reports
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_fn_technical_reports_block_into_sent_phase9();

DROP TRIGGER IF EXISTS trg_00_appointment_require_sent_report ON appointment_requests;
CREATE TRIGGER trg_00_appointment_require_sent_report
  BEFORE UPDATE ON appointment_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_fn_appointment_require_sent_report();

-- -------------------------------------------------------
-- 6. ROW LEVEL SECURITY
-- Six policies in total. Multiple permissive policies for the
-- same command are OR-combined at evaluation time.
-- -------------------------------------------------------

ALTER TABLE technical_reports ENABLE ROW LEVEL SECURITY;

-- 6.1 SELECT — admin sees all; staff sees own reports OR
-- reports for currently-confirmada appointments.
DROP POLICY IF EXISTS "staff_select_technical_reports" ON technical_reports;
CREATE POLICY "staff_select_technical_reports"
  ON technical_reports
  FOR SELECT
  TO authenticated
  USING (
    is_active_staff() AND (
      is_admin()
      OR technician_staff_id = auth.uid()
      OR EXISTS (
        SELECT 1 FROM appointment_requests
        WHERE id = technical_reports.appointment_request_id
          AND status = 'confirmada'
      )
    )
  );

-- 6.2 INSERT — staff only as themselves; admin any active tech.
DROP POLICY IF EXISTS "staff_insert_technical_reports" ON technical_reports;
CREATE POLICY "staff_insert_technical_reports"
  ON technical_reports
  FOR INSERT
  TO authenticated
  WITH CHECK (
    is_active_staff() AND technician_staff_id = auth.uid()
  );

DROP POLICY IF EXISTS "admin_insert_technical_reports" ON technical_reports;
CREATE POLICY "admin_insert_technical_reports"
  ON technical_reports
  FOR INSERT
  TO authenticated
  WITH CHECK (is_admin());

-- 6.3 UPDATE — staff: own draft → draft|ready_for_review only;
--             admin: any non-sent state.
-- USING applies to the OLD row; WITH CHECK applies to the NEW row.
DROP POLICY IF EXISTS "staff_update_technical_reports" ON technical_reports;
CREATE POLICY "staff_update_technical_reports"
  ON technical_reports
  FOR UPDATE
  TO authenticated
  USING (
    is_active_staff()
    AND report_status = 'draft'
    AND technician_staff_id = auth.uid()
  )
  WITH CHECK (
    is_active_staff()
    AND technician_staff_id = auth.uid()
    AND report_status IN ('draft','ready_for_review')
  );

DROP POLICY IF EXISTS "admin_update_technical_reports" ON technical_reports;
CREATE POLICY "admin_update_technical_reports"
  ON technical_reports
  FOR UPDATE
  TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

-- 6.4 DELETE — admin only; rare escape hatch, no UI exposure.
DROP POLICY IF EXISTS "admin_delete_technical_reports" ON technical_reports;
CREATE POLICY "admin_delete_technical_reports"
  ON technical_reports
  FOR DELETE
  TO authenticated
  USING (is_admin());

-- -------------------------------------------------------
-- DOWN-MIGRATION HINT (for reference only — apply manually)
--
-- DROP POLICY IF EXISTS "admin_delete_technical_reports" ON technical_reports;
-- DROP POLICY IF EXISTS "admin_update_technical_reports" ON technical_reports;
-- DROP POLICY IF EXISTS "staff_update_technical_reports" ON technical_reports;
-- DROP POLICY IF EXISTS "admin_insert_technical_reports" ON technical_reports;
-- DROP POLICY IF EXISTS "staff_insert_technical_reports" ON technical_reports;
-- DROP POLICY IF EXISTS "staff_select_technical_reports" ON technical_reports;
-- DROP TRIGGER IF EXISTS trg_00_appointment_require_sent_report ON appointment_requests;
-- DROP TRIGGER IF EXISTS trg_30_technical_reports_block_into_sent_phase9 ON technical_reports;
-- DROP TRIGGER IF EXISTS trg_20_technical_reports_lock_sent ON technical_reports;
-- DROP TRIGGER IF EXISTS trg_10_technical_reports_audit ON technical_reports;
-- DROP TRIGGER IF EXISTS trg_06_technical_reports_require_active_technician_upd ON technical_reports;
-- DROP TRIGGER IF EXISTS trg_06_technical_reports_require_active_technician_ins ON technical_reports;
-- DROP TRIGGER IF EXISTS trg_05_technical_reports_require_confirmada ON technical_reports;
-- DROP FUNCTION IF EXISTS public.trg_fn_appointment_require_sent_report();
-- DROP FUNCTION IF EXISTS public.trg_fn_technical_reports_block_into_sent_phase9();
-- DROP FUNCTION IF EXISTS public.trg_fn_technical_reports_lock_sent();
-- DROP FUNCTION IF EXISTS public.trg_fn_technical_reports_audit();
-- DROP FUNCTION IF EXISTS public.trg_fn_technical_reports_require_active_technician();
-- DROP FUNCTION IF EXISTS public.trg_fn_technical_reports_require_confirmada();
-- DROP INDEX IF EXISTS idx_technical_reports_technician;
-- DROP INDEX IF EXISTS idx_technical_reports_status;
-- DROP TABLE IF EXISTS technical_reports;
-- DROP TYPE IF EXISTS report_status;
-- -------------------------------------------------------
