-- ============================================================
-- AUTOMATISA - Initial Database Schema
-- Phase 2: Database design for appointment request workflow
-- ============================================================

-- -------------------------------------------------------
-- 1. ENUMS
-- -------------------------------------------------------

-- Appointment request status
CREATE TYPE appointment_status AS ENUM (
  'pendiente',
  'confirmada',
  'cancelada',
  'completada'
);

-- Day of week (ISO: 1=Monday ... 7=Sunday)
CREATE TYPE day_of_week AS ENUM ('1', '2', '3', '4', '5', '6', '7');

-- -------------------------------------------------------
-- 2. TABLES
-- -------------------------------------------------------

-- 2.1 service_catalog
-- Available services the workshop offers.
CREATE TABLE service_catalog (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  description TEXT,
  duration_minutes INTEGER NOT NULL DEFAULT 60,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2.2 business_hours
-- Configurable operating hours per day of the week.
CREATE TABLE business_hours (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  day_of_week day_of_week NOT NULL,
  open_time   TIME NOT NULL,
  close_time  TIME NOT NULL,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT business_hours_day_unique UNIQUE (day_of_week),
  CONSTRAINT business_hours_time_check CHECK (open_time < close_time)
);

-- 2.3 blocked_dates
-- Specific dates when the workshop does not accept appointments.
CREATE TABLE blocked_dates (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  blocked_date DATE NOT NULL,
  reason      TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT blocked_dates_date_unique UNIQUE (blocked_date)
);

-- 2.4 staff_profiles
-- Controls admin access. Linked to Supabase Auth users.
CREATE TABLE staff_profiles (
  id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name   TEXT NOT NULL,
  email       TEXT NOT NULL,
  role        TEXT NOT NULL DEFAULT 'admin',
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2.5 appointment_requests
-- Public appointment requests submitted by customers.
CREATE TABLE appointment_requests (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Required fields
  dni                 TEXT NOT NULL,
  phone               TEXT NOT NULL,
  email               TEXT NOT NULL,
  car_plate           TEXT NOT NULL,
  problem_description TEXT NOT NULL,

  -- Optional/recommended fields
  full_name           TEXT,
  vehicle_brand       TEXT,
  vehicle_model       TEXT,
  service_id          UUID REFERENCES service_catalog(id) ON DELETE SET NULL,
  preferred_date      DATE,
  preferred_time      TIME,
  additional_notes    TEXT,

  -- Status tracking
  status              appointment_status NOT NULL DEFAULT 'pendiente',

  -- Metadata
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Constraints
  CONSTRAINT appointment_requests_dni_format CHECK (dni ~ '^\d{8}$'),
  CONSTRAINT appointment_requests_phone_format CHECK (phone ~ '^\+?[0-9]{7,15}$'),
  CONSTRAINT appointment_requests_email_format CHECK (email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$'),
  CONSTRAINT appointment_requests_car_plate_format CHECK (car_plate ~ '^[A-Za-z0-9-]{3,10}$')
);

-- 2.6 appointment_status_history
-- Records every status transition for audit trail.
CREATE TABLE appointment_status_history (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_request_id UUID NOT NULL REFERENCES appointment_requests(id) ON DELETE CASCADE,
  previous_status       appointment_status,
  new_status            appointment_status NOT NULL,
  changed_by            UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  notes                 TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- -------------------------------------------------------
-- 3. INDEXES
-- -------------------------------------------------------

-- appointment_requests: common query patterns
CREATE INDEX idx_appointment_requests_status ON appointment_requests(status);
CREATE INDEX idx_appointment_requests_dni ON appointment_requests(dni);
CREATE INDEX idx_appointment_requests_car_plate ON appointment_requests(car_plate);
CREATE INDEX idx_appointment_requests_created_at ON appointment_requests(created_at DESC);
CREATE INDEX idx_appointment_requests_preferred_date ON appointment_requests(preferred_date);

-- appointment_status_history: lookup by request
CREATE INDEX idx_status_history_request_id ON appointment_status_history(appointment_request_id);
CREATE INDEX idx_status_history_created_at ON appointment_status_history(created_at DESC);

-- service_catalog: active services sorted
CREATE INDEX idx_service_catalog_active ON service_catalog(is_active, sort_order);

-- business_hours: lookup by day
CREATE INDEX idx_business_hours_day ON business_hours(day_of_week);

-- blocked_dates: lookup by date
CREATE INDEX idx_blocked_dates_date ON blocked_dates(blocked_date);

-- -------------------------------------------------------
-- 4. UPDATED_AT TRIGGER
-- -------------------------------------------------------

-- Generic trigger function to auto-update updated_at column
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_appointment_requests_updated_at
  BEFORE UPDATE ON appointment_requests
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trg_service_catalog_updated_at
  BEFORE UPDATE ON service_catalog
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trg_business_hours_updated_at
  BEFORE UPDATE ON business_hours
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trg_staff_profiles_updated_at
  BEFORE UPDATE ON staff_profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- -------------------------------------------------------
-- 5. ROW LEVEL SECURITY
-- -------------------------------------------------------

-- Enable RLS on all tables
ALTER TABLE appointment_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE appointment_status_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE business_hours ENABLE ROW LEVEL SECURITY;
ALTER TABLE blocked_dates ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff_profiles ENABLE ROW LEVEL SECURITY;

-- Helper function: check if current user is active staff
CREATE OR REPLACE FUNCTION is_active_staff()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM staff_profiles
    WHERE id = auth.uid()
      AND is_active = true
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ----- appointment_requests -----

-- Public (anon) can INSERT new requests
CREATE POLICY "anon_insert_appointment_requests"
  ON appointment_requests
  FOR INSERT
  TO anon
  WITH CHECK (true);

-- Staff can SELECT all requests
CREATE POLICY "staff_select_appointment_requests"
  ON appointment_requests
  FOR SELECT
  TO authenticated
  USING (is_active_staff());

-- Staff can UPDATE request status
CREATE POLICY "staff_update_appointment_requests"
  ON appointment_requests
  FOR UPDATE
  TO authenticated
  USING (is_active_staff())
  WITH CHECK (is_active_staff());

-- ----- appointment_status_history -----

-- Anon can INSERT (for the initial 'pendiente' entry created with the request)
CREATE POLICY "anon_insert_status_history"
  ON appointment_status_history
  FOR INSERT
  TO anon
  WITH CHECK (true);

-- Authenticated staff can INSERT status changes
CREATE POLICY "staff_insert_status_history"
  ON appointment_status_history
  FOR INSERT
  TO authenticated
  WITH CHECK (is_active_staff());

-- Staff can SELECT history
CREATE POLICY "staff_select_status_history"
  ON appointment_status_history
  FOR SELECT
  TO authenticated
  USING (is_active_staff());

-- ----- business_hours -----

-- Public can read business hours (needed for form validation)
CREATE POLICY "public_select_business_hours"
  ON business_hours
  FOR SELECT
  TO anon, authenticated
  USING (true);

-- Staff can manage business hours
CREATE POLICY "staff_manage_business_hours"
  ON business_hours
  FOR ALL
  TO authenticated
  USING (is_active_staff())
  WITH CHECK (is_active_staff());

-- ----- blocked_dates -----

-- Public can read blocked dates (needed for form validation)
CREATE POLICY "public_select_blocked_dates"
  ON blocked_dates
  FOR SELECT
  TO anon, authenticated
  USING (true);

-- Staff can manage blocked dates
CREATE POLICY "staff_manage_blocked_dates"
  ON blocked_dates
  FOR ALL
  TO authenticated
  USING (is_active_staff())
  WITH CHECK (is_active_staff());

-- ----- service_catalog -----

-- Public can read active services (needed for the form dropdown)
CREATE POLICY "public_select_active_services"
  ON service_catalog
  FOR SELECT
  TO anon, authenticated
  USING (is_active = true);

-- Staff can manage all services (including inactive)
CREATE POLICY "staff_manage_service_catalog"
  ON service_catalog
  FOR ALL
  TO authenticated
  USING (is_active_staff())
  WITH CHECK (is_active_staff());

-- ----- staff_profiles -----

-- Staff can read their own profile
CREATE POLICY "staff_select_own_profile"
  ON staff_profiles
  FOR SELECT
  TO authenticated
  USING (id = auth.uid());

-- Staff can read all staff profiles (for admin panel)
CREATE POLICY "staff_select_all_profiles"
  ON staff_profiles
  FOR SELECT
  TO authenticated
  USING (is_active_staff());
