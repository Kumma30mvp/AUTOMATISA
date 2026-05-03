import type { AppointmentStatus } from "./database";

/**
 * Customer-history and vehicle-history items share the same shape:
 * a flat projection of an appointment_requests row plus the joined
 * service name. Phase 8 does not yet include report data — that
 * field will be added in Phase 9 once technical_reports exists.
 */
export type AppointmentHistoryItem = {
  id: string;
  status: AppointmentStatus;
  created_at: string;
  preferred_date: string | null;
  vehicle_brand: string | null;
  vehicle_model: string | null;
  car_plate: string;
  service_id: string | null;
  service_name: string | null;
};

export type CustomerHistoryItem = AppointmentHistoryItem;
export type VehicleHistoryItem = AppointmentHistoryItem;

export type CustomerHistoryResponse = {
  data: CustomerHistoryItem[];
};

export type VehicleHistoryResponse = {
  data: VehicleHistoryItem[];
};
