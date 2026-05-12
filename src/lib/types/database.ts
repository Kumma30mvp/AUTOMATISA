import type { TechnicalReportSummary } from "./reports";
import type { DocumentType } from "@/lib/validations/appointment";

export type { DocumentType };

export type AppointmentStatus =
  | "pendiente"
  | "confirmada"
  | "cancelada"
  | "completada";

/**
 * Payload accepted by POST /api/appointment-requests after Phase 10c.
 *
 * Required: document_type, document_number, phone, car_plate,
 * problem_description. Everything else is optional and nullable so the
 * route can explicitly NULL the legacy columns (dni, email,
 * preferred_time, additional_notes) when the simplified public form
 * doesn't carry them. `dni` is still populated by the route — only
 * when document_type='DNI' — for backwards compatibility with admin
 * code that still reads `row.dni`.
 */
export type AppointmentRequestInsert = {
  document_type: DocumentType;
  document_number: string;
  phone: string;
  car_plate: string;
  problem_description: string;
  full_name?: string | null;
  vehicle_brand?: string | null;
  vehicle_model?: string | null;
  service_id?: string | null;
  preferred_date?: string | null;
  // Phase 10c legacy columns — nullable on INSERT.
  dni?: string | null;
  email?: string | null;
  preferred_time?: string | null;
  additional_notes?: string | null;
};

/**
 * Shape of an `appointment_requests` row as consumed by admin code.
 *
 * Phase 10c (migration 009) made email/dni/preferred_time/additional_notes
 * nullable in the DB and made document_type/document_number the canonical
 * identity columns. The legacy fields are widened to `string | null`
 * here so admin/staff surfaces can render fallbacks instead of empty
 * strings. The TechnicalReportFull.appointment slice in `reports.ts`
 * is intentionally untouched — its email/dni readers belong to the
 * Phase 10/10b SMTP path which Step 8 supersedes with WhatsApp.
 */
export type AppointmentRequestRow = {
  id: string;
  document_type: DocumentType;
  document_number: string;
  phone: string;
  car_plate: string;
  problem_description: string;
  full_name?: string | null;
  vehicle_brand?: string | null;
  vehicle_model?: string | null;
  service_id?: string | null;
  preferred_date?: string | null;
  // Phase 10c legacy columns — nullable in DB and now in TS.
  dni: string | null;
  email: string | null;
  preferred_time?: string | null;
  additional_notes?: string | null;
  status: AppointmentStatus;
  created_at: string;
  updated_at: string;
};

export type ApiSuccessResponse = {
  success: true;
  message: string;
  data: {
    id: string;
    status: AppointmentStatus;
    created_at: string;
  };
  warnings?: string[];
};

export type ApiErrorResponse = {
  success: false;
  error: string;
  details?: { field: string; message: string }[];
};

export type ApiResponse = ApiSuccessResponse | ApiErrorResponse;

export type ServiceOption = {
  id: string;
  name: string;
};

// --- Admin types ---

export type AppointmentRequestFull = AppointmentRequestRow & {
  service_catalog: { name: string } | null;
};

export type StatusHistoryEntry = {
  id: string;
  previous_status: AppointmentStatus | null;
  new_status: AppointmentStatus;
  changed_by: string | null;
  notes: string | null;
  created_at: string;
};

/**
 * Compact representation of a staff_profiles row, used inline in
 * appointment detail responses (assigned_staff field).
 */
export type AssignedStaffSummary = {
  id: string;
  full_name: string;
};

/**
 * Status history entry augmented with the resolved actor (joined
 * from staff_profiles via the changed_by UUID). Anonymous-created
 * entries (the initial "Solicitud creada" row) have actor_full_name
 * = null because the trigger writes changed_by = NULL.
 *
 * actor_role is intentionally a plain union of the allowed values
 * — defined here to avoid a cyclic import from auth/verify-session.
 */
export type StatusHistoryActorRole = "admin" | "staff";

export type StatusHistoryEntryWithActor = StatusHistoryEntry & {
  actor_full_name: string | null;
  actor_role: StatusHistoryActorRole | null;
};

export type SummaryCounts = {
  pendiente: number;
  confirmada: number;
  cancelada: number;
  completada: number;
};

export type AdminListResponse = {
  data: AppointmentRequestFull[];
  total: number;
  page: number;
  pageSize: number;
};

export type AppointmentDetailResponse = {
  request: AppointmentRequestFull & {
    assigned_staff: AssignedStaffSummary | null;
    /**
     * Phase 9: technical report attached to this appointment, or null
     * if no report exists yet. UI uses presence to choose between
     * "Crear informe" and "Ver informe" without an extra round-trip.
     * Soft-failing lookups return null (consistent with assigned_staff).
     */
    technical_report: TechnicalReportSummary | null;
  };
  history: StatusHistoryEntryWithActor[];
};
