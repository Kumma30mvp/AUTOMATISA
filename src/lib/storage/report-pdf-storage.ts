import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Centralized storage helpers for the technical-report PDF bucket
 * (Phase 10). Reused by the send / resend-email / pdf-url routes so the
 * bucket name and object-path convention live in one place.
 *
 * All functions require a service-role Supabase client. Routes must call
 * `requireAdmin()` (mutations) or perform a standard RLS-gated visibility
 * check (read-only signed-URL minting) before invoking these helpers.
 */

export const REPORT_PDF_BUCKET = "technical-reports";

/**
 * Default signed-URL TTL: 30 days.
 * Override via `PDF_SIGNED_URL_TTL_SECONDS` env var (Phase 10 plan §6).
 * The accessor stays inline rather than going through src/lib/env.ts to
 * keep this file dependency-light and avoid adding env wiring outside
 * Step 8's allowed-files list.
 */
export const SIGNED_URL_DEFAULT_TTL_SECONDS = 60 * 60 * 24 * 30;

/**
 * Build the storage object path for a given report's PDF.
 *
 * The migration 008 RPC validates this path with:
 *   p_pdf_path LIKE 'reports/' || p_report_id::text || '/%.pdf'
 * so any path produced here must start with `reports/<reportId>/` and
 * end with `.pdf`. Each send attempt produces a unique timestamped file
 * so prior PDFs are preserved.
 *
 * Colons and dots in the ISO timestamp are replaced with hyphens to keep
 * the object key safe across S3-compatible backends and friendly to
 * download clients that interpret colons as drive separators.
 */
export function buildReportPdfPath(
  reportId: string,
  attemptIso: string = new Date().toISOString()
): string {
  const safe = attemptIso.replace(/[:.]/g, "-");
  return `reports/${reportId}/${safe}.pdf`;
}

export async function uploadReportPdf(
  client: SupabaseClient,
  path: string,
  buffer: Buffer
): Promise<void> {
  const { error } = await client.storage
    .from(REPORT_PDF_BUCKET)
    .upload(path, buffer, {
      contentType: "application/pdf",
      upsert: false,
    });
  if (error) {
    throw new Error(`Storage upload failed: ${error.message}`);
  }
}

export type SignedReportPdfUrl = {
  signedUrl: string;
  /** Wall-clock ISO timestamp when the URL stops working. Computed
   *  client-side as `now + ttl`; Supabase doesn't return it directly. */
  expiresAt: string;
};

export async function signReportPdfUrl(
  client: SupabaseClient,
  path: string,
  ttlSeconds: number = SIGNED_URL_DEFAULT_TTL_SECONDS
): Promise<SignedReportPdfUrl> {
  const { data, error } = await client.storage
    .from(REPORT_PDF_BUCKET)
    .createSignedUrl(path, ttlSeconds);

  if (error || !data?.signedUrl) {
    throw new Error(
      `Sign URL failed: ${error?.message ?? "no signed url returned"}`
    );
  }
  return {
    signedUrl: data.signedUrl,
    expiresAt: new Date(Date.now() + ttlSeconds * 1000).toISOString(),
  };
}

/**
 * Best-effort delete. Used for cleanup when an upload was successful but
 * a downstream step (notification_logs INSERT, RPC) fails. Never throws
 * — the caller already has a primary error to report and we don't want
 * the cleanup attempt to mask it.
 */
export async function deleteReportPdfBestEffort(
  client: SupabaseClient,
  path: string
): Promise<void> {
  try {
    await client.storage.from(REPORT_PDF_BUCKET).remove([path]);
  } catch {
    // Swallow — best-effort.
  }
}

/**
 * Download an existing PDF object as a Node Buffer. Used by the
 * resend-email route to re-attach the original send's PDF without
 * regenerating it. The returned buffer's lifetime is owned by the
 * caller; nothing is cached internally.
 *
 * Throws on storage errors so the route can mark the notification log
 * as failed with the underlying message.
 */
export async function downloadReportPdf(
  client: SupabaseClient,
  path: string
): Promise<Buffer> {
  const { data, error } = await client.storage
    .from(REPORT_PDF_BUCKET)
    .download(path);
  if (error || !data) {
    throw new Error(
      `Storage download failed: ${error?.message ?? "no data returned"}`
    );
  }
  const arrayBuffer = await data.arrayBuffer();
  return Buffer.from(arrayBuffer);
}
