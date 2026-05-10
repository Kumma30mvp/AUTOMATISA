import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { requireAdmin } from "@/lib/auth/require";
import {
  reportIdParamSchema,
  sendReportBodySchema,
} from "@/lib/validations/notifications";
import { generateReportPdf } from "@/lib/pdf/report-pdf";
import { sendReportEmail } from "@/lib/email/smtp";
import {
  buildReportPdfPath,
  deleteReportPdfBestEffort,
  signReportPdfUrl,
  uploadReportPdf,
} from "@/lib/storage/report-pdf-storage";
import type { AppointmentStatus } from "@/lib/types/database";
import type {
  TechnicalReportFull,
  TechnicalReportRow,
} from "@/lib/types/reports";
import type {
  NotificationLogRow,
  NotificationLogSummary,
  SendReportResponse,
} from "@/lib/types/notifications";

// @react-pdf/renderer + Resend SDK + service-role client require Node APIs.
export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

type AppointmentSlice = TechnicalReportFull["appointment"];

/**
 * POST /api/admin/reports/[id]/send — canonical Send-PDF-and-complete.
 *
 * Pre-conditions (HTTP 4xx if violated):
 *   - admin session (requireAdmin)
 *   - valid UUID path param
 *   - empty / strict body
 *   - report exists, is `approved_for_delivery`
 *   - parent appointment is `confirmada`
 *
 * Order of operations:
 *   1. Validate inputs.
 *   2. Build TechnicalReportFull via RLS-gated SELECT (admin sees all).
 *   3. Generate PDF in memory.
 *   4. Upload PDF via service-role.
 *   5. INSERT notification_logs row (status='pending', attempt=N).
 *   6. Call SECURITY DEFINER RPC fn_send_and_complete_report — atomic
 *      report→sent + appointment→completada in one transaction.
 *   7. (Best-effort) Sign URL for the response. Email does NOT depend
 *      on this; the PDF is attached as a Buffer.
 *   8. Send email with PDF attached.
 *   9. UPDATE the notification_logs row based on email outcome:
 *        sent  → provider_message_id, sent_at, status='sent'
 *        fail  → error_message, status='failed'
 *
 * Failure modes (see route summary in plan §9):
 *   - PDF gen / upload / log INSERT / RPC fail → no DB finalization;
 *     uploaded PDF is best-effort deleted; pending log (if inserted) is
 *     marked failed; route returns 4xx/5xx error.
 *   - Sign URL fails AFTER RPC commit → non-fatal; signed_url=null,
 *     email still attempts (PDF is attached).
 *   - Email fails AFTER RPC commit → log row marked failed; response
 *     returns success=true with email_delivered=false. Admin retries
 *     via /resend-email (Step 9).
 *
 * Service-role usage is gated behind requireAdmin() at entry. Service
 * role is never imported by client code.
 */
