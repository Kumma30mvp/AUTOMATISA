import { z } from "zod";
import { PLATE_REGEX, normalizePlate } from "@/lib/utils/plate";

/**
 * Body schema for PATCH /api/admin/appointment-requests/[id]/assignment.
 * `assigned_staff_id` is the UUID of an active staff_profiles row,
 * or null to clear the assignment.
 */
export const assignmentUpdateSchema = z.object({
  assigned_staff_id: z.string().uuid().nullable(),
});

export type AssignmentUpdateInput = z.infer<typeof assignmentUpdateSchema>;

/**
 * Query schema for GET /api/admin/customer-history.
 * Either dni OR email (or both) must be provided. The route filters
 * with OR semantics — rows where dni matches OR email matches.
 */
export const customerHistoryQuerySchema = z
  .object({
    dni: z
      .string()
      .regex(/^\d{8}$/, "DNI debe tener 8 dígitos")
      .optional(),
    email: z
      .string()
      .email("Email inválido")
      .toLowerCase()
      .optional(),
  })
  .refine((data) => Boolean(data.dni) || Boolean(data.email), {
    message: "Debe proporcionar dni o email",
    path: ["dni"],
  });

export type CustomerHistoryQuery = z.infer<typeof customerHistoryQuerySchema>;

/**
 * Query schema for GET /api/admin/vehicle-history.
 * The plate is uppercased to match the public form's normalization
 * pattern (see appointment.ts). Lookup uses ILIKE for case-insensitive
 * match against any historical row that may differ in case.
 */
export const vehicleHistoryQuerySchema = z.object({
  car_plate: z
    .string()
    .regex(/^[A-Za-z0-9-]{3,10}$/, "Placa inválida")
    .transform((s) => s.toUpperCase()),
});

export type VehicleHistoryQuery = z.infer<typeof vehicleHistoryQuerySchema>;

/**
 * Query schema for GET /api/admin/staff/queue.
 *
 * Pagination + optional plate search. The route always restricts to
 * status='confirmada' regardless of role. When `placa` is supplied the
 * route adds `.eq("car_plate", placa)` on the canonical form. No
 * `.ilike()` — exact match keeps the query deterministic.
 *
 * `placa` is normalized BEFORE the regex check so URL noise (lowercase,
 * missing hyphen, spaces) is coerced to the canonical form, mirroring
 * the rules the public form uses. The regex + normalization helper
 * live in `@/lib/utils/plate` so the client filter component can reuse
 * them without pulling zod into the client bundle.
 */
export const staffQueueQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  placa: z
    .string()
    .transform(normalizePlate)
    .refine((s) => PLATE_REGEX.test(s), {
      message:
        "Placa debe tener el formato ABC-123 (6 caracteres alfanuméricos).",
    })
    .optional(),
});

export type StaffQueueQuery = z.infer<typeof staffQueueQuerySchema>;
