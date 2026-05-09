import type { ReportStatus } from "./reports";

// =============================================================
// Enums (mirror migration 008)
// =============================================================

/**
 * Mirrors the Postgres `notification_type` ENUM created in migration 008.
 * Single member in v1; the enum is extensible (e.g., SMS, WhatsApp, etc.)
 * — add to both the DB ENUM and this union when widening.
 */
export type NotificationType = "report_pdf_email";

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
  recipient_email: string;
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
 * Compact log summary embedded in send / resend response payloads. Lets
 * the UI render the latest attempt's status badge without fetching the
 * full notifications list.
 */
export type NotificationLogSummary = {
  id: string;
  status: NotificationStatus;
  attempt: number;
  provider_message_id: string | null;
  error_message: string | null;
  recipient_email: string;
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
