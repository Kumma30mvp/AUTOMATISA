import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireStaff } from "@/lib/auth/require";
import {
  reportReadyForReviewContentGate,
  reportTransitionSchema,
} from "@/lib/validations/reports";
import type {
  ReportStatus,
  ReportTransitionResponse,
  ReportTransitionTarget,
  TechnicalReportRow,
} from "@/lib/types/reports";

type Params = { params: Promise<{ id: string }> };

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Role-specific transition policy for Phase 9.
 *
 * The DB has no transition table — RLS allows any non-`sent` UPDATE
 * for admins; the staff_update WITH CHECK predicate restricts staff
 * to draft|ready_for_review on own reports; trg_30_block_into_sent
 * caps the `sent` state (Phase 10 lifts this). These maps encode the
 * caller-facing policy enforced at the API boundary.
 *
 * Note vs `ALLOWED_REPORT_TRANSITIONS` in src/lib/types/reports.ts:
 * the central map encodes the core state machine. The admin map below
 * is a superset that additionally allows `approved_for_delivery → draft`
 * as an admin escape hatch (a single-step revert that would otherwise
 * require two PATCHes through `ready_for_review`). Per the Phase 9
 * Step 7 directive.
 */
const STAFF_ALLOWED_FROM: Record<ReportStatus, ReportTransitionTarget[]> = {
  draft: ["ready_for_review"],
  ready_for_review: [],
  approved_for_delivery: [],
  sent: [],
};

const ADMIN_ALLOWED_FROM: Record<ReportStatus, ReportTransitionTarget[]> = {
  draft: ["ready_for_review"],
  ready_for_review: ["draft", "approved_for_delivery"],
  approved_for_delivery: ["draft", "ready_for_review"],
  sent: [],
};

/**
 * POST /api/admin/reports/[id]/transition
 *
 * Changes a technical report's `report_status`. Body schema:
 *   { to: 'draft' | 'ready_for_review' | 'approved_for_delivery' }
 * `sent` is excluded by reportTransitionSchema's z.enum — Phase 10
 * owns the only path that writes `sent` (atomic Send-PDF-and-complete
 * RPC). DB trigger trg_30_…_block_into_sent_phase9 is the safety net.
 *
 * Pre-checks (in order):
 *   1. UUID validation.
 *   2. zod schema validation (rejects `sent`, unknown keys).
 *   3. Load the row (RLS-gated). Missing → 404.
 *   4. Reject same-state no-op with 400.
 *   5. Allowed-transition map for the caller's role:
 *        - Staff: only `draft → ready_for_review`.
 *        - Admin: full set excluding `sent`.
 *      Mismatch returns 403 (staff) or 400 (admin — structurally bad).
 *   6. Staff-only ownership check: report.technician_staff_id must
 *      equal session.userId. RLS staff_update would deny anyway, but
 *      this surfaces a friendly 403 ahead of the UPDATE.
 *   7. Content gate (any caller) when transitioning `draft →
 *      ready_for_review`: requires non-empty initial_symptoms,
 *      diagnosis_work_performed, final_observations, conclusions.
 *      Returns 400 + field-level details on failure.
 *
 * approved_by_admin_id lifecycle:
 *   - Set to session.userId on `ready_for_review → approved_for_delivery`.
 *   - Cleared (NULL) on either `approved_for_delivery → ready_for_review`
 *     or `approved_for_delivery → draft`.
 *   - Untouched on every other transition (e.g., `draft → ready_for_review`,
 *     `ready_for_review → draft`).
 *
 * `last_edited_by` and `updated_at` are written by trg_10_audit (DB).
 *
 * Error mapping:
 *   - DB 23514 (check_violation) → 400 (lock-sent on a `sent` row, or
 *     block-into-sent if the schema is somehow bypassed).
 *   - 0-row UPDATE return → 500 (RLS deny or race; pre-checks should
 *     have caught the common cases).
 *
 * Success returns 200 with ReportTransitionResponse.
 */
