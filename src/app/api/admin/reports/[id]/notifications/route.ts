import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireStaff } from "@/lib/auth/require";
import { reportIdParamSchema } from "@/lib/validations/notifications";
import type {
  NotificationLogListResponse,
  NotificationLogRow,
} from "@/lib/types/notifications";

type Params = { params: Promise<{ id: string }> };

/**
 * GET /api/admin/reports/[id]/notifications
 *
 * Read-only audit timeline for a technical report's outbound
 * notification attempts. Used by the Phase 10 NotificationLogList UI
 * component (Step 14).
 *
 * Auth: requireStaff() — both admin and staff may call.
 *
 * Visibility:
 *   - The report-visibility check uses the standard RLS-gated client.
 *     Phase 9's `staff_select_technical_reports` policy applies:
 *     admin sees all; staff sees own reports OR reports tied to
 *     confirmada appointments. Hidden rows return 404 (intentional —
 *     don't leak existence to unauthorized callers).
 *   - The notification_logs SELECT goes through migration 008's
 *     `staff_select_notification_logs` policy:
 *     admin sees all rows; staff sees rows only for reports where
 *     `technical_reports.technician_staff_id = auth.uid()`.
 *
 * Subtle interaction: staff who can SEE a report (because it's tied to
 * a confirmada appointment) but did NOT author it get an empty list
 * here — they cannot see another technician's send history. This is
 * the privacy posture per Phase 10 plan and is enforced at the DB.
 *
 * Service-role client is NOT used. Mutations are NOT allowed.
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

    const supabase = await createClient();

    // 1. Visibility gate: distinguish 404 (report invisible / missing)
    // from "exists but has no logs yet" (200 with empty array).
    const { data: reportRow, error: reportErr } = await supabase
      .from("technical_reports")
      .select("id")
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

    // 2. Fetch logs (RLS-scoped). Lifetime cap is 20 per report so a
    // single SELECT without LIMIT/pagination is safe.
    const { data: logsRows, error: logsErr } = await supabase
      .from("notification_logs")
      .select("*")
      .eq("technical_report_id", reportId)
      .order("created_at", { ascending: false });

    if (logsErr) {
      console.error("Failed to fetch notification logs:", logsErr);
      return NextResponse.json(
        {
          success: false,
          error: "Error al obtener el historial de envíos",
        },
        { status: 500 }
      );
    }

    const response: NotificationLogListResponse = {
      data: (logsRows ?? []) as NotificationLogRow[],
    };
    return NextResponse.json(response);
  } catch (error) {
    if (error instanceof NextResponse) return error;
    throw error;
  }
}
