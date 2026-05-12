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

// ─────────────────────────────────────────────────────────────────────────────
// Phase 10c — public-form schema (used by both the AppointmentForm client
// component and the POST /api/appointment-requests server route).
// ─────────────────────────────────────────────────────────────────────────────

export const DOCUMENT_TYPES = ["DNI", "RUC"] as const;
export type DocumentType = (typeof DOCUMENT_TYPES)[number];

const DNI_DIGITS_REGEX = /^\d{8}$/;
const RUC_DIGITS_REGEX = /^\d{11}$/;
const PHONE_REGEX = /^\d{9}$/;
const PLATE_REGEX = /^[A-Z0-9]{3}-[A-Z0-9]{3}$/;

export const publicAppointmentFormSchema = z
  .object({
    document_type: z.enum(DOCUMENT_TYPES, {
      message: "Seleccione DNI o RUC",
    }),

    document_number: z
      .string({ message: "El documento es obligatorio" })
      .min(1, { message: "El documento es obligatorio" }),

    phone: z
      .string({ message: "El teléfono es obligatorio" })
      .regex(PHONE_REGEX, {
        message: "El teléfono debe tener exactamente 9 dígitos",
      }),

    car_plate: z
      .string({ message: "La placa del vehículo es obligatoria" })
      .regex(PLATE_REGEX, {
        message: "La placa debe tener el formato ABC-123",
      }),

    problem_description: z
      .string({ message: "La descripción del problema es obligatoria" })
      .trim()
      .min(1, { message: "La descripción del problema es obligatoria" })
      .max(2000, {
        message: "La descripción no puede exceder 2000 caracteres",
      }),

    full_name: z.string().trim().max(200).optional(),
    vehicle_brand: z.string().trim().max(100).optional(),
    vehicle_model: z.string().trim().max(100).optional(),
    service_id: z
      .uuid({ message: "El ID del servicio no es válido" })
      .optional(),

    preferred_date: z
      .string()
      .regex(DATE_REGEX, {
        message: "La fecha debe tener formato YYYY-MM-DD",
      })
      .refine(
        (val) => {
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
      .refine((val) => val >= getTodayInLima(), {
        message: "La fecha preferida no puede ser en el pasado",
      })
      .refine(
        (val) => {
          const [y, m, d] = val.split("-").map(Number);
          return new Date(Date.UTC(y, m - 1, d)).getUTCDay() !== 0;
        },
        {
          message:
            "Los domingos no atendemos. Por favor seleccione otro día.",
        }
      )
      .optional(),
  })
  .refine(
    (data) =>
      data.document_type !== "DNI" || DNI_DIGITS_REGEX.test(data.document_number),
    {
      path: ["document_number"],
      message: "El DNI debe tener exactamente 8 dígitos",
    }
  )
  .refine(
    (data) =>
      data.document_type !== "RUC" || RUC_DIGITS_REGEX.test(data.document_number),
    {
      path: ["document_number"],
      message: "El RUC debe tener exactamente 11 dígitos",
    }
  );

export type PublicAppointmentFormInput = z.infer<
  typeof publicAppointmentFormSchema
>;
