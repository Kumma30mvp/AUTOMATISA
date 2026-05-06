"use client";

import { Button } from "@/components/ui/Button";
import type {
  ReportStatus,
  ReportTransitionTarget,
} from "@/lib/types/reports";

type Role = "admin" | "staff";

type Props = {
  role: Role;
  reportStatus: ReportStatus;
  /** True when the current user is the report's technician.
   *  Staff-only signal — admins are not gated by ownership. */
  isOwnReport: boolean;
  isDirty: boolean;
  saving: boolean;
  transitioning: ReportTransitionTarget | null;
  onSave: () => void;
  onTransition: (target: ReportTransitionTarget) => void;
};

type TransitionButton = {
  target: ReportTransitionTarget;
  label: string;
  variant: "primary" | "secondary";
};

/**
 * Role- and status-aware action bar for the report editor.
 *
 * Phase 9 visibility matrix:
 *
 *   reportStatus           role    Save?     Transitions
 *   ─────────────────────  ──────  ────────  ─────────────────────────────────
 *   draft                  staff   yes       Marcar para revisión
 *   draft                  admin   yes       Marcar para revisión
 *   ready_for_review       staff   read-only ─
 *   ready_for_review       admin   yes       Aprobar para entrega · Devolver a borrador
 *   approved_for_delivery  staff   read-only ─
 *   approved_for_delivery  admin   yes       Devolver a revisión
 *   sent                   any     read-only ─ (also blocked by trg_20_lock_sent)
 *
 * "Send PDF and complete" is intentionally absent in Phase 9 — Phase 10
 * lifts trg_30_block_into_sent and introduces the atomic Send-PDF-and-
 * complete RPC; that workflow is the only path that writes `sent`.
 *
 * Transition buttons are disabled when the editor is dirty so the
 * server's content gate (draft → ready_for_review) and audit trail
 * always reflect persisted values, not unsaved local edits.
 */
export function ReportActions({
  role,
  reportStatus,
  isOwnReport,
  isDirty,
  saving,
  transitioning,
  onSave,
  onTransition,
}: Props) {
  // Read-only states (in priority order):
  //   1. sent — any role, lock-sent trigger blocks UPDATE.
  //   2. staff + foreign report — RLS staff_update USING denies the
  //      UPDATE, and the staff_insert WITH CHECK already prevented
  //      staff from authoring on behalf of another tech. Staff can
  //      still SELECT a foreign report tied to a confirmada
  //      appointment (read-only by design).
  //   3. staff + own report + non-draft — RLS staff_update USING
  //      requires report_status = 'draft' for staff edits.
  if (reportStatus === "sent") {
    return (
      <p className="text-sm text-nav">
        El informe está enviado y no admite cambios.
      </p>
    );
  }
  if (role === "staff" && !isOwnReport) {
    return (
      <p className="text-sm text-nav">
        Este informe pertenece a otro técnico. Solo el técnico asignado o un
        administrador pueden modificarlo.
      </p>
    );
  }
  if (role === "staff" && reportStatus !== "draft") {
    return (
      <p className="text-sm text-nav">
        El informe ya no está en borrador. Solo el equipo administrador puede
        modificarlo.
      </p>
    );
  }

  const isBusy = saving || transitioning !== null;
  const canSave = isDirty && !isBusy;

  // Build the role × status transition list.
  const transitions: TransitionButton[] = [];

  if (reportStatus === "draft") {
    transitions.push({
      target: "ready_for_review",
      label: "Marcar para revisión",
      variant: "primary",
    });
  } else if (role === "admin" && reportStatus === "ready_for_review") {
    transitions.push({
      target: "approved_for_delivery",
      label: "Aprobar para entrega",
      variant: "primary",
    });
    transitions.push({
      target: "draft",
      label: "Devolver a borrador",
      variant: "secondary",
    });
  } else if (role === "admin" && reportStatus === "approved_for_delivery") {
    transitions.push({
      target: "ready_for_review",
      label: "Devolver a revisión",
      variant: "secondary",
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        <Button
          variant="primary"
          size="md"
          loading={saving}
          disabled={!canSave}
          onClick={() => onSave()}
        >
          Guardar cambios
        </Button>
        {transitions.map((t) => (
          <Button
            key={t.target}
            variant={t.variant}
            size="md"
            loading={transitioning === t.target}
            disabled={isBusy || isDirty}
            onClick={() => onTransition(t.target)}
          >
            {t.label}
          </Button>
        ))}
      </div>
      {isDirty && transitions.length > 0 && (
        <p className="text-xs text-nav">
          Guarde los cambios antes de cambiar el estado del informe.
        </p>
      )}
    </div>
  );
}
