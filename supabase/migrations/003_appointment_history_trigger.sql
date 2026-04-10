-- ============================================================
-- AUTOMATISA - Appointment History Trigger
-- Phase 4: Auto-create initial status history on INSERT
-- ============================================================

-- -------------------------------------------------------
-- 1. TRIGGER FUNCTION
-- Automatically inserts the initial 'pendiente' row into
-- appointment_status_history when a new appointment_requests
-- row is created. Runs within the same transaction as the
-- INSERT, so both succeed or both roll back.
--
-- SECURITY DEFINER: runs as the function owner (DB admin),
-- bypassing RLS for the history insert. This is safe because
-- the function is NOT callable by clients — it only fires
-- as a trigger on appointment_requests.
-- -------------------------------------------------------

CREATE OR REPLACE FUNCTION public.trg_fn_appointment_initial_history()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
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
    NULL,
    NEW.status,
    NULL,
    'Solicitud creada por el cliente'
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_appointment_requests_initial_history
  AFTER INSERT ON public.appointment_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_fn_appointment_initial_history();

-- -------------------------------------------------------
-- 2. CLEANUP
-- The anon_insert_status_history RLS policy is no longer
-- needed since anon never inserts directly into
-- appointment_status_history — the trigger handles it.
-- -------------------------------------------------------

DROP POLICY IF EXISTS "anon_insert_status_history" ON public.appointment_status_history;
