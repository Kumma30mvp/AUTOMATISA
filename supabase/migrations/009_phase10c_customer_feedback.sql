-- =============================================================================
-- Migration 009 — Phase 10c customer-feedback adjustments
-- =============================================================================
-- Purpose:
--   Reshape the public appointment surface and the notification audit log
--   to support the Phase 10c customer feedback:
--     1. Document-type selector (DNI ↔ 8 digits / RUC ↔ 11 digits).
--     2. Email becomes optional/legacy (no longer collected by the public
--        form; still kept for the Phase 10/10b SMTP path during transition).
--     3. Phone tightened to exactly 9 digits, stored raw (no '+51').
--     4. Vehicle plate strict canonical form: `^[A-Z0-9]{3}-[A-Z0-9]{3}$`.
--     5. Preferred date may not be a Sunday (DB last-line-of-defense).
--     6. `notification_logs` accepts a phone recipient (WhatsApp manual
--        handoff path) in addition to the historical email recipient.
--     7. `notification_type` extended with 'report_pdf_whatsapp'.
--
-- This migration does NOT:
--   - Change `fn_send_and_complete_report`, `trg_00`, `trg_20`, `trg_30`,
--     `is_admin()`, RLS policies, or storage bucket configuration.
--   - Drop the legacy `dni` column from `appointment_requests`. It is
--     relaxed (NULL allowed, CHECK removed) so future INSERTs can omit
--     it; historical values are preserved.
--   - Remove the Phase 10/10b SMTP code path. The email column stays
--     populated for any prior rows so the legacy resend path still works.
--   - Validate the preferred_date Sunday CHECK against historical data
--     (added as NOT VALID — see §7).
--
-- =============================================================================
-- ASSUMPTIONS about existing data
-- =============================================================================
--   A1. Every row of `appointment_requests` currently has `dni` set to
--       exactly 8 digits (enforced by the CHECK from migration 001).
--   A2. Every row has non-null `email`, `phone`, `car_plate`, populated by
--       the CHECKs from migration 001.
--   A3. `phone` values may be stored as one of: `+51XXXXXXXXX`,
--       `+51 XXX XXX XXX`, `51XXXXXXXXX`, or `XXXXXXXXX`. The normalization
--       step below collapses all four into the 9-digit canonical form.
--   A4. `car_plate` values may be mixed-case and may or may not contain
--       a hyphen, but every value collapses to exactly 6 alphanumerics
--       (the legacy CHECK `^[A-Za-z0-9-]{3,10}$` allows other shapes;
--       preflight Q2 surfaces any outlier).
--   A5. `notification_logs` currently has zero rows with `recipient_email
--       IS NULL` (Phase 10 enforced NOT NULL).
--   A6. PostgreSQL is on Supabase, version 12+ — `ALTER TYPE … ADD VALUE`
--       is allowed inside a transaction (we still keep it outside the
--       main transaction below for cross-version clarity).
--   A7. `preferred_time` (TIME) and `additional_notes` (TEXT) are already
--       NULLABLE with NO CHECK constraints in migration 001 (confirmed by
--       direct read of 001 line 94/95 and grep across the migrations
--       directory: no trigger references either). The Phase 10c public
--       form stops submitting them; new rows just leave them NULL. NO
--       SQL change is needed here. They are mentioned explicitly so
--       reviewers know the column gap was inspected, not overlooked.
--   A8. The Phase 1 column-format CHECK constraints are named with the
--       `_format` suffix (`appointment_requests_dni_format`,
--       `_phone_format`, `_email_format`, `_car_plate_format`), NOT the
--       PG-default `_check` suffix. This migration's `DROP CONSTRAINT IF
--       EXISTS …` statements use the correct `_format` names.
--
-- If any assumption fails, the preflight queries below surface it before
-- the migration runs. If the migration's automatic normalization can't
-- coerce a row into the new shape, the CHECK creation fails and the
-- transaction rolls back — no silent data corruption.
--
-- =============================================================================
-- PREFLIGHT — RUN BEFORE APPLYING
-- =============================================================================
-- Paste each query into the Supabase SQL Editor and inspect the result.
-- Non-zero counts on Q1/Q2/Q3 indicate rows the auto-normalization will
-- have to touch. Q4 is informational only (Sunday CHECK is added NOT
-- VALID and never auto-fails historical rows). Q5 should always be 0
-- under Phase 10 invariants.
--
--   -- Q1. Phones that won't normalize to exactly 9 digits.
--   SELECT id, phone
--     FROM appointment_requests
--    WHERE length(regexp_replace(regexp_replace(phone, '^\+?51', ''), '\D', '', 'g')) <> 9;
--
--   -- Q2. Car plates that won't collapse to exactly 6 alphanumerics.
--   SELECT id, car_plate
--     FROM appointment_requests
--    WHERE length(regexp_replace(upper(car_plate), '[^A-Z0-9]', '', 'g')) <> 6;
--
--   -- Q3. DNIs that aren't exactly 8 digits (assumption A1 sanity).
--   SELECT id, dni
--     FROM appointment_requests
--    WHERE dni IS NULL OR dni !~ '^\d{8}$';
--
--   -- Q4. preferred_date values that fall on a Sunday. Historical rows
--   --     stay; new INSERTs are blocked by the CHECK. To validate the
--   --     constraint after cleanup: ALTER TABLE appointment_requests
--   --     VALIDATE CONSTRAINT appointment_requests_preferred_date_not_sunday;
--   SELECT id, preferred_date
--     FROM appointment_requests
--    WHERE preferred_date IS NOT NULL
--      AND EXTRACT(DOW FROM preferred_date) = 0;
--
--   -- Q5. notification_logs sanity — every prior row should carry an email.
--   SELECT count(*) AS null_email_rows
--     FROM notification_logs
--    WHERE recipient_email IS NULL;
--
-- If Q1 or Q2 surface bad rows, decide:
--   (a) Trust the inline normalization (recommended for staging — it will
--       fix `+51` and missing hyphens; any unfixable row fails the
--       CHECK ADD and rolls back), OR
--   (b) Manually clean those rows first.
-- If Q3 returns rows, the assumption that legacy DNIs are 8 digits is
-- wrong; pause and investigate before re-running.
-- =============================================================================

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- §1. document_type ENUM
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'document_type') THEN
    CREATE TYPE document_type AS ENUM ('DNI', 'RUC');
  END IF;
END$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- §2. appointment_requests: document_type + document_number columns
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE appointment_requests
  ADD COLUMN IF NOT EXISTS document_type   document_type,
  ADD COLUMN IF NOT EXISTS document_number TEXT;

-- Backfill from `dni`. Per A1, every prior row had `dni` = 8 digits, so
-- every backfilled row is consistent with `document_type='DNI'`. We
-- backfill rather than alias because we want a clean migration target
-- and to drop the loose `dni` CHECK afterward.
UPDATE appointment_requests
   SET document_type   = 'DNI',
       document_number = dni
 WHERE document_type IS NULL;

-- Lock the new columns required for any future INSERT.
ALTER TABLE appointment_requests
  ALTER COLUMN document_type   SET NOT NULL,
  ALTER COLUMN document_number SET NOT NULL;

-- Strict CHECK enforces the (type, length) invariant.
ALTER TABLE appointment_requests
  ADD CONSTRAINT appointment_requests_document_number_format CHECK (
    (document_type = 'DNI' AND document_number ~ '^\d{8}$') OR
    (document_type = 'RUC' AND document_number ~ '^\d{11}$')
  );

COMMENT ON COLUMN appointment_requests.document_type   IS
  'Phase 10c. DNI (8 digits) or RUC (11 digits). Required for new submissions.';
COMMENT ON COLUMN appointment_requests.document_number IS
  'Phase 10c. Replaces the legacy `dni` column at the application layer; '
  'historical rows are backfilled from `dni` with document_type=DNI.';

-- ─────────────────────────────────────────────────────────────────────────────
-- §3. Relax legacy `dni` column (NOT NULL only — keep the format CHECK)
-- ─────────────────────────────────────────────────────────────────────────────
-- Keep the column for backwards compatibility (UI / SMTP path may still
-- reference it during the Phase 10c transition). Drop the NOT NULL so
-- new INSERTs may omit it.
--
-- The Phase 1 format CHECK `^\d{8}$` STAYS in place. SQL CHECK semantics
-- treat NULL as UNKNOWN → CHECK passes on NULL, so future INSERTs that
-- omit `dni` are fine. The CHECK only fires on non-NULL values, which
-- safeguards any code that still writes a legacy `dni` value (it must
-- still be 8 digits). A future cleanup migration can DROP the column
-- entirely once nothing reads from it.
ALTER TABLE appointment_requests ALTER COLUMN dni DROP NOT NULL;

COMMENT ON COLUMN appointment_requests.dni IS
  'Phase 10c (legacy). Use document_type+document_number for new code. '
  'Kept nullable for backwards compatibility; the `^\d{8}$` format CHECK '
  'still fires on non-NULL writes. Will be dropped in a future migration.';

-- ─────────────────────────────────────────────────────────────────────────────
-- §4. Relax `email` column (NOT NULL only — keep the format CHECK)
-- ─────────────────────────────────────────────────────────────────────────────
-- Email becomes optional. Phase 10c removes it from the public form, but
-- the column stays populated for historical rows and the legacy SMTP
-- delivery path. New INSERTs may omit `email`.
--
-- The Phase 1 format CHECK stays in place for the same reason as §3:
-- NULL passes by SQL CHECK semantics; non-NULL values must still be
-- well-formed addresses.
ALTER TABLE appointment_requests ALTER COLUMN email DROP NOT NULL;

COMMENT ON COLUMN appointment_requests.email IS
  'Phase 10c. Optional/legacy. Historical rows keep their value. New '
  'submissions through the simplified public form omit this field. The '
  'Phase 10/10b SMTP path still reads it when present.';

-- ─────────────────────────────────────────────────────────────────────────────
-- §4.5. preferred_time + additional_notes — NO SQL CHANGE NEEDED
-- ─────────────────────────────────────────────────────────────────────────────
-- The customer asked for these to be removed from the public form. Both
-- columns are already NULLABLE in migration 001 with no CHECK constraints
-- and no trigger references (confirmed by grep across the migrations
-- directory). The application stops sending them; new rows leave them
-- NULL automatically. This block is intentionally a no-op for documentation
-- continuity.

-- ─────────────────────────────────────────────────────────────────────────────
-- §5. phone: normalize existing data, then tighten the CHECK
-- ─────────────────────────────────────────────────────────────────────────────
-- Safe normalization:
--   1. Strip every non-digit (handles `+51 999 888 777`, `(999) 888-777`,
--      and similar formatting noise).
--   2. If the result is exactly 11 digits AND starts with `51`, drop the
--      leading `51` (a country-coded form). Otherwise keep as-is.
-- This deliberately avoids naively stripping `^\+?51` from a valid raw
-- 9-digit number that happens to start with `51X`. After this pass,
-- every row should be exactly 9 digits per the new public-form
-- invariant; anything else trips the CHECK below and aborts the
-- transaction — preflight Q1 surfaces those rows.
UPDATE appointment_requests
   SET phone = CASE
                 WHEN regexp_replace(phone, '\D', '', 'g') ~ '^51\d{9}$'
                   THEN substring(regexp_replace(phone, '\D', '', 'g') FROM 3)
                 ELSE regexp_replace(phone, '\D', '', 'g')
               END;

-- Phase 1 constraint name is `_phone_format` (not `_check`). Using the
-- correct name avoids a silent no-op that would leave the loose
-- `^\+?[0-9]{7,15}$` CHECK in place alongside the new strict one.
ALTER TABLE appointment_requests DROP CONSTRAINT IF EXISTS appointment_requests_phone_format;
ALTER TABLE appointment_requests
  ADD CONSTRAINT appointment_requests_phone_format CHECK (phone ~ '^\d{9}$');

COMMENT ON COLUMN appointment_requests.phone IS
  'Phase 10c. Exactly 9 digits (no +51, no spaces). The application '
  'prefixes +51 when rendering and when building wa.me links.';

-- ─────────────────────────────────────────────────────────────────────────────
-- §6. car_plate: normalize existing data, then tighten the CHECK
-- ─────────────────────────────────────────────────────────────────────────────
-- Normalize:
--   1. Uppercase + strip every non-alphanumeric.
--   2. Re-insert a hyphen between the 3rd and 4th character if the
--      collapsed string is exactly 6 chars. Anything else (5 chars, 7+,
--      stray characters that survive collapse) fails the new CHECK and
--      rolls back — preflight Q2 surfaces those rows.
UPDATE appointment_requests
   SET car_plate = upper(regexp_replace(car_plate, '[^A-Za-z0-9]', '', 'g'));

UPDATE appointment_requests
   SET car_plate = substring(car_plate FROM 1 FOR 3)
                || '-'
                || substring(car_plate FROM 4 FOR 3)
 WHERE car_plate ~ '^[A-Z0-9]{6}$';

-- Phase 1 constraint name is `_car_plate_format` (not `_check`).
ALTER TABLE appointment_requests DROP CONSTRAINT IF EXISTS appointment_requests_car_plate_format;
ALTER TABLE appointment_requests
  ADD CONSTRAINT appointment_requests_car_plate_format CHECK (
    car_plate ~ '^[A-Z0-9]{3}-[A-Z0-9]{3}$'
  );

COMMENT ON COLUMN appointment_requests.car_plate IS
  'Phase 10c. Canonical Peruvian-plate form: 3 alphanumerics, hyphen, 3 '
  'alphanumerics, e.g. ABC-123 or AB1-2C3.';

-- ─────────────────────────────────────────────────────────────────────────────
-- §7. preferred_date Sunday block (NOT VALID)
-- ─────────────────────────────────────────────────────────────────────────────
-- `NOT VALID` semantics, explicit:
--
--   - HISTORICAL rows with a Sunday preferred_date are PRESERVED — the
--     CHECK is not enforced against existing rows at ADD time.
--   - Every INSERT from now on is checked. A new row with a Sunday
--     preferred_date is rejected.
--   - Every UPDATE from now on is also checked, AS LONG AS the column
--     being updated touches `preferred_date` (PG re-evaluates the CHECK
--     when its referenced columns change). An UPDATE that doesn't
--     touch `preferred_date` passes regardless of the existing value.
--   - Consequence: a historical Sunday row can stay forever, but if
--     an admin later edits that row AND ALSO changes preferred_date
--     to another Sunday (or merely re-writes the same Sunday value),
--     the UPDATE will be rejected. Editing only OTHER columns is fine.
--   - If admins need to "fix" old Sunday rows, set preferred_date to
--     NULL or to a non-Sunday date in the same UPDATE.
--
-- After confirming there are no Sunday rows left (e.g., by running
-- preflight Q4), the operator may promote the constraint:
--
--   ALTER TABLE appointment_requests
--     VALIDATE CONSTRAINT appointment_requests_preferred_date_not_sunday;
--
-- VALIDATE re-checks every row; it fails if any Sunday row remains.
-- EXTRACT(DOW FROM date) returns 0 for Sunday in PostgreSQL.
ALTER TABLE appointment_requests
  ADD CONSTRAINT appointment_requests_preferred_date_not_sunday CHECK (
    preferred_date IS NULL OR EXTRACT(DOW FROM preferred_date) <> 0
  ) NOT VALID;

-- ─────────────────────────────────────────────────────────────────────────────
-- §8. notification_logs: phone recipient + at-least-one-channel CHECK
-- ─────────────────────────────────────────────────────────────────────────────
-- The Phase 10/10b email column stays. Phase 10c adds an optional phone
-- recipient (used by the WhatsApp manual-handoff path). At least one
-- channel must be populated per row — historical rows pass this because
-- they all have `recipient_email`.
ALTER TABLE notification_logs ALTER COLUMN recipient_email DROP NOT NULL;
ALTER TABLE notification_logs ADD COLUMN IF NOT EXISTS recipient_phone TEXT;

ALTER TABLE notification_logs
  ADD CONSTRAINT notification_logs_recipient_present CHECK (
    recipient_email IS NOT NULL OR recipient_phone IS NOT NULL
  );

COMMENT ON COLUMN notification_logs.recipient_email IS
  'Phase 10c. Nullable. Populated for email-channel rows '
  '(notification_type=report_pdf_email). NULL for WhatsApp rows.';
COMMENT ON COLUMN notification_logs.recipient_phone IS
  'Phase 10c. Nullable. Populated for WhatsApp rows '
  '(notification_type=report_pdf_whatsapp). Stores the 9-digit '
  'national number, no +51 prefix.';

COMMIT;

-- =============================================================================
-- §9. notification_type ENUM extension (outside the main transaction)
-- =============================================================================
-- `ALTER TYPE … ADD VALUE` is safe inside a transaction on PostgreSQL
-- 12+, but the new value cannot be used in the same transaction. We
-- keep this OUTSIDE the BEGIN/COMMIT block above for cross-version
-- clarity. The new value is referenced only by future migrations /
-- application code, not by this file.
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'report_pdf_whatsapp';

-- =============================================================================
-- ROLLBACK NOTES (manual; not auto-generated)
-- =============================================================================
-- The migration is mostly additive. Strict rollback to the Phase 10b
-- shape requires the inverse steps below, applied in REVERSE order:
--
--   -- §9 inverse: PostgreSQL has no DROP VALUE for enums. To remove
--   --             'report_pdf_whatsapp' you must rebuild the enum:
--   --   1. CREATE TYPE notification_type_new AS ENUM ('report_pdf_email');
--   --   2. UPDATE notification_logs SET notification_type = 'report_pdf_email'
--   --      WHERE notification_type::text = 'report_pdf_whatsapp';
--   --   3. ALTER TABLE notification_logs ALTER COLUMN notification_type
--   --        TYPE notification_type_new USING notification_type::text::notification_type_new;
--   --   4. DROP TYPE notification_type;
--   --   5. ALTER TYPE notification_type_new RENAME TO notification_type;
--   -- This is destructive — only perform if Phase 10c is being fully reverted.
--
--   -- §8 inverse:
--   ALTER TABLE notification_logs DROP CONSTRAINT notification_logs_recipient_present;
--   ALTER TABLE notification_logs DROP COLUMN recipient_phone;
--   UPDATE notification_logs SET recipient_email = '<placeholder@unknown>' WHERE recipient_email IS NULL;
--   ALTER TABLE notification_logs ALTER COLUMN recipient_email SET NOT NULL;
--
--   -- §7 inverse:
--   ALTER TABLE appointment_requests DROP CONSTRAINT appointment_requests_preferred_date_not_sunday;
--
--   -- §6 inverse (does NOT restore prior loose values — they were
--   --              already normalized in place):
--   ALTER TABLE appointment_requests DROP CONSTRAINT appointment_requests_car_plate_format;
--   ALTER TABLE appointment_requests
--     ADD CONSTRAINT appointment_requests_car_plate_format
--     CHECK (car_plate ~ '^[A-Za-z0-9-]{3,10}$');
--
--   -- §5 inverse:
--   ALTER TABLE appointment_requests DROP CONSTRAINT appointment_requests_phone_format;
--   ALTER TABLE appointment_requests
--     ADD CONSTRAINT appointment_requests_phone_format
--     CHECK (phone ~ '^\+?[0-9]{7,15}$');
--
--   -- §4 inverse: §4 only dropped NOT NULL; the format CHECK was kept,
--   --   so rollback is just re-tightening NOT NULL.
--   UPDATE appointment_requests SET email = '<placeholder@unknown>' WHERE email IS NULL;
--   ALTER TABLE appointment_requests ALTER COLUMN email SET NOT NULL;
--
--   -- §3 inverse: §3 only dropped NOT NULL; the format CHECK was kept.
--   UPDATE appointment_requests SET dni = document_number
--     WHERE dni IS NULL AND document_type = 'DNI';
--   ALTER TABLE appointment_requests ALTER COLUMN dni SET NOT NULL;
--
--   -- §2 inverse:
--   ALTER TABLE appointment_requests DROP CONSTRAINT appointment_requests_document_number_format;
--   ALTER TABLE appointment_requests DROP COLUMN document_type, DROP COLUMN document_number;
--
--   -- §1 inverse:
--   DROP TYPE document_type;
--
-- =============================================================================
