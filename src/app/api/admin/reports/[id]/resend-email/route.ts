import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { requireAdmin } from "@/lib/auth/require";
import {
  reportIdParamSchema,
  resendReportEmailBodySchema,
} from "@/lib/validations/notifications";
import { sendReportEmail } from "@/lib/email/smtp";
import {
  downloadReportPdf,
  signReportPdfUrl,
} from "@/lib/storage/report-pdf-storage";
import type { TechnicalReportRow } from "@/lib/types/reports";
import type {
  NotificationLogRow,
  NotificationLogSummary,
  ResendReportEmailResponse,
} from "@/lib/types/notifications";

// Resend SDK + service-role client require Node APIs.
export const runtime = "nodejs";

// Retry caps (plan §10).
const MAX_ATTEMPTS_PER_HOUR = 5;
const MAX_LIFETIME_ATTEMPTS = 20;

type Params = { params: Promise<{ id: string }> };

type AppointmentSliceForEmail = {
  id: string;
  car_plate: string;
  full_name: string | null;
  email: string;
};

/**
 * POST /api/admin/reports/[id]/resend-email — re-attempt customer
 * email delivery for a report that has already been sent.
 *
 * Pre-conditions:
 *   - admin session
 *   - valid UUID path param
 *   - empty / strict body
 *   - report exists, report_status = 'sent', pdf_storage_path is set
 *   - rate limits not exceeded:
 *       MAX_ATTEMPTS_PER_HOUR  (5 in the last rolling hour)
 *       MAX_LIFETIME_ATTEMPTS  (20 lifetime per report)
 *     Counts include the original send so a freshly-sent report has 1
 *     against the cap and admin gets 4 hourly retries / 19 lifetime.
 *
 * Order of operations:
 *   1. Validate inputs.
 *   2. Fetch report (RLS-gated). Verify status + pdf_storage_path.
 *   3. Fetch appointment slice for email recipient.
 *   4. Read prior logs for retry counts + max(attempt).
 *   5. Reject 429 if caps exceeded.
 *   6. INSERT pending log (attempt = max + 1).
 *   7. Download the existing PDF from Storage via service-role.
 *   8. Best-effort sign URL for the response (non-fatal).
 *   9. Send email with the downloaded PDF attached.
 *  10. UPDATE the log row based on outcome.
 *
 * Does NOT change report_status, sent_at, pdf_storage_path,
 * appointment.status, completed_at, or completed_by_admin_id. Resend is
 * a notification-layer operation; the underlying DB state is whatever
 * the original /send produced.
 *
 * On any post-INSERT failure (download / email): the log row is marked
 * 'failed', and the response returns success=true with
 * email_delivered=false. The admin can retry within the rate caps.
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

    // 1b. Body — empty / strict (no body allowed).
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
    const bodyParse = resendReportEmailBodySchema.safeParse(rawBody);
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

    // 2. Fetch report (RLS-gated; admin sees all).
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

    if (report.report_status !== "sent") {
      return NextResponse.json(
        {
          success: false,
          error:
            "Solo se pueden reenviar informes que ya hayan sido enviados al cliente",
        },
        { status: 400 }
      );
    }
    if (!report.pdf_storage_path) {
      return NextResponse.json(
        {
          success: false,
          error: "El informe no tiene un PDF almacenado",
        },
        { status: 400 }
      );
    }
    const pdfPath = report.pdf_storage_path;

    // 3. Appointment slice for the email.
    const { data: appointmentRow, error: apptErr } = await supabase
      .from("appointment_requests")
      .select("id, car_plate, full_name, email")
      .eq("id", report.appointment_request_id)
      .maybeSingle();

    if (apptErr) {
      console.error("Failed to fetch appointment:", apptErr);
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
    const appointment = appointmentRow as AppointmentSliceForEmail;

    // 4. Read prior logs in one round-trip; derive counts + max(attempt).
    const sr = createServiceRoleClient();
    const oneHourAgoIso = new Date(
      Date.now() - 60 * 60 * 1000
    ).toISOString();

    const { data: priorLogs, error: priorErr } = await sr
      .from("notification_logs")
      .select("attempt, created_at")
      .eq("technical_report_id", report.id)
      .eq("notification_type", "report_pdf_email");

    if (priorErr) {
      console.error("Failed to read prior logs:", priorErr);
      return NextResponse.json(
        {
          success: false,
          error: "Error al verificar el historial de envíos",
        },
        { status: 500 }
      );
    }
    const logs = (priorLogs ?? []) as {
      attempt: number;
      created_at: string;
    }[];
    const lifetimeCount = logs.length;
    const lastHourCount = logs.filter(
      (l) => l.created_at > oneHourAgoIso
    ).length;
    const maxAttempt = logs.reduce(
      (m, l) => Math.max(m, l.attempt),
      0
    );

    // 5. Cap enforcement.
    if (lifetimeCount >= MAX_LIFETIME_ATTEMPTS) {
      return NextResponse.json(
        {
          success: false,
          error: `Se alcanzó el límite de ${MAX_LIFETIME_ATTEMPTS} envíos para este informe.`,
        },
        { status: 429 }
      );
    }
    if (lastHourCount >= MAX_ATTEMPTS_PER_HOUR) {
      return NextResponse.json(
        {
          success: false,
          error: `Se alcanzó el límite de ${MAX_ATTEMPTS_PER_HOUR} envíos por hora. Intenta nuevamente más tarde.`,
        },
        { status: 429 }
      );
    }

    const nextAttempt = maxAttempt + 1;

    // 6. INSERT pending log.
    const { data: insertedLog, error: insertErr } = await sr
      .from("notification_logs")
      .insert({
        notification_type: "report_pdf_email",
        appointment_request_id: report.appointment_request_id,
        technical_report_id: report.id,
        recipient_email: appointment.email,
        status: "pending",
        provider: "gmail_smtp",
        attempt: nextAttempt,
        created_by: admin.userId,
      })
      .select("*")
      .single();

    if (insertErr || !insertedLog) {
      console.error("Failed to insert notification log:", insertErr);
      return NextResponse.json(
        { success: false, error: "Error al registrar el reenvío" },
        { status: 500 }
      );
    }
    const logRow = insertedLog as NotificationLogRow;

    // 7-9. Download PDF, sign URL, send email. All post-INSERT failures
    // get marked on the log row; response remains 200 partial-failure
    // so the admin can retry.
    let emailDelivered = false;
    let providerMessageId: string | null = null;
    let errorMessage: string | null = null;
    let signedUrl: string | null = null;
    let pdfBuffer: Buffer | null = null;

    try {
      pdfBuffer = await downloadReportPdf(sr, pdfPath);
    } catch (e) {
      errorMessage =
        e instanceof Error ? e.message : "Storage download failed";
      console.error("PDF download failed:", errorMessage);
    }

    if (pdfBuffer !== null) {
      try {
        const signed = await signReportPdfUrl(sr, pdfPath);
        signedUrl = signed.signedUrl;
      } catch (e) {
        console.error("Sign URL failed (non-fatal):", e);
      }

      const reportShortId = report.id.slice(0, 8);
      const pdfFilename = `informe-${reportShortId}.pdf`;
      try {
        const result = await sendReportEmail({
          to: appointment.email,
          customerName: appointment.full_name,
          carPlate: appointment.car_plate,
          reportShortId,
          pdfBuffer,
          pdfFilename,
        });
        emailDelivered = true;
        providerMessageId = result.providerMessageId;
      } catch (e) {
        errorMessage = e instanceof Error ? e.message : "Email send failed";
        console.error("Email send failed:", errorMessage);
      }
    }

    // 10. UPDATE log based on outcome.
    const nowIso = new Date().toISOString();
    const updatePayload = emailDelivered
      ? {
          status: "sent" as const,
          provider_message_id: providerMessageId,
          sent_at: nowIso,
          error_message: null,
        }
      : {
          status: "failed" as const,
          error_message: errorMessage ?? "Resend failed",
        };

    const { data: updatedLog, error: updateErr } = await sr
      .from("notification_logs")
      .update(updatePayload)
      .eq("id", logRow.id)
      .select("*")
      .single();

    if (updateErr) {
      console.error(
        "Failed to update notification log post-email (non-fatal):",
        updateErr
      );
    }

    const finalLog = (updatedLog as NotificationLogRow | null) ?? {
      ...logRow,
      ...updatePayload,
    };

    const notification: NotificationLogSummary = {
      id: finalLog.id,
      status: finalLog.status,
      attempt: finalLog.attempt,
      provider_message_id: finalLog.provider_message_id,
      error_message: finalLog.error_message,
      recipient_email: finalLog.recipient_email,
      created_at: finalLog.created_at,
      sent_at: finalLog.sent_at,
    };

    const response: ResendReportEmailResponse = {
      success: true,
      data: {
        signed_url: signedUrl,
        email_delivered: emailDelivered,
        notification,
      },
    };
    return NextResponse.json(response);
  } catch (error) {
    if (error instanceof NextResponse) return error;
    throw error;
  }
}
