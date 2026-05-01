-- ============================================================
-- AUTOMATISA - Status Update Trigger + Summary RPC
-- Phase 5: Atomic status updates and admin summary counts
-- ============================================================

-- -------------------------------------------------------
-- 1. STATUS UPDATE TRIGGER
-- Fires when status changes on appointment_requests.
-- Auto-creates a row in appointment_status_history within
-- the same transaction. SECURITY INVOKER because staff
-- already have an INSERT policy on the history table.
-- -------------------------------------------------------

CREATE OR REPLACE FUNCTION public.trg_fn_appointment_status_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.appointment_status_history (
    appointment_request_id,
    previous_status,
    new_status,
    changed_by,
    notes
  ) VALUES (
    NEW.id,
    OLD.status,
    NEW.status,
    auth.uid(),
    'Estado actualizado por staff'
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_appointment_requests_status_change
  AFTER UPDATE OF status ON public.appointment_requests
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION public.trg_fn_appointment_status_change();

-- -------------------------------------------------------
-- 2. SUMMARY RPC
-- Returns the four status counts in one grouped query.
-- SECURITY INVOKER so RLS applies (staff can SELECT all).
-- -------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_appointment_summary()
RETURNS TABLE (
  pendiente   bigint,
  confirmada  bigint,
  cancelada   bigint,
  completada  bigint
)
LANGUAGE sql
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT
    COUNT(*) FILTER (WHERE status = 'pendiente')  AS pendiente,
    COUNT(*) FILTER (WHERE status = 'confirmada') AS confirmada,
    COUNT(*) FILTER (WHERE status = 'cancelada')  AS cancelada,
    COUNT(*) FILTER (WHERE status = 'completada') AS completada
  FROM public.appointment_requests;
$$;

GRANT EXECUTE ON FUNCTION public.get_appointment_summary() TO authenticated;