export async function POST(request: Request, { params }: Params) {
  try {
    const session = await requireStaff();

    const { id } = await params;
    if (!UUID_REGEX.test(id)) {
      return NextResponse.json(
        { success: false, error: "ID inválido" },
        { status: 400 }
      );
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { success: false, error: "Cuerpo inválido" },
        { status: 400 }
      );
    }

    const parsed = reportTransitionSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          error: "Datos inválidos",
          details: parsed.error.issues.map((i) => ({
            field: String(i.path[0] ?? "unknown"),
            message: i.message,
          })),
        },
        { status: 400 }
      );
    }

    const target: ReportTransitionTarget = parsed.data.to;
    const supabase = await createClient();

    // Pre-fetch (RLS-gated). Distinguishes 404 from RLS-deny-on-update.
    const { data: currentRow, error: currentError } = await supabase
      .from("technical_reports")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (currentError) {
      console.error("Failed to fetch current report:", currentError);
      return NextResponse.json(
        { success: false, error: "Error al obtener el informe" },
        { status: 500 }
      );
    }

    if (!currentRow) {
      return NextResponse.json(
        { success: false, error: "Informe no encontrado" },
        { status: 404 }
      );
    }

    const current = currentRow as TechnicalReportRow;

    // Pre-check 4: same-state is a no-op. Reject so the audit trail
    // (updated_at / last_edited_by via trg_10) doesn't churn.
    if (current.report_status === target) {
      return NextResponse.json(
        { success: false, error: "El informe ya está en ese estado" },
        { status: 400 }
      );
    }

    // Pre-check 5: role-aware allowed-transition map.
    const allowedMap =
      session.role === "admin" ? ADMIN_ALLOWED_FROM : STAFF_ALLOWED_FROM;
    const allowedTargets = allowedMap[current.report_status];
    if (!allowedTargets.includes(target)) {
      // Staff hitting a transition they cannot perform → 403 (auth).
      // Admin hitting one not in the state machine → 400 (structural).
      const status = session.role === "admin" ? 400 : 403;
      const message =
        session.role === "admin"
          ? `Transición no permitida: ${current.report_status} → ${target}`
          : "No tienes permiso para esta transición";
      return NextResponse.json(
        { success: false, error: message },
        { status }
      );
    }

    // Pre-check 6: staff ownership. RLS staff_update USING denies the
    // update on a non-own report regardless, but the friendly 403 is
    // clearer than a 500 from the 0-row fallback.
    if (
      session.role === "staff" &&
      current.technician_staff_id !== session.userId
    ) {
      return NextResponse.json(
        {
          success: false,
          error: "No puedes transicionar el informe de otro técnico",
        },
        { status: 403 }
      );
    }

    // Pre-check 7: content gate for draft → ready_for_review (any role).
    if (
      current.report_status === "draft" &&
      target === "ready_for_review"
    ) {
      const gate = reportReadyForReviewContentGate(current);
      if (!gate.ok) {
        return NextResponse.json(
          {
            success: false,
            error: "Faltan secciones obligatorias",
            details: gate.missing,
          },
          { status: 400 }
        );
      }
    }

    // Build payload — report_status plus approved_by_admin_id lifecycle.
    const payload: Record<string, unknown> = { report_status: target };

    if (
      current.report_status === "ready_for_review" &&
      target === "approved_for_delivery"
    ) {
      payload.approved_by_admin_id = session.userId;
    } else if (
      current.report_status === "approved_for_delivery" &&
      (target === "ready_for_review" || target === "draft")
    ) {
      payload.approved_by_admin_id = null;
    }

    const { data: updatedRow, error: updateError } = await supabase
      .from("technical_reports")
      .update(payload)
      .eq("id", id)
      .select("id, report_status, updated_at")
      .maybeSingle();

    if (updateError) {
      // 23514 = check_violation. trg_20_lock_sent fires if OLD row is
      // already 'sent' (impossible to reach in Phase 9 but defensive),
      // and trg_30_block_into_sent fires if NEW.report_status='sent'
      // (also blocked by the schema, defensive again).
      if (updateError.code === "23514") {
        console.error(
          "DB invariant raised on report transition:",
          updateError
        );
        return NextResponse.json(
          {
            success: false,
            error: "El informe no puede transicionar a ese estado",
          },
          { status: 400 }
        );
      }
      console.error("Failed to update report transition:", updateError);
      return NextResponse.json(
        { success: false, error: "Error al cambiar el estado del informe" },
        { status: 500 }
      );
    }

    if (!updatedRow) {
      // RLS denied the UPDATE (returns 0 rows, no error) or the row
      // vanished mid-request. Pre-checks above should have caught the
      // common cases — this is the defensive fallback.
      console.error(
        "Report transition returned 0 rows — RLS deny or race"
      );
      return NextResponse.json(
        { success: false, error: "No se pudo cambiar el estado del informe" },
        { status: 500 }
      );
    }

    const updated = updatedRow as {
      id: string;
      report_status: ReportStatus;
      updated_at: string;
    };

    const response: ReportTransitionResponse = {
      success: true,
      data: {
        id: updated.id,
        report_status: updated.report_status,
        updated_at: updated.updated_at,
      },
    };
    return NextResponse.json(response);
  } catch (error) {
    if (error instanceof NextResponse) return error;
    throw error;
  }
}
