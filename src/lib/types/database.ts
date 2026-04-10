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