export async function POST(request: Request, { params }: Params) {
  try {
    const admin = await requireAdmin();

    // 1a. Path param validation.
    const rawParams = await params;
    const paramParse = reportIdParamSchema.safeParse(rawParams);
    if (!paramParse.success) {
      return NextResponse.json(
        { success: false, error: "ID inválido" },
        { status: 400 }
      );
    }
    const reportId = paramParse.data.id;

    // 1b. Body validation. Send takes no body; allow missing / empty,
    // reject anything else (sendReportBodySchema is .strict()).
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
    const bodyParse = sendReportBodySchema.safeParse(rawBody);
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

    // 2. Fetch report + joined data via RLS-gated client (admin sees all).
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

    // Parent appointment.
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
        {
          success: false,
          error: "La cita asociada no está confirmada",
        },
        { status: 400 }
      );
    }

    // Resolve actor names — soft-fail (PDF will show "—" if a name is
    // missing; not worth aborting the send for).
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

    // 3. Generate PDF in memory.
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

    // From here on, mutating ops use the service-role client.
    const sr = createServiceRoleClient();
    const reportShortId = report.id.slice(0, 8);
    const pdfPath = buildReportPdfPath(report.id);
    const pdfFilename = `informe-${reportShortId}.pdf`;

    // 4. Upload PDF (no DB change yet).
    try {
      await uploadReportPdf(sr, pdfPath, pdfBuffer);
    } catch (e) {
      console.error("Storage upload failed:", e);
      return NextResponse.json(
        { success: false, error: "Error al subir el PDF al almacenamiento" },
        { status: 500 }
      );
    }

    // 5. Compute next attempt and INSERT pending log.
    const { data: prevAttempts, error: prevAttErr } = await sr
      .from("notification_logs")
      .select("attempt")
      .eq("technical_report_id", report.id)
      .eq("notification_type", "report_pdf_email")
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
      await deleteReportPdfBestEffort(sr, pdfPath);
      return NextResponse.json(
        { success: false, error: "Error al registrar el envío" },
        { status: 500 }
      );
    }
    const logRow = insertedLog as NotificationLogRow;

    // 6. Atomic DB finalization via SECURITY DEFINER RPC. Inside the RPC:
    //    - validates inputs (report_id, pdf_path matches `reports/<id>/...pdf`,
    //      admin_id is active admin)
    //    - SELECT FOR UPDATE locks both rows
    //    - re-validates report_status='approved_for_delivery' and
    //      appointment.status='confirmada'
    //    - sets app.allow_report_sent='true' transaction-locally
    //    - UPDATEs report → sent (sent_at, pdf_storage_path)
    //    - UPDATEs appointment → completada (completed_at, completed_by_admin_id)
    const { error: rpcErr } = await sr.rpc("fn_send_and_complete_report", {
      p_report_id: report.id,
      p_pdf_path: pdfPath,
      p_admin_id: admin.userId,
    });

    if (rpcErr) {
      console.error("RPC fn_send_and_complete_report failed:", rpcErr);
      await deleteReportPdfBestEffort(sr, pdfPath);
      // Mark the pending row as failed for audit. We don't care if this
      // UPDATE fails — the row already exists with status='pending', and
      // the response carries the primary error.
      await sr
        .from("notification_logs")
        .update({
          status: "failed",
          error_message: `RPC failed: ${rpcErr.message ?? "unknown"}`,
        })
        .eq("id", logRow.id);

      // 22023 (invalid_parameter_value) and P0002 (no_data_found) are
      // the documented RAISE codes from fn_send_and_complete_report and
      // its pre-checks. Map to 409 (state changed mid-flight) so admin
      // gets a friendlier response than a generic 500.
      const code =
        typeof rpcErr.code === "string" ? rpcErr.code : undefined;
      const isInvalidState = code === "22023" || code === "P0002";
      return NextResponse.json(
        {
          success: false,
          error: isInvalidState
            ? "El informe ya no está aprobado para entrega o la cita cambió de estado"
            : "Error al finalizar el envío del informe",
        },
        { status: isInvalidState ? 409 : 500 }
      );
    }

    // 7. RPC committed. Best-effort sign URL for the response. Email
    //    delivery does NOT depend on this — the PDF is attached as a
    //    Buffer. signed_url=null on failure; admin can refresh it later
    //    via the pdf-url route (Step 11).
    let signedUrl: string | null = null;
    try {
      const signed = await signReportPdfUrl(sr, pdfPath);
      signedUrl = signed.signedUrl;
    } catch (e) {
      console.error("Sign URL failed (non-fatal):", e);
    }

    // 8. Send email with PDF attached. Note: the customer email already
    //    passed zod validation when the appointment was created, so
    //    we trust appointment.email here.
    let emailDelivered = false;
    let providerMessageId: string | null = null;
    let emailError: string | null = null;
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
      emailError = e instanceof Error ? e.message : "Email send failed";
      console.error("Email send failed:", emailError);
    }

    // 9. UPDATE notification log row based on email outcome.
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
          error_message: emailError ?? "Email send failed",
        };

    const { data: updatedLog, error: updateLogErr } = await sr
      .from("notification_logs")
      .update(updatePayload)
      .eq("id", logRow.id)
      .select("*")
      .single();

    if (updateLogErr) {
      // Rare: log row UPDATE failed, but report is already sent +
      // appointment completada. Surface a warning in the server log;
      // response uses the in-memory snapshot.
      console.error(
        "Failed to update notification log post-email (non-fatal):",
        updateLogErr
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

    // Read back sent_at via service-role for an authoritative timestamp.
    const { data: freshReport } = await sr
      .from("technical_reports")
      .select("sent_at")
      .eq("id", report.id)
      .single();
    const sentAt =
      (freshReport as { sent_at: string | null } | null)?.sent_at ?? nowIso;

    const response: SendReportResponse = {
      success: true,
      data: {
        report_id: report.id,
        appointment_id: report.appointment_request_id,
        report_status: "sent",
        sent_at: sentAt,
        pdf_storage_path: pdfPath,
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
