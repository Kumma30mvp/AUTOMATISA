import type { ReportStatus } from "./reports";

// =============================================================
// Enums (mirror migration 008 + 009)
// =============================================================

/**
 * Mirrors the Postgres `notification_type` ENUM.
 *
 *   report_pdf_email    — legacy Phase 10/10b SMTP path. Kept for
 *                          backwards compatibility with historical rows
 *                          and as a fallback while WhatsApp is the
 *                          canonical delivery channel.
 *   report_pdf_whatsapp — Phase 10c manual-handoff WhatsApp delivery.
 *                          Added by migration 009.
 */
export type NotificationType = "report_pdf_email" | "report_pdf_whatsapp";

/**
 * Mirrors the Postgres `notification_status` ENUM created in migration 008.
 *
 *   pending — row inserted, send in flight (or aborted before resolution)
 *   sent    — provider accepted the message; provider_message_id is set
 *   failed  — provider error; error_message is set; admin can retry-send
 *
 * Note: `report_status='sent'` on the parent technical_report does NOT
 * imply this column is `sent`. See migration 008 header for the
 * separation rationale.
 */
export type NotificationStatus = "pending" | "sent" | "failed";

// =============================================================
// Row shape
// =============================================================

/**
 * Full `notification_logs` row as returned by Supabase. Mirrors the
 * column list in migration 008. Timestamps are ISO strings (Supabase
 * serializes TIMESTAMPTZ that way over the JSON wire).
 */
export type NotificationLogRow = {
  id: string;
  notification_type: NotificationType;
  appointment_request_id: string;
  technical_report_id: string;
  /** Email recipient. Nullable after Phase 10c (migration 009) — only
   *  populated for `report_pdf_email` rows. WhatsApp rows leave this NULL. */
  recipient_email: string | null;
  /** WhatsApp recipient (9-digit national number, no +51). Phase 10c.
   *  Populated for `report_pdf_whatsapp` rows; NULL for email rows. */
  recipient_phone: string | null;
  status: NotificationStatus;
  provider: string;
  provider_message_id: string | null;
  error_message: string | null;
  attempt: number;
  sent_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

/**
 * Compact log summary embedded in send / resend response payloads.
 * Legacy email-channel shape; the WhatsApp flow returns the full
 * NotificationLogRow instead.
 */
export type NotificationLogSummary = {
  id: string;
  status: NotificationStatus;
  attempt: number;
  provider_message_id: string | null;
  error_message: string | null;
  /** Nullable after Phase 10c — historical email rows populate this;
   *  WhatsApp rows leave it NULL. */
  recipient_email: string | null;
  created_at: string;
  sent_at: string | null;
};

// =============================================================
// Response shapes
// =============================================================

/**
 * GET /api/admin/reports/[id]/notifications
 * Returns rows ordered by created_at DESC.
 */
export type NotificationLogListResponse = {
  data: NotificationLogRow[];
};

/**
 * POST /api/admin/reports/[id]/send
 *
 * Successful invocation always means the DB transition committed
 * (report → sent, appointment → completada). `email_delivered` reflects
 * whether the email step that follows the commit also succeeded; on
 * `false`, admin can retry via the resend-email route. `signed_url` is
 * null only if the URL-signing step failed after a successful commit.
 */
export type SendReportResponse = {
  success: true;
  data: {
    report_id: string;
    appointment_id: string;
    report_status: ReportStatus; // 'sent' on success
    sent_at: string;
    pdf_storage_path: string;
    signed_url: string | null;
    email_delivered: boolean;
    notification: NotificationLogSummary;
  };
};

/**
 * POST /api/admin/reports/[id]/resend-email
 *
 * Re-uses the existing `pdf_storage_path` from the prior send (no PDF
 * regeneration). The report stays `sent`; only a new notification_logs
 * row is inserted with `attempt = previous_max + 1`.
 */
export type ResendReportEmailResponse = {
  success: true;
  data: {
    signed_url: string | null;
    email_delivered: boolean;
    notification: NotificationLogSummary;
  };
};

/**
 * GET /api/admin/reports/[id]/pdf-url
 *
 * Returns a freshly minted signed URL pointing at the existing
 * `pdf_storage_path`. The caller's report visibility is verified through
 * the standard RLS-gated SELECT before the service-role client signs.
 */
export type PdfUrlResponse = {
  data: {
    signed_url: string;
    /** ISO timestamp at which the signed URL stops working. */
    expires_at: string;
  };
};

/**
 * POST /api/admin/reports/[id]/prepare-whatsapp  (Phase 10c)
 *
 * Stages a WhatsApp delivery: generates the PDF, uploads it to private
 * Storage, inserts a `pending` notification_logs row, and signs a URL.
 * Does NOT call the RPC and does NOT change report or appointment state
 * — the admin manually sends the WhatsApp message, then confirms via
 * `confirm-whatsapp-sent`.
 */
export type PrepareWhatsAppResponse = {
  success: true;
  data: {
    /** Ready-to-open wa.me URL with prefilled Spanish message. */
    wa_link: string;
    /** Signed PDF URL embedded in the wa_link message — also returned
     *  separately so the UI can show a copy/preview affordance. */
    signed_url: string;
    /** ISO timestamp at which the signed URL expires. */
    expires_at: string;
    /** Storage path of the uploaded PDF. Round-tripped by the client to
     *  the confirm route — both server-side regex checks AND the RPC
     *  re-validate the path against `reports/<reportId>/...pdf`. */
    pdf_storage_path: string;
    /** Full row of the freshly inserted pending log. The WhatsApp flow
     *  returns the row directly (rather than the legacy
     *  NotificationLogSummary) so both recipient_email and
     *  recipient_phone are present for the UI. */
    notification: NotificationLogRow;
  };
};

/**
 * POST /api/admin/reports/[id]/confirm-whatsapp-sent  (Phase 10c)
 *
 * Finishes a previously-prepared WhatsApp delivery. `cancelled=false`
 * means the admin confirmed the message was sent — the RPC fires and
 * the report/appointment transition atomically. `cancelled=true` means
 * the admin aborted post-prepare — the pending log is marked failed,
 * the orphaned PDF is best-effort deleted, and no state changes.
 */
export type ConfirmWhatsAppResponse = {
  success: true;
  data: {
    /** false = sent + completed. true = admin cancelled. */
    cancelled: boolean;
    /** Effective report status after this call. `sent` on confirmed,
     *  `approved_for_delivery` on cancellation. */
    report_status: ReportStatus;
    /** ISO timestamp; only populated when cancelled=false. */
    sent_at: string | null;
    /** Updated log row. */
    notification: NotificationLogRow;
  };
};
