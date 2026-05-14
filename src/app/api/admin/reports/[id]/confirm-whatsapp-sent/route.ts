import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { requireAdmin } from "@/lib/auth/require";
import {
  confirmWhatsAppSentBodySchema,
  reportIdParamSchema,
} from "@/lib/validations/notifications";
import { deleteReportPdfBestEffort } from "@/lib/storage/report-pdf-storage";
import type {
  ConfirmWhatsAppResponse,
  NotificationLogRow,
} from "@/lib/types/notifications";

// Service-role client + RPC require Node APIs.
export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

/**
 * POST /api/admin/reports/[id]/confirm-whatsapp-sent — Phase 10c.
 *
 * Finishes (or cancels) a previously-prepared WhatsApp delivery.
 *
 * Validation order:
 *   1. requireAdmin.
 *   2. Path param + body schema.
 *   3. pdf_storage_path must match `reports/<reportId>/<...>.pdf` —
 *      the RPC also enforces this server-side as a backstop.
 *   4. Load the notification log (service-role): must belong to this
 *      report, be of type `report_pdf_whatsapp`, in `pending` status.
 *
 * Branching:
 *   - confirmed=true  → call fn_send_and_complete_report. On success,
 *     mark log as sent (sent_at=now()). On RPC failure, mark log as
 *     failed with the underlying error and best-effort delete the PDF
 *     (the report stays approved_for_delivery; admin can re-prepare).
 *   - confirmed=false → mark log as failed/admin_cancelled,
 *     best-effort delete the orphan PDF. Report + appointment unchanged.
 *
 * Returns ConfirmWhatsAppResponse with the resulting log snapshot and
 * the new effective report_status.
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

    // 1b. Body.
    let rawBody: unknown;
    try {
      rawBody = await request.json();
    } catch {
      return NextResponse.json(
        { success: false, error: "Cuerpo inválido" },
        { status: 400 }
      );
    }
    const bodyParse = confirmWhatsAppSentBodySchema.safeParse(rawBody);
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
    const {
      confirmed,
      notification_log_id: logId,
      pdf_storage_path: pdfPath,
    } = bodyParse.data;

    // 2. Storage-path shape check: prefix bound to this report uuid +
    //    .pdf suffix. The RPC also enforces this via LIKE.
    const pathRegex = new RegExp(
      `^reports/${reportId}/[^/]+\\.pdf$`,
      "i"
    );
    if (!pathRegex.test(pdfPath)) {
      return NextResponse.json(
        {
          success: false,
          error: "pdf_storage_path no corresponde a este informe",
        },
        { status: 400 }
      );
    }

    // 3. Look up the pending log via service-role. Must belong to this
    //    report and be a pending WhatsApp row.
    const sr = createServiceRoleClient();
    const { data: logRow, error: logErr } = await sr
      .from("notification_logs")
      .select("*")
      .eq("id", logId)
      .eq("technical_report_id", reportId)
      .eq("notification_type", "report_pdf_whatsapp")
      .eq("status", "pending")
      .maybeSingle();

    if (logErr) {
      console.error("Failed to fetch notification log:", logErr);
      return NextResponse.json(
        { success: false, error: "Error al consultar el registro de envío" },
        { status: 500 }
      );
    }
    if (!logRow) {
      return NextResponse.json(
        {
          success: false,
          error:
            "El registro de envío no existe, no corresponde a este informe o ya fue resuelto",
        },
        { status: 404 }
      );
    }
    const log = logRow as NotificationLogRow;

    // ───────────── Branch: admin cancelled ─────────────
    if (!confirmed) {
      const cancelPayload = {
        status: "failed" as const,
        error_message: "admin_cancelled",
      };
      const { data: updated, error: updateErr } = await sr
        .from("notification_logs")
        .update(cancelPayload)
        .eq("id", log.id)
        .select("*")
        .single();

      if (updateErr) {
        console.error(
          "Failed to mark notification log as cancelled:",
          updateErr
        );
        return NextResponse.json(
          {
            success: false,
            error: "Error al cancelar el registro de envío",
          },
          { status: 500 }
        );
      }

      // Orphan PDF cleanup. Best-effort.
      await deleteReportPdfBestEffort(sr, pdfPath);

      const cancelledLog: NotificationLogRow =
        (updated as NotificationLogRow | null) ?? {
          ...log,
          ...cancelPayload,
        };

      const response: ConfirmWhatsAppResponse = {
        success: true,
        data: {
          cancelled: true,
          report_status: "approved_for_delivery",
          sent_at: null,
          notification: cancelledLog,
        },
      };
      return NextResponse.json(response);
    }

    // ───────────── Branch: admin confirmed sent ─────────────
    // RPC re-validates state under SELECT FOR UPDATE inside the
    // SECURITY DEFINER transaction, sets app.allow_report_sent
    // transaction-locally, and atomically writes report→sent +
    // appointment→completada.
    const { error: rpcErr } = await sr.rpc("fn_send_and_complete_report", {
      p_report_id: reportId,
      p_pdf_path: pdfPath,
      p_admin_id: admin.userId,
    });

    if (rpcErr) {
      console.error("RPC fn_send_and_complete_report failed:", rpcErr);
      // Mark log failed. Don't delete the PDF — admin may retry the
      // confirm via a fresh prepare, and an orphan PDF is cheaper than
      // a spurious regenerate.
      await sr
        .from("notification_logs")
        .update({
          status: "failed",
          error_message: `RPC failed: ${rpcErr.message ?? "unknown"}`,
        })
        .eq("id", log.id);

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

    // RPC committed. Update log → sent.
    const nowIso = new Date().toISOString();
    const sentPayload = {
      status: "sent" as const,
      sent_at: nowIso,
      error_message: null,
    };
    const { data: updated, error: updateErr } = await sr
      .from("notification_logs")
      .update(sentPayload)
      .eq("id", log.id)
      .select("*")
      .single();

    if (updateErr) {
      // Non-fatal — DB transition already committed, the customer
      // already has the message. Surface a server log; response uses
      // the in-memory snapshot.
      console.error(
        "Failed to update notification log post-confirm (non-fatal):",
        updateErr
      );
    }

    const sentLog = (updated as NotificationLogRow | null) ?? {
      ...log,
      ...sentPayload,
    };

    // Authoritative sent_at from the report row (the RPC wrote it
    // inside the same transaction).
    const { data: freshReport } = await sr
      .from("technical_reports")
      .select("sent_at")
      .eq("id", reportId)
      .single();
    const sentAt =
      (freshReport as { sent_at: string | null } | null)?.sent_at ?? nowIso;

    const response: ConfirmWhatsAppResponse = {
      success: true,
      data: {
        cancelled: false,
        report_status: "sent",
        sent_at: sentAt,
        notification: sentLog,
      },
    };
    return NextResponse.json(response);
  } catch (error) {
    if (error instanceof NextResponse) return error;
    throw error;
  }
}
