import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { requireStaff } from "@/lib/auth/require";
import { reportIdParamSchema } from "@/lib/validations/notifications";
import {
  signReportPdfUrl,
  SIGNED_URL_DEFAULT_TTL_SECONDS,
} from "@/lib/storage/report-pdf-storage";
import type { PdfUrlResponse } from "@/lib/types/notifications";
import type { TechnicalReportRow } from "@/lib/types/reports";

// Service-role client uses @supabase/supabase-js (Node-only).
export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

/**
 * GET /api/admin/reports/[id]/pdf-url
 *
 * Returns a freshly minted signed URL pointing at the existing PDF for
 * a sent report. Used by the report editor (admin/staff) to refresh
 * the customer-facing link after the original send's URL expires, or
 * to download the PDF without surfacing a direct storage path.
 *
 * Auth + visibility:
 *   - `requireStaff()` at entry.
 *   - Standard RLS-gated SELECT on technical_reports — admin sees all;
 *     staff sees own OR confirmada-tied reports. Hidden rows return
 *     404 (intentional — don't leak existence).
 *   - Only AFTER the visibility check passes does the route use the
 *     service-role client to mint a signed URL. The service-role
 *     surface is reduced to mechanical signing; the access decision is
 *     made by ordinary RLS upstream.
 *
 * Pre-conditions for signing:
 *   - report_status = 'sent'
 *   - pdf_storage_path is not null
 *
 * No mutation. No download. No email. No fn_send_and_complete_report
 * call. The bucket stays private; signed URLs are the only customer-
 * accessible access path.
 *
 * TTL: SIGNED_URL_DEFAULT_TTL_SECONDS (30 days). The
 * `PDF_SIGNED_URL_TTL_SECONDS` env override is not wired in this step
 * (env.ts is not on Step 11's allowed-files list); the default is
 * documented in the storage helper and matches plan §6.
 */
export async function GET(_request: Request, { params }: Params) {
  try {
    await requireStaff();

    const rawParams = await params;
    const paramParse = reportIdParamSchema.safeParse(rawParams);
    if (!paramParse.success) {
      return NextResponse.json(
        { success: false, error: "ID inválido" },
        { status: 400 }
      );
    }
    const reportId = paramParse.data.id;

    // 1. RLS-gated visibility check + state read in one round-trip.
    const supabase = await createClient();
    const { data: reportRow, error: reportErr } = await supabase
      .from("technical_reports")
      .select("id, report_status, pdf_storage_path")
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

    const report = reportRow as Pick<
      TechnicalReportRow,
      "id" | "report_status" | "pdf_storage_path"
    >;

    if (report.report_status !== "sent") {
      return NextResponse.json(
        {
          success: false,
          error: "El informe aún no ha sido enviado al cliente",
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

    // 2. RLS check passed. Mint the signed URL via service-role.
    const sr = createServiceRoleClient();
    let signedUrl: string;
    let expiresAt: string;
    try {
      const signed = await signReportPdfUrl(
        sr,
        report.pdf_storage_path,
        SIGNED_URL_DEFAULT_TTL_SECONDS
      );
      signedUrl = signed.signedUrl;
      expiresAt = signed.expiresAt;
    } catch (e) {
      console.error("Sign URL failed:", e);
      return NextResponse.json(
        {
          success: false,
          error: "Error al generar el enlace del PDF",
        },
        { status: 500 }
      );
    }

    const response: PdfUrlResponse = {
      data: {
        signed_url: signedUrl,
        expires_at: expiresAt,
      },
    };
    return NextResponse.json(response);
  } catch (error) {
    if (error instanceof NextResponse) return error;
    throw error;
  }
}
