import { z } from "zod";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Validates the `[id]` path segment for the
 * /api/admin/reports/[id]/* family of routes (send, resend-email,
 * pdf-url, notifications).
 *
 * Reuses the same UUID regex used inline by Phase 9 routes so the
 * surface stays consistent. Routes can use either this schema or the
 * inline regex; the schema gives field-level error details suitable for
 * an `ApiErrorResponse` payload.
 */
export const reportIdParamSchema = z.object({
  id: z.string().regex(UUID_REGEX, "ID inválido"),
});

export type ReportIdParam = z.infer<typeof reportIdParamSchema>;

/**
 * POST /api/admin/reports/[id]/send  body schema.
 *
 * The send route takes no body. `.strict()` rejects any unknown key so a
 * future caller cannot smuggle in `{ skipEmail: true }` or similar
 * without a route-level change. Routes should also accept a missing /
 * empty body without error (the body parse path in the route handler is
 * what handles that case).
 */
export const sendReportBodySchema = z.object({}).strict();

export type SendReportBody = z.infer<typeof sendReportBodySchema>;

/**
 * POST /api/admin/reports/[id]/resend-email  body schema.
 *
 * Same posture as `sendReportBodySchema` — no body required, `.strict()`
 * to refuse smuggled flags.
 */
export const resendReportEmailBodySchema = z.object({}).strict();

export type ResendReportEmailBody = z.infer<typeof resendReportEmailBodySchema>;
