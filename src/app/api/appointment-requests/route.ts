import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  appointmentRequestSchema,
  getIsoDayOfWeek,
  getTodayInLima,
  getCurrentTimeInLima,
} from "@/lib/validations/appointment";
import type {
  ApiSuccessResponse,
  ApiErrorResponse,
  AppointmentRequestInsert,
} from "@/lib/types/database";

const SUCCESS_MESSAGE =
  "Muchas gracias por preferir AUTOMATISA, Recibimos tu solicitud y la atenderemos cuando antes! :)";

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

  // 2. Validate with Zod
  const result = appointmentRequestSchema.safeParse(body);

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

  // 4. Check business hours for warnings (soft validation)
  const warnings: string[] = [];

  if (data.preferred_date) {
    const isoDay = getIsoDayOfWeek(data.preferred_date);

    // Check if the day is active in business_hours
    const { data: hours } = await supabase
      .from("business_hours")
      .select("open_time, close_time, is_active")
      .eq("day_of_week", isoDay)
      .single();

    if (hours && !hours.is_active) {
      warnings.push(
        "La fecha preferida cae en un día no laborable. Nuestro equipo le contactará para coordinar."
      );
    }

    // Check if the date is blocked
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

    // Check preferred_time against business hours
    if (data.preferred_time && hours && hours.is_active) {
      const openTime = hours.open_time as string; // "10:00:00"
      const closeTime = hours.close_time as string; // "18:00:00"
      const prefTime = data.preferred_time; // "HH:MM"

      // Compare as strings (HH:MM sorts lexicographically for 24h format)
      if (prefTime < openTime.slice(0, 5) || prefTime >= closeTime.slice(0, 5)) {
        warnings.push(
          "La hora preferida está fuera del horario de atención. Nuestro equipo le contactará para coordinar."
        );
      }
    }

    // Same-day: preferred_time already passed (advisory warning)
    const today = getTodayInLima();
    if (
      data.preferred_date === today &&
      data.preferred_time &&
      data.preferred_time < getCurrentTimeInLima()
    ) {
      warnings.push(
        "La hora preferida ya pasó el día de hoy. Nuestro equipo le contactará para coordinar."
      );
    }
  }

  // 5. Insert into appointment_requests (trigger handles history)
  // Generate id and timestamp server-side so we can return them without
  // a SELECT after INSERT (anon has no SELECT policy on this table).
  const requestId = crypto.randomUUID();
  const createdAt = new Date().toISOString();

  const insertData: AppointmentRequestInsert & { id: string } = {
    id: requestId,
    dni: data.dni,
    phone: data.phone,
    email: data.email,
    car_plate: data.car_plate,
    problem_description: data.problem_description,
  };

  // Add optional fields only if provided
  if (data.full_name !== undefined) insertData.full_name = data.full_name;
  if (data.vehicle_brand !== undefined)
    insertData.vehicle_brand = data.vehicle_brand;
  if (data.vehicle_model !== undefined)
    insertData.vehicle_model = data.vehicle_model;
  if (data.service_id !== undefined) insertData.service_id = data.service_id;
  if (data.preferred_date !== undefined)
    insertData.preferred_date = data.preferred_date;
  if (data.preferred_time !== undefined)
    insertData.preferred_time = data.preferred_time;
  if (data.additional_notes !== undefined)
    insertData.additional_notes = data.additional_notes;

  const { error: insertError } = await supabase
    .from("appointment_requests")
    .insert(insertData);

  if (insertError) {
    console.error("Failed to insert appointment request:", insertError);

    // Check for FK violation on service_id (shouldn't happen after our check, but defensive)
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

    return NextResponse.json<ApiErrorResponse>(
      {
        success: false,
        error:
          "Ocurrió un error al procesar su solicitud. Por favor intente nuevamente.",
      },
      { status: 500 }
    );
  }

  // 6. Return success response using server-generated values
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