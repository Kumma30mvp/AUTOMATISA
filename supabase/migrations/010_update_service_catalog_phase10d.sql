-- =============================================================================
-- Migration 010 — Phase 10d service-catalog cleanup
-- =============================================================================
-- Purpose:
--   Align `service_catalog.is_active` with the canonical AUTOMATISA service
--   list approved during Phase 10d. The four canonical services stay active;
--   every other historical service is soft-deactivated (`is_active = false`)
--   so the public `/api/services` route stops surfacing them in the public
--   appointment form's dropdown.
--
-- This migration is purely additive in spirit:
--   - NO row deletes. Historical service rows are preserved so foreign keys
--     on `appointment_requests.service_id` keep resolving (and admin views
--     can still render the historical service name via the join).
--   - NO schema changes. Only the `is_active` column on existing rows is
--     toggled.
--   - Idempotent. Re-running this migration is a no-op once the catalog is
--     already aligned with the allow-list below.
--
-- This migration does NOT:
--   - Touch RLS, RPC, triggers, storage, or any other schema object.
--   - Insert new service rows. If a canonical service is missing from
--     `service_catalog` it must be added in a separate, explicit migration.
--   - Modify `appointment_requests`, `staff_profiles`, `technical_reports`,
--     `notification_logs`, or any other table.
--   - Re-activate rows. The allow-list only deactivates; it does not flip
--     `is_active=false` back to `true` on any historical match (defensive —
--     keeps the migration narrowly scoped).
--
-- =============================================================================
-- PREFLIGHT — RUN BEFORE APPLYING
-- =============================================================================
-- Paste each query into the Supabase SQL Editor on the AUTOMATISA-staging
-- project and inspect the result.
--
--   -- Q1. Current catalog snapshot.
--   SELECT name, is_active, sort_order
--     FROM service_catalog
--    ORDER BY sort_order, name;
--
--   -- Q2. Rows this migration will deactivate (preview, no writes).
--   SELECT id, name, is_active
--     FROM service_catalog
--    WHERE name NOT IN (
--      'Diagnóstico Electrónico',
--      'Mantenimiento Correctivo',
--      'Mantenimiento Preventivo',
--      'Venta de Repuestos'
--    );
--
--   -- Q3. Confirm the four canonical services exist (each should return 1).
--   SELECT name, is_active
--     FROM service_catalog
--    WHERE name IN (
--      'Diagnóstico Electrónico',
--      'Mantenimiento Correctivo',
--      'Mantenimiento Preventivo',
--      'Venta de Repuestos'
--    )
--    ORDER BY name;
--
--   -- Q4. Appointments still pointing at services that are about to be
--   --     deactivated (informational — they keep their FK; the admin
--   --     surfaces still render the service name via the join).
--   SELECT s.name, count(a.id) AS appointment_count
--     FROM service_catalog s
--     LEFT JOIN appointment_requests a ON a.service_id = s.id
--    WHERE s.name NOT IN (
--      'Diagnóstico Electrónico',
--      'Mantenimiento Correctivo',
--      'Mantenimiento Preventivo',
--      'Venta de Repuestos'
--    )
--    GROUP BY s.name
--    ORDER BY appointment_count DESC, s.name;
--
-- If Q3 does NOT return all four canonical services, STOP — add the missing
-- service rows (via a separate explicit migration) before applying 010,
-- otherwise the public form's service dropdown will be incomplete.
-- =============================================================================

BEGIN;

UPDATE service_catalog
   SET is_active = false
 WHERE name NOT IN (
   'Diagnóstico Electrónico',
   'Mantenimiento Correctivo',
   'Mantenimiento Preventivo',
   'Venta de Repuestos'
 );

COMMIT;

-- =============================================================================
-- ROLLBACK NOTES (manual; not auto-generated)
-- =============================================================================
-- Strict rollback to the pre-010 state requires knowing which rows were
-- previously active. If the operator ran preflight Q2 above and captured the
-- result, restoring is row-by-row:
--
--   UPDATE service_catalog SET is_active = true WHERE id IN ( ...captured ids... );
--
-- Blanket rollback ("re-activate everything") is intentionally NOT documented
-- because it would re-surface services the business decided to stop offering.
-- =============================================================================
