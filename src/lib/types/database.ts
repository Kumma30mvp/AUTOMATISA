export type AppointmentStatus =
  | "pendiente"
  | "confirmada"
  | "cancelada"
  | "completada";

export type AppointmentRequestInsert = {
  dni: string;
  phone: string;
  email: string;
  car_plate: string;
  problem_description: string;
  full_name?: string;
  vehicle_brand?: string;
  vehicle_model?: string;
  service_id?: string;
  preferred_date?: string;
  preferred_time?: string;
  additional_notes?: string;
};

export type AppointmentRequestRow = AppointmentRequestInsert & {
  id: string;
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
  };
  history: StatusHistoryEntryWithActor[];
};
