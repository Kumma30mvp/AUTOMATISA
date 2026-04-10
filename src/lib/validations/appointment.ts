import { z } from "zod";

const LIMA_TZ = "America/Lima";

/**
 * Get today's date as YYYY-MM-DD in America/Lima timezone.
 * Uses Intl.DateTimeFormat with en-CA locale which outputs YYYY-MM-DD.
 */
function getTodayInLima(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: LIMA_TZ }).format(
    new Date()
  );
}

/**
 * Get the ISO day-of-week (1=Monday..7=Sunday) for a YYYY-MM-DD string.
 * Uses UTC to avoid timezone shifting on the calendar date.
 */
function getIsoDayOfWeek(dateStr: string): string {
  const [year, month, day] = dateStr.split("-").map(Number);
  const d = new Date(Date.UTC(year, month - 1, day));
  const jsDay = d.getUTCDay(); // 0=Sunday, 1=Monday...6=Saturday
  const isoDay = jsDay === 0 ? 7 : jsDay; // 7=Sunday, 1=Monday...6=Saturday
  return String(isoDay);
}

/**
 * Get the current time as HH:MM in America/Lima timezone.
 */
function getCurrentTimeInLima(): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: LIMA_TZ,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date());
}

export { getTodayInLima, getIsoDayOfWeek, getCurrentTimeInLima };

// --- Zod Schema ---

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const TIME_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/;

export const appointmentRequestSchema = z.object({
  // Required fields
  dni: z
    .string({ message: "El DNI es obligatorio" })
    .regex(/^\d{8}$/, { message: "El DNI debe tener exactamente 8 dígitos" }),

  phone: z
    .string({ message: "El teléfono es obligatorio" })
    .regex(/^\+?[0-9]{7,15}$/, {
      message: "El teléfono debe tener entre 7 y 15 dígitos",
    }),

  email: z
    .email({ message: "El correo electrónico no es válido" })
    .transform((v) => v.toLowerCase()),

  car_plate: z
    .string({ message: "La placa del vehículo es obligatoria" })
    .regex(/^[A-Za-z0-9-]{3,10}$/, {
      message: "La placa debe tener entre 3 y 10 caracteres alfanuméricos",
    })
    .transform((v) => v.toUpperCase()),

  problem_description: z
    .string({ message: "La descripción del problema es obligatoria" })
    .trim()
    .min(1, { message: "La descripción del problema es obligatoria" })
    .max(2000, {
      message: "La descripción no puede exceder 2000 caracteres",
    }),

  // Optional fields
  full_name: z.string().trim().max(200).optional(),

  vehicle_brand: z.string().trim().max(100).optional(),

  vehicle_model: z.string().trim().max(100).optional(),

  service_id: z.uuid({ message: "El ID del servicio no es válido" }).optional(),

  preferred_date: z
    .string()
    .regex(DATE_REGEX, {
      message: "La fecha debe tener formato YYYY-MM-DD",
    })
    .refine(
      (val) => {
        // Validate it's a real calendar date
        const [y, m, d] = val.split("-").map(Number);
        const date = new Date(Date.UTC(y, m - 1, d));
        return (
          date.getUTCFullYear() === y &&
          date.getUTCMonth() === m - 1 &&
          date.getUTCDate() === d
        );
      },
      { message: "La fecha no es válida" }
    )
    .refine(
      (val) => {
        const today = getTodayInLima();
        return val >= today;
      },
      { message: "La fecha preferida no puede ser en el pasado" }
    )
    .optional(),

  preferred_time: z
    .string()
    .regex(TIME_REGEX, {
      message: "La hora debe tener formato HH:MM (24 horas)",
    })
    .optional(),

  additional_notes: z.string().trim().max(2000).optional(),
});

export type AppointmentRequestInput = z.infer<
  typeof appointmentRequestSchema
>;
