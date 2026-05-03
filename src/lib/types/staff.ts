import type { StaffRole } from "@/lib/auth/verify-session";

export type StaffSummary = {
  id: string;
  full_name: string;
  email: string;
  role: StaffRole;
};

export type StaffListResponse = {
  data: StaffSummary[];
};

export type AssignmentUpdateData = {
  id: string;
  assigned_staff_id: string | null;
};

export type AssignmentUpdateResponse = {
  success: true;
  data: AssignmentUpdateData;
};
