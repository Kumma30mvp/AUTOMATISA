-- ============================================================
-- AUTOMATISA - Seed Data
-- Phase 2: Initial data for business_hours and service_catalog
-- ============================================================

-- -------------------------------------------------------
-- 1. BUSINESS HOURS
-- Monday(1) to Saturday(6): 10:00 - 18:00
-- Sunday(7): inactive
-- Timezone enforcement happens at the application level (America/Lima)
-- -------------------------------------------------------

INSERT INTO business_hours (day_of_week, open_time, close_time, is_active) VALUES
  ('1', '10:00', '18:00', true),   -- Lunes
  ('2', '10:00', '18:00', true),   -- Martes
  ('3', '10:00', '18:00', true),   -- Miércoles
  ('4', '10:00', '18:00', true),   -- Jueves
  ('5', '10:00', '18:00', true),   -- Viernes
  ('6', '10:00', '18:00', true),   -- Sábado
  ('7', '10:00', '18:00', false);  -- Domingo (cerrado)

-- -------------------------------------------------------
-- 2. SERVICE CATALOG
-- Based on services currently listed on the AUTOMATISA website
-- duration_minutes is configurable per service complexity
-- -------------------------------------------------------

INSERT INTO service_catalog (name, description, duration_minutes, is_active, sort_order) VALUES
  (
    'Diagnóstico Electrónico',
    'Identificamos fallas con precisión quirúrgica utilizando escáneres de última generación. Sin suposiciones, solo datos.',
    60,
    true,
    1
  ),
  (
    'Mantenimiento Completo',
    'Servicio integral que cubre motor, frenos, suspensión y fluidos para garantizar seguridad total.',
    120,
    true,
    2
  ),
  (
    'Mantenimiento Preventivo',
    'Evita costosas reparaciones a futuro con chequeos programados.',
    60,
    true,
    3
  ),
  (
    'Mantenimiento Correctivo',
    'Reparaciones de alta complejidad con garantía y repuestos originales.',
    120,
    true,
    4
  ),
  (
    'Venta de Repuestos',
    'Stock seleccionado de componentes originales y certificados.',
    30,
    true,
    5
  ),
  (
    'Sistema de Frenos',
    'Seguridad absoluta en cada frenada.',
    90,
    true,
    6
  );
