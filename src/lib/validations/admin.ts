import { z } from "zod";

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

const STATUS_VALUES = [
  "pendiente",
  "confirmada",
  "cancelada",
  "completada",
] as const;

export const appointmentStatusSchema = z.enum(STATUS_VALUES);

/**
 * Query parameters for the admin appointment list.
 *
 * - `dni` / `car_plate`: partial-match filters (server uses ilike).
 * - `status`: exact match.
 * - `from` / `to`: YYYY-MM-DD bounds applied to `created_at`
 *   (the date the request was submitted), not preferred_date.
 * - Pagination: 1-indexed page, default 20 per page (max 100).
 */
export const adminListQuerySchema = z
  .object({
    dni: z
      .string()
      .trim()
      .regex(/^\d{1,8}$/, { message: "DNI inválido" })
      .optional(),

    car_plate: z
      .string()
      .trim()
      .min(1)
      .max(10)
      .transform((v) => v.toUpperCase())
      .optional(),

    status: appointmentStatusSchema.optional(),

    from: z
      .string()
      .regex(DATE_REGEX, { message: "Fecha 'from' inválida" })
      .optional(),

    to: z
      .string()
      .regex(DATE_REGEX, { message: "Fecha 'to' inválida" })
      .optional(),

    page: z.coerce.number().int().min(1).default(1),

    pageSize: z.coerce.number().int().min(1).max(100).default(20),
  })
  .refine((data) => !(data.from && data.to && data.from > data.to), {
    message: "La fecha 'hasta' debe ser igual o posterior a 'desde'",
    path: ["to"],
  });

export type AdminListQuery = z.infer<typeof adminListQuerySchema>;

/**
 * Body for PATCH /api/admin/appointment-requests/[id].
 * Notes are optional and currently unused (the trigger writes a default).
 */
export const statusUpdateSchema = z.object({
  status: appointmentStatusSchema,
  notes: z.string().trim().max(2000).optional(),
});

export type StatusUpdateInput = z.infer<typeof statusUpdateSchema>;

/**
 * Allowed status transitions. Terminal states (cancelada, completada)
 * cannot transition to anything else. Enforced both client- and server-side.
 */
export const ALLOWED_TRANSITIONS: Record<
  z.infer<typeof appointmentStatusSchema>,
  ReadonlyArray<z.infer<typeof appointmentStatusSchema>>
> = {
  pendiente: ["confirmada", "cancelada"],
  confirmada: ["completada", "cancelada"],
  cancelada: [],
  completada: [],
};

export function isValidTransition(
  from: z.infer<typeof appointmentStatusSchema>,
  to: z.infer<typeof appointmentStatusSchema>
): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}
