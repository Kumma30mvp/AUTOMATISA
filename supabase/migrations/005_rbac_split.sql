-- ============================================================
-- AUTOMATISA - RBAC Split (admin vs staff)
-- Phase 8 Step 1: tighten role values, add is_admin(),
-- restrict appointment status writes, history inserts, and all
-- destructive operations to admin only.
--
-- Backwards compatibility: all SELECT policies (staff visibility)
-- remain untouched. The public anon INSERT path on
-- appointment_requests is unaffected. Triggers 003 (SECURITY
-- DEFINER) and 004 (SECURITY INVOKER) continue to work.
--
-- DELETE-policy rationale: before 005 there were no DELETE
-- policies on these tables, so DELETEs were already implicitly
-- denied (RLS denies anything that has no matching policy).
-- We add explicit admin-only DELETE policies to make intent
-- auditable, give admin a controlled escape hatch for emergency
-- corrections, and prevent a future migration from accidentally
-- enabling broader DELETE.
--
-- Reversibility: to roll back, drop staff_profiles_role_check,
-- drop is_admin(), drop the four admin_* policies created here,
-- and recreate the original staff_update_appointment_requests
-- and staff_insert_status_history policies (predicate:
-- is_active_staff()).
-- ============================================================

-- -------------------------------------------------------
-- 1. NORMALIZE EXISTING ROLES
-- Safety-first: any unknown / NULL role becomes 'staff'
-- (NOT 'admin') so accidental data never grants elevated rights.
-- -------------------------------------------------------

UPDATE staff_profiles
SET role = 'staff'
WHERE role IS NULL OR role NOT IN ('admin', 'staff');

-- -------------------------------------------------------
-- 2. CONSTRAIN role COLUMN
-- -------------------------------------------------------

ALTER TABLE staff_profiles
  DROP CONSTRAINT IF EXISTS staff_profiles_role_check;

ALTER TABLE staff_profiles
  ADD CONSTRAINT staff_profiles_role_check
  CHECK (role IN ('admin', 'staff'));

-- -------------------------------------------------------
-- 3. is_admin() HELPER
-- Mirrors is_active_staff() shape. STABLE so the planner can
-- cache within a statement. SECURITY INVOKER so the helper
-- runs under the calling user's permissions when read by RLS.
-- -------------------------------------------------------

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM staff_profiles
    WHERE id = auth.uid()
      AND is_active = true
      AND role = 'admin'
  );
$$;

-- -------------------------------------------------------
-- 4. appointment_requests: UPDATE -> admin only
-- Staff retains SELECT via the existing policy
-- (is_active_staff()). Only admins can modify status,
-- assignment, completion fields, etc.
--
-- USING vs WITH CHECK on UPDATE policies:
--   USING      = predicate evaluated against the OLD row.
--                Determines which existing rows the user is
--                allowed to target with UPDATE.
--   WITH CHECK = predicate evaluated against the NEW row
--                (post-modification). Determines whether the
--                resulting row is allowed to exist.
-- For admin-only writes we use is_admin() in BOTH so that:
--   (a) only admins can target a row (USING), and
--   (b) only admins can produce the new state (WITH CHECK)
-- -- a non-admin who somehow had USING access could not still
-- mutate the row into a state they aren't allowed to author.
-- The same predicate on both halves is the standard
-- defense-in-depth shape for "this role owns this table".
-- -------------------------------------------------------

DROP POLICY IF EXISTS "staff_update_appointment_requests" ON appointment_requests;

CREATE POLICY "admin_update_appointment_requests"
  ON appointment_requests
  FOR UPDATE
  TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

-- -------------------------------------------------------
-- 5. appointment_requests: DELETE -> admin only
-- Explicit carve-out (see header rationale).
-- DELETE policies use USING only (no WITH CHECK applies because
-- DELETE produces no new row to validate).
-- -------------------------------------------------------

DROP POLICY IF EXISTS "staff_delete_appointment_requests" ON appointment_requests;

CREATE POLICY "admin_delete_appointment_requests"
  ON appointment_requests
  FOR DELETE
  TO authenticated
  USING (is_admin());

-- -------------------------------------------------------
-- 6. appointment_status_history: INSERT -> admin only
-- Trigger 004 (SECURITY INVOKER) writes here when an admin
-- changes status. After this migration, only admins can satisfy
-- the WITH CHECK predicate, which mirrors the new admin-only
-- UPDATE policy on appointment_requests.
-- Trigger 003 (SECURITY DEFINER) bypasses RLS; it continues to
-- write the initial 'pendiente' row on anon INSERTs.
-- INSERT policies use WITH CHECK only (no USING applies because
-- INSERT has no pre-existing row to filter).
-- -------------------------------------------------------

DROP POLICY IF EXISTS "staff_insert_status_history" ON appointment_status_history;

CREATE POLICY "admin_insert_status_history"
  ON appointment_status_history
  FOR INSERT
  TO authenticated
  WITH CHECK (is_admin());

-- -------------------------------------------------------
-- 7. appointment_status_history: DELETE -> admin only
-- History is append-only by design. This policy exists for
-- emergency correction by an admin, never for routine use.
-- -------------------------------------------------------

DROP POLICY IF EXISTS "staff_delete_status_history" ON appointment_status_history;

CREATE POLICY "admin_delete_status_history"
  ON appointment_status_history
  FOR DELETE
  TO authenticated
  USING (is_admin());

-- -------------------------------------------------------
-- NOTE ON ANON INSERT POLICY
-- "anon_insert_status_history" was already dropped in
-- migration 003 (line 55). We do not touch it here.
-- -------------------------------------------------------
