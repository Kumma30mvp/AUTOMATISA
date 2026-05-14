import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { requireAdmin } from "@/lib/auth/require";
import {
  prepareWhatsAppBodySchema,
  reportIdParamSchema,
} from "@/lib/validations/notifications";
import { generateReportPdf } from "@/lib/pdf/report-pdf";
import {
  buildReportPdfPath,
  deleteReportPdfBestEffort,
  signReportPdfUrl,
  uploadReportPdf,
} from "@/lib/storage/report-pdf-storage";
import {
  buildWhatsAppLink,
  buildWhatsAppMessage,
} from "@/lib/whatsapp/wa-link";
import type { AppointmentStatus } from "@/lib/types/database";
import type {
  TechnicalReportFull,
  TechnicalReportRow,
} from "@/lib/types/reports";
import type {
  NotificationLogRow,
  PrepareWhatsAppResponse,
} from "@/lib/types/notifications";

// @react-pdf/renderer + service-role client require Node APIs.
export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };
type AppointmentSlice = TechnicalReportFull["appointment"];

/**
 * POST /api/admin/reports/[id]/prepare-whatsapp — Phase 10c.
 *
 * Stages a manual-handoff WhatsApp delivery. Does NOT finalize the
 * report or appointment. Order of operations:
 *
 *   1. requireAdmin + validate path / body.
 *   2. Fetch report (RLS-gated; admin sees all). Must be
 *      `approved_for_delivery`.
 *   3. Fetch appointment. Must be `confirmada`. Phone must be 9 digits.
 *   4. Resolve actor names (soft-fail for PDF metadata).
 *   5. Generate PDF in memory.
 *   6. Upload PDF via service-role to `reports/<id>/<ts>.pdf`.
 *   7. Compute next WhatsApp attempt # (independent counter from
 *      email attempts — both channels can have rows for the same report).
 *   8. INSERT notification_logs row (status='pending').
 *   9. Sign URL for the uploaded PDF.
 *  10. Build wa.me link + Spanish message containing the signed URL.
 *  11. Return wa_link, signed_url, pdf_storage_path, notification snapshot.
 *
 * Cleanup on failure:
 *   - INSERT fail → best-effort delete the uploaded PDF.
 *   - Sign URL fail (after INSERT) → mark log as failed with the
 *     underlying error and best-effort delete the PDF; return 500.
 *
 * The pending log is the only DB side-effect of a successful prepare —
 * report and appointment state remain unchanged until the admin calls
 * /confirm-whatsapp-sent with confirmed=true.
 */
