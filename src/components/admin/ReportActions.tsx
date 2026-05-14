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
  /** Phase 10c — prepare-whatsapp in flight. Replaces Phase 10's
   *  `sending` for the approved_for_delivery action. */
  preparingWhatsApp: boolean;
  /** Phase 10 (legacy) — resend-email in flight. */
  resending: boolean;
  onSave: () => void;
  onTransition: (target: ReportTransitionTarget) => void;
  /** Phase 10c — POST /api/admin/reports/[id]/prepare-whatsapp (admin only).
   *  Triggers PDF gen + upload + log INSERT + wa.me link build. Does NOT
   *  finalize the report; the editor then renders a confirmation modal
   *  while the admin sends the message manually. */
  onPrepareWhatsApp: () => void;
  /** Phase 10 (legacy) — POST /api/admin/reports/[id]/resend-email (admin only). */
  onResend: () => void;
};

type TransitionButton = {
  target: ReportTransitionTarget;
  label: string;
  variant: "primary" | "secondary";
};

/**
 * Role- and status-aware action bar for the report editor.
 *
 * Phase 10 visibility matrix:
 *
 *   reportStatus           role    Save?     Transitions / Send / Resend
 *   ─────────────────────  ──────  ────────  ─────────────────────────────────
 *   draft                  staff   yes       Marcar para revisión
 *   draft                  admin   yes       Marcar para revisión
 *   ready_for_review       staff   read-only ─
 *   ready_for_review       admin   yes       Aprobar para entrega · Devolver a borrador
 *   approved_for_delivery  staff   read-only ─
 *   approved_for_delivery  admin   yes       Enviar al cliente y completar (Phase 10) · Devolver a revisión
 *   sent                   staff   read-only ─
 *   sent                   admin   no        Reenviar correo (Phase 10)
 *
 * Send / Resend are admin-only by design AND by API gate (the
 * underlying routes use requireAdmin()). Staff never sees those buttons.
 *
 * "Enviar al cliente y completar" opens a confirmation modal — the
 * action finalizes the report and completes the appointment in one
 * irreversible step. The modal closes when the admin confirms; the main
 * Send button shows loading state while the request is in flight, and
 * any success / error feedback renders in the editor below the action
 * bar.
 *
 * Transition buttons remain disabled while the editor is dirty so the
 * server's content gate and audit trail always reflect persisted
 * values, not unsaved local edits. Send is gated the same way.
 */
export function ReportActions({
  role,
  reportStatus,
  isOwnReport,
  isDirty,
  saving,
  transitioning,
  preparingWhatsApp,
  resending,
  onSave,
  onTransition,
  onPrepareWhatsApp,
  onResend,
}: Props) {
  // ───────────────── Sent state ─────────────────
  // Phase 10c: WhatsApp delivery is manual handoff, so there is no
  // automatic "Reenviar WhatsApp" action yet. Admin keeps the legacy
  // email "Reenviar correo" affordance for already-sent reports.
  if (reportStatus === "sent") {
    if (role === "admin") {
      return (
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              size="md"
              loading={resending}
              disabled={resending}
              onClick={() => onResend()}
            >
              Reenviar correo
            </Button>
          </div>
          <p className="text-xs text-nav">
            El informe está enviado y no admite cambios. Puedes reenviar el
            correo al cliente si fuese necesario.
          </p>
        </div>
      );
    }
    return (
      <p className="text-sm text-nav">
        El informe está enviado y no admite cambios.
      </p>
    );
  }

  // ───────────────── Staff read-only states ─────────────────
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

  // ───────────────── Editable states ─────────────────
  const isBusy = saving || transitioning !== null || preparingWhatsApp;
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

  // Phase 10c: WhatsApp prepare is the only delivery affordance on
  // approved_for_delivery for admins. Clicking it triggers PDF gen +
  // upload + log INSERT + wa.me link; the editor then opens the link
  // and renders a confirm/cancel UI.
  const canShowWhatsApp =
    role === "admin" && reportStatus === "approved_for_delivery";

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

        {canShowWhatsApp && (
          <Button
            variant="primary"
            size="md"
            loading={preparingWhatsApp}
            disabled={isBusy || isDirty}
            onClick={() => onPrepareWhatsApp()}
          >
            Enviar por WhatsApp y completar
          </Button>
        )}

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
      {isDirty && (transitions.length > 0 || canShowWhatsApp) && (
        <p className="text-xs text-nav">
          Guarda los cambios antes de cambiar el estado del informe.
        </p>
      )}
    </div>
  );
}
