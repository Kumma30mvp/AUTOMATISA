import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  publicAppointmentFormSchema,
  getIsoDayOfWeek,
} from "@/lib/validations/appointment";
import type {
  ApiSuccessResponse,
  ApiErrorResponse,
  AppointmentRequestInsert,
} from "@/lib/types/database";

const SUCCESS_MESSAGE =
  "Muchas gracias por preferir AUTOMATISA, Recibimos tu solicitud y la atenderemos cuando antes! :)";

/**
 * Defensive server-side normalization for the public form payload.
 *
 * The Phase 10c AppointmentForm pre-formats fields, but the API must not
 * trust that. We mirror the client's canonicalization rules so the schema
 * sees the same shape regardless of caller. Anything that still fails the
 * strict regexes after this pass gets rejected by `safeParse`, then by the
 * DB CHECK constraints from migration 009 as a final backstop.
 */
function normalizeAppointmentBody(raw: unknown): unknown {
  if (!raw || typeof raw !== "object") return raw;
  const body: Record<string, unknown> = { ...(raw as Record<string, unknown>) };

  if (typeof body.phone === "string") {
    body.phone = body.phone.replace(/\D/g, "");
  }
  if (typeof body.document_number === "string") {
    body.document_number = body.document_number.replace(/\D/g, "");
  }
  if (typeof body.car_plate === "string") {
    const cleaned = body.car_plate
      .replace(/[^A-Za-z0-9]/g, "")
      .toUpperCase();
    body.car_plate =
      cleaned.length === 6
        ? `${cleaned.slice(0, 3)}-${cleaned.slice(3)}`
        : cleaned;
  }
  for (const field of [
    "full_name",
    "vehicle_brand",
    "vehicle_model",
    "problem_description",
  ]) {
    if (typeof body[field] === "string") {
      body[field] = (body[field] as string).trim();
    }
  }
  return body;
}

/**
 * Friendly mapping from migration 009 CHECK constraint names to
 * field-level error messages. Only triggers if RLS or validation slips
 * past — under normal flow the zod schema catches each case first.
 */
const CHECK_VIOLATION_MAP: Record<
  string,
  { field: string; message: string }
> = {
  appointment_requests_document_number_format: {
    field: "document_number",
    message:
      "El documento no cumple el formato requerido. DNI: 8 dígitos. RUC: 11 dígitos.",
  },
  appointment_requests_phone_format: {
    field: "phone",
    message: "El teléfono debe tener exactamente 9 dígitos.",
  },
  appointment_requests_car_plate_format: {
    field: "car_plate",
    message: "La placa debe tener el formato ABC-123.",
  },
  appointment_requests_preferred_date_not_sunday: {
    field: "preferred_date",
    message: "Los domingos no atendemos. Por favor seleccione otro día.",
  },
};