export async function POST(request: Request, { params }: Params) {
  try {
    const admin = await requireAdmin();

    // 1a. Path param.
    const rawParams = await params;
    const paramParse = reportIdParamSchema.safeParse(rawParams);
    if (!paramParse.success) {
      return NextResponse.json(
        { success: false, error: "ID inválido" },
        { status: 400 }
      );
    }
    const reportId = paramParse.data.id;

    // 1b. Body — empty / strict.
    let rawBody: unknown = {};
    try {
      const text = await request.text();
      if (text.trim().length > 0) {
        rawBody = JSON.parse(text);
      }
    } catch {
      return NextResponse.json(
        { success: false, error: "Cuerpo inválido" },
        { status: 400 }
      );
    }
    const bodyParse = prepareWhatsAppBodySchema.safeParse(rawBody);
    if (!bodyParse.success) {
      return NextResponse.json(
        {
          success: false,
          error: "Datos inválidos",
          details: bodyParse.error.issues.map((i) => ({
            field: String(i.path[0] ?? "unknown"),
            message: i.message,
          })),
        },
        { status: 400 }
      );
    }

    // 2. Fetch report — RLS-gated.
    const supabase = await createClient();
    const { data: reportRow, error: reportErr } = await supabase
      .from("technical_reports")
      .select("*")
      .eq("id", reportId)
      .maybeSingle();

    if (reportErr) {
      console.error("Failed to fetch report:", reportErr);
      return NextResponse.json(
        { success: false, error: "Error al obtener el informe" },
        { status: 500 }
      );
    }
    if (!reportRow) {
      return NextResponse.json(
        { success: false, error: "Informe no encontrado" },
        { status: 404 }
      );
    }
    const report = reportRow as TechnicalReportRow;

    if (report.report_status !== "approved_for_delivery") {
      return NextResponse.json(
        {
          success: false,
          error:
            "El informe debe estar aprobado para entrega antes de enviarse al cliente",
        },
        { status: 400 }
      );
    }

    // 3. Appointment.
    const APPOINTMENT_FIELDS =
      "id, car_plate, vehicle_brand, vehicle_model, full_name, dni, email, phone, status";
    const { data: appointmentRow, error: appointmentErr } = await supabase
      .from("appointment_requests")
      .select(APPOINTMENT_FIELDS)
      .eq("id", report.appointment_request_id)
      .maybeSingle();

    if (appointmentErr) {
      console.error("Failed to fetch appointment:", appointmentErr);
      return NextResponse.json(
        { success: false, error: "Error al obtener la cita asociada" },
        { status: 500 }
      );
    }
    if (!appointmentRow) {
      return NextResponse.json(
        { success: false, error: "Cita asociada no encontrada" },
        { status: 404 }
      );
    }
    const appointment = appointmentRow as AppointmentSlice;
    const apptStatus: AppointmentStatus = appointment.status;
    if (apptStatus !== "confirmada") {
      return NextResponse.json(
        { success: false, error: "La cita asociada no está confirmada" },
        { status: 400 }
      );
    }

    if (!/^\d{9}$/.test(appointment.phone)) {
      return NextResponse.json(
        {
          success: false,
          error:
            "El teléfono del cliente no tiene el formato esperado (9 dígitos). Actualízalo antes de enviar por WhatsApp.",
        },
        { status: 400 }
      );
    }

    // 4. Resolve actor names — soft-fail (PDF will render "—" otherwise).
    const actorIds = Array.from(
      new Set(
        [
          report.technician_staff_id,
          report.approved_by_admin_id,
          report.last_edited_by,
        ].filter((v): v is string => v !== null)
      )
    );
    const actorMap = new Map<string, { id: string; full_name: string }>();
    if (actorIds.length > 0) {
      const { data: actorRows, error: actorsErr } = await supabase
        .from("staff_profiles")
        .select("id, full_name")
        .in("id", actorIds);
      if (actorsErr) {
        console.error("Failed to fetch actor names:", actorsErr);
      } else {
        for (const row of (actorRows ?? []) as {
          id: string;
          full_name: string;
        }[]) {
          actorMap.set(row.id, row);
        }
      }
    }

    const reportFull: TechnicalReportFull = {
      ...report,
      technician: actorMap.get(report.technician_staff_id) ?? null,
      approved_by_admin: report.approved_by_admin_id
        ? actorMap.get(report.approved_by_admin_id) ?? null
        : null,
      last_editor: report.last_edited_by
        ? actorMap.get(report.last_edited_by) ?? null
        : null,
      appointment,
    };

    // 5. PDF generation.
    let pdfBuffer: Buffer;
    try {
      pdfBuffer = await generateReportPdf(reportFull);
    } catch (e) {
      console.error("PDF generation failed:", e);
      return NextResponse.json(
        { success: false, error: "Error al generar el PDF del informe" },
        { status: 500 }
      );
    }

    const sr = createServiceRoleClient();
    const reportShortId = report.id.slice(0, 8);
    const pdfPath = buildReportPdfPath(report.id);

    // 6. Upload.
    try {
      await uploadReportPdf(sr, pdfPath, pdfBuffer);
    } catch (e) {
      console.error("Storage upload failed:", e);
      return NextResponse.json(
        { success: false, error: "Error al subir el PDF al almacenamiento" },
        { status: 500 }
      );
    }

    // 7. Compute next attempt # for the WhatsApp channel (separate from
    //    the email channel — each notification_type has its own counter).
    const { data: prevAttempts, error: prevAttErr } = await sr
      .from("notification_logs")
      .select("attempt")
      .eq("technical_report_id", report.id)
      .eq("notification_type", "report_pdf_whatsapp")
      .order("attempt", { ascending: false })
      .limit(1);

    if (prevAttErr) {
      console.error("Failed to compute next attempt:", prevAttErr);
      await deleteReportPdfBestEffort(sr, pdfPath);
      return NextResponse.json(
        { success: false, error: "Error al preparar el registro de envío" },
        { status: 500 }
      );
    }

    const nextAttempt =
      (Array.isArray(prevAttempts) && prevAttempts.length > 0
        ? (prevAttempts[0] as { attempt: number }).attempt
        : 0) + 1;

    // 8. INSERT pending log.
    const { data: insertedLog, error: insertErr } = await sr
      .from("notification_logs")
      .insert({
        notification_type: "report_pdf_whatsapp",
        appointment_request_id: report.appointment_request_id,
        technical_report_id: report.id,
        recipient_email: null,
        recipient_phone: appointment.phone,
        status: "pending",
        provider: "whatsapp_manual",
        attempt: nextAttempt,
        created_by: admin.userId,
      })
      .select("*")
      .single();

    if (insertErr || !insertedLog) {
      console.error("Failed to insert notification log:", insertErr);
      await deleteReportPdfBestEffort(sr, pdfPath);
      return NextResponse.json(
        { success: false, error: "Error al registrar el envío" },
        { status: 500 }
      );
    }
    const logRow = insertedLog as NotificationLogRow;

    // 9. Sign URL. On failure, mark the log as failed + cleanup PDF.
    let signedUrl: string;
    let expiresAt: string;
    try {
      const signed = await signReportPdfUrl(sr, pdfPath);
      signedUrl = signed.signedUrl;
      expiresAt = signed.expiresAt;
    } catch (e) {
      const message =
        e instanceof Error ? e.message : "Sign URL failed";
      console.error("Sign URL failed:", message);
      await sr
        .from("notification_logs")
        .update({
          status: "failed",
          error_message: `Sign URL failed: ${message}`,
        })
        .eq("id", logRow.id);
      await deleteReportPdfBestEffort(sr, pdfPath);
      return NextResponse.json(
        { success: false, error: "Error al firmar el enlace del PDF" },
        { status: 500 }
      );
    }

    // 10. Build wa.me link.
    const message = buildWhatsAppMessage({
      customerName: appointment.full_name,
      carPlate: appointment.car_plate,
      signedUrl,
      reportShortId,
    });
    const waLink = buildWhatsAppLink(appointment.phone, message);

    const response: PrepareWhatsAppResponse = {
      success: true,
      data: {
        wa_link: waLink,
        signed_url: signedUrl,
        expires_at: expiresAt,
        pdf_storage_path: pdfPath,
        notification: logRow,
      },
    };
    return NextResponse.json(response);
  } catch (error) {
    if (error instanceof NextResponse) return error;
    throw error;
  }
}