export async function POST(request: Request) {
  // 1. Parse JSON body
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json<ApiErrorResponse>(
      { success: false, error: "El cuerpo de la solicitud no es válido" },
      { status: 400 }
    );
  }

  // 2. Defensive normalization, then validate
  const normalized = normalizeAppointmentBody(body);
  const result = publicAppointmentFormSchema.safeParse(normalized);

  if (!result.success) {
    const details = result.error.issues.map((issue) => ({
      field: String(issue.path[0] ?? "unknown"),
      message: issue.message,
    }));

    return NextResponse.json<ApiErrorResponse>(
      { success: false, error: "Datos inválidos", details },
      { status: 400 }
    );
  }

  const data = result.data;

  // 3. Verify service exists and is active (if provided)
  const supabase = await createClient();

  if (data.service_id) {
    const { data: service, error: serviceError } = await supabase
      .from("service_catalog")
      .select("id")
      .eq("id", data.service_id)
      .eq("is_active", true)
      .single();

    if (serviceError || !service) {
      return NextResponse.json<ApiErrorResponse>(
        {
          success: false,
          error: "Datos inválidos",
          details: [
            {
              field: "service_id",
              message:
                "El servicio seleccionado no existe o no está disponible",
            },
          ],
        },
        { status: 400 }
      );
    }
  }

  // 4. Soft business-hours warnings (Phase 10c dropped preferred_time, so
  //    only the day-of-week and blocked-dates checks remain).
  const warnings: string[] = [];

  if (data.preferred_date) {
    const isoDay = getIsoDayOfWeek(data.preferred_date);

    const { data: hours } = await supabase
      .from("business_hours")
      .select("is_active")
      .eq("day_of_week", isoDay)
      .single();

    if (hours && !hours.is_active) {
      warnings.push(
        "La fecha preferida cae en un día no laborable. Nuestro equipo le contactará para coordinar."
      );
    }

    const { data: blocked } = await supabase
      .from("blocked_dates")
      .select("id")
      .eq("blocked_date", data.preferred_date)
      .single();

    if (blocked) {
      warnings.push(
        "La fecha preferida no está disponible. Nuestro equipo le contactará para coordinar una fecha alternativa."
      );
    }
  }

  // 5. Insert into appointment_requests. Trigger 003 writes the initial
  //    history row.
  //
  //    Legacy compatibility per Phase 10c contract:
  //      - dni     = document_number when type='DNI', else null
  //      - email   = null  (Phase 10c form does not collect it)
  //      - preferred_time   = null
  //      - additional_notes = null
  //
  //    Generate id and timestamp server-side so we can return them
  //    without a SELECT after INSERT (anon has no SELECT policy on this
  //    table).
  const requestId = crypto.randomUUID();
  const createdAt = new Date().toISOString();

  const insertData: AppointmentRequestInsert & { id: string } = {
    id: requestId,
    document_type: data.document_type,
    document_number: data.document_number,
    phone: data.phone,
    car_plate: data.car_plate,
    problem_description: data.problem_description,
    dni: data.document_type === "DNI" ? data.document_number : null,
    email: null,
    preferred_time: null,
    additional_notes: null,
  };

  if (data.full_name) insertData.full_name = data.full_name;
  if (data.vehicle_brand) insertData.vehicle_brand = data.vehicle_brand;
  if (data.vehicle_model) insertData.vehicle_model = data.vehicle_model;
  if (data.service_id) insertData.service_id = data.service_id;
  if (data.preferred_date) insertData.preferred_date = data.preferred_date;

  const { error: insertError } = await supabase
    .from("appointment_requests")
    .insert(insertData);

  if (insertError) {
    console.error("Failed to insert appointment request:", insertError);

    // FK violation — most likely service_id race between check and insert.
    if (insertError.code === "23503") {
      return NextResponse.json<ApiErrorResponse>(
        {
          success: false,
          error: "Datos inválidos",
          details: [
            {
              field: "service_id",
              message:
                "El servicio seleccionado no existe o no está disponible",
            },
          ],
        },
        { status: 400 }
      );
    }

    // CHECK violation — match the constraint name from migration 009
    // to surface a friendly field-level error.
    if (insertError.code === "23514") {
      const constraintName = Object.keys(CHECK_VIOLATION_MAP).find((name) =>
        insertError.message?.includes(name)
      );
      if (constraintName) {
        const info = CHECK_VIOLATION_MAP[constraintName];
        return NextResponse.json<ApiErrorResponse>(
          {
            success: false,
            error: "Datos inválidos",
            details: [{ field: info.field, message: info.message }],
          },
          { status: 400 }
        );
      }
    }

    return NextResponse.json<ApiErrorResponse>(
      {
        success: false,
        error:
          "Ocurrió un error al procesar su solicitud. Por favor intente nuevamente.",
      },
      { status: 500 }
    );
  }

  // 6. Return success response using server-generated values.
  const response: ApiSuccessResponse = {
    success: true,
    message: SUCCESS_MESSAGE,
    data: {
      id: requestId,
      status: "pendiente",
      created_at: createdAt,
    },
  };

  if (warnings.length > 0) {
    response.warnings = warnings;
  }

  return NextResponse.json<ApiSuccessResponse>(response, { status: 201 });
}
