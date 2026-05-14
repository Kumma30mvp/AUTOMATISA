"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { Textarea } from "@/components/ui/Textarea";
import { NotificationLogList } from "./NotificationLogList";
import { ReportActions } from "./ReportActions";
import { ReportMetadataPanel } from "./ReportMetadataPanel";
import type {
  ReportTransitionResponse,
  ReportTransitionTarget,
  TechnicalReportFull,
  TechnicalReportUpdateResponse,
} from "@/lib/types/reports";
import type {
  ConfirmWhatsAppResponse,
  PrepareWhatsAppResponse,
  ResendReportEmailResponse,
} from "@/lib/types/notifications";

type Role = "admin" | "staff";

type Props = {
  report: TechnicalReportFull;
  currentRole: Role;
  /** auth.uid() of the calling user. Used to gate staff editability:
   *  staff may edit only their own draft reports. Ignored for admins.
   *  RLS staff_update is the real boundary; this prop drives the UI. */
  currentUserId: string;
  /** Fired after a successful save or transition. The page may use
   *  this to re-fetch the appointment detail so embedded report
   *  summaries refresh. */
  onUpdated?: (next: TechnicalReportFull) => void;
};

type FormState = {
  vehicle_year: string;
  initial_symptoms: string;
  diagnosis_work_performed: string;
  replaced_parts: string;
  final_observations: string;
  conclusions: string;
};

const SUCCESS_FLASH_MS = 2500;
const NARRATIVE_MAX = 5000;

function formStateFromReport(r: TechnicalReportFull): FormState {
  return {
    vehicle_year: r.vehicle_year !== null ? String(r.vehicle_year) : "",
    initial_symptoms: r.initial_symptoms,
    diagnosis_work_performed: r.diagnosis_work_performed,
    replaced_parts: r.replaced_parts,
    final_observations: r.final_observations,
    conclusions: r.conclusions,
  };
}

function isFormDirty(a: FormState, b: FormState): boolean {
  return (
    a.vehicle_year !== b.vehicle_year ||
    a.initial_symptoms !== b.initial_symptoms ||
    a.diagnosis_work_performed !== b.diagnosis_work_performed ||
    a.replaced_parts !== b.replaced_parts ||
    a.final_observations !== b.final_observations ||
    a.conclusions !== b.conclusions
  );
}

/**
 * Structured editor for a TechnicalReportFull.
 *
 * Owns:
 *   - Local form state for the six structured fields (vehicle_year +
 *     five narratives).
 *   - Save: PATCH /api/admin/reports/[id]. Sparse payload — only
 *     changed fields are sent; the API accepts any subset.
 *   - Transitions: POST /api/admin/reports/[id]/transition. Drives
 *     the role-aware ReportActions bar.
 *
 * Read-only when:
 *   - report_status === 'sent' (lock-sent trigger blocks any UPDATE
 *     anyway), or
 *   - role === 'staff' AND report_status !== 'draft' (RLS staff_update
 *     USING denies non-draft updates for staff).
 *
 * Re-syncs local state when the parent supplies a new `report` prop
 * (shallow equality on report identity / updated_at). After a save,
 * the component patches its own local state from the PATCH response
 * so the user sees fresh metadata (updated_at, last_editor) without
 * a parent re-fetch. After a transition, the partial response is
 * merged — full joined fields refresh on the next parent re-fetch.
 */
export function ReportEditor({
  report,
  currentRole,
  currentUserId,
  onUpdated,
}: Props) {
  const router = useRouter();
  const [reportData, setReportData] = useState<TechnicalReportFull>(report);
  const [pristine, setPristine] = useState<FormState>(() =>
    formStateFromReport(report)
  );
  const [form, setForm] = useState<FormState>(() =>
    formStateFromReport(report)
  );

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);

  const [transitioning, setTransitioning] =
    useState<ReportTransitionTarget | null>(null);
  const [transitionError, setTransitionError] = useState<string | null>(null);
  const [transitionSuccess, setTransitionSuccess] = useState<string | null>(
    null
  );

  // Phase 10c — WhatsApp manual handoff. Replaces the Phase 10 email
  // Send modal with a prepare → confirm/cancel flow:
  //
  //   preparingWhatsApp  prepare-whatsapp request in flight
  //   waPrepared         non-null when prepare succeeded; the editor
  //                      renders a confirmation modal until the admin
  //                      confirms or cancels
  //   confirmingWhatsApp confirm-whatsapp-sent request in flight
  //   cancellingWhatsApp confirm-whatsapp-sent (cancel branch) in flight
  const [preparingWhatsApp, setPreparingWhatsApp] = useState(false);
  const [waPrepared, setWaPrepared] = useState<
    | {
        wa_link: string;
        signed_url: string;
        pdf_storage_path: string;
        notification_log_id: string;
      }
    | null
  >(null);
  const [confirmingWhatsApp, setConfirmingWhatsApp] = useState(false);
  const [cancellingWhatsApp, setCancellingWhatsApp] = useState(false);

  // Phase 10 (legacy) — resend-email button on already-sent reports.
  const [resending, setResending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [sendSuccess, setSendSuccess] = useState<string | null>(null);

  // Bumped after every send / resend (success or failure) so the
  // NotificationLogList re-fetches its rows. router.refresh() handles
  // server-component-rendered data; this key handles client-fetched
  // data inside NotificationLogList.
  const [notificationsRefreshKey, setNotificationsRefreshKey] = useState(0);

  const successTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Re-sync when the parent passes an updated report (e.g., after a
  // page-level re-fetch). Compare on id + updated_at to avoid loops
  // when the same instance is repassed.
  useEffect(() => {
    setReportData(report);
    const next = formStateFromReport(report);
    setPristine(next);
    setForm(next);
  }, [report]);

  useEffect(() => {
    return () => {
      if (successTimerRef.current) clearTimeout(successTimerRef.current);
    };
  }, []);

  const isDirty = isFormDirty(form, pristine);

  // Staff own-report check. Admins are not gated by ownership (RLS
  // admin_update predicate is is_admin() unconditionally).
  const isOwnReport = reportData.technician_staff_id === currentUserId;

  // Read-only when:
  //   - report_status === 'sent' (lock-sent trigger blocks UPDATE), OR
  //   - role === 'staff' AND (status !== 'draft' OR not own report).
  // RLS staff_update is the real boundary; this mirrors it so the UI
  // doesn't expose form controls that would 403 on save.
  const readOnly =
    reportData.report_status === "sent" ||
    (currentRole === "staff" &&
      (reportData.report_status !== "draft" || !isOwnReport));

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
    setSaveError(null);
    setSaveSuccess(null);
  }

  function flashSaveSuccess(text: string) {
    setSaveSuccess(text);
    if (successTimerRef.current) clearTimeout(successTimerRef.current);
    successTimerRef.current = setTimeout(() => {
      setSaveSuccess(null);
      setTransitionSuccess(null);
    }, SUCCESS_FLASH_MS);
  }

  function flashTransitionSuccess(text: string) {
    setTransitionSuccess(text);
    if (successTimerRef.current) clearTimeout(successTimerRef.current);
    successTimerRef.current = setTimeout(() => {
      setSaveSuccess(null);
      setTransitionSuccess(null);
    }, SUCCESS_FLASH_MS);
  }

  function flashSendSuccess(text: string) {
    setSendSuccess(text);
    if (successTimerRef.current) clearTimeout(successTimerRef.current);
    successTimerRef.current = setTimeout(() => {
      setSendSuccess(null);
    }, SUCCESS_FLASH_MS);
  }

  async function handleSave() {
    setSaving(true);
    setSaveError(null);
    setSaveSuccess(null);

    // Sparse payload — only changed fields. PATCH accepts any subset
    // and the route validates each one.
    const payload: Record<string, unknown> = {};
    if (form.vehicle_year !== pristine.vehicle_year) {
      const trimmed = form.vehicle_year.trim();
      payload.vehicle_year = trimmed === "" ? null : Number(trimmed);
    }
    if (form.initial_symptoms !== pristine.initial_symptoms) {
      payload.initial_symptoms = form.initial_symptoms;
    }
    if (form.diagnosis_work_performed !== pristine.diagnosis_work_performed) {
      payload.diagnosis_work_performed = form.diagnosis_work_performed;
    }
    if (form.replaced_parts !== pristine.replaced_parts) {
      payload.replaced_parts = form.replaced_parts;
    }
    if (form.final_observations !== pristine.final_observations) {
      payload.final_observations = form.final_observations;
    }
    if (form.conclusions !== pristine.conclusions) {
      payload.conclusions = form.conclusions;
    }

    try {
      const res = await fetch(`/api/admin/reports/${reportData.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = (await res.json()) as
        | TechnicalReportUpdateResponse
        | { success: false; error: string };
      if (!res.ok || !("success" in body) || body.success !== true) {
        const errMessage =
          "error" in body && typeof body.error === "string"
            ? body.error
            : "Error al guardar el informe";
        setSaveError(errMessage);
        return;
      }
      const next = body.data;
      setReportData(next);
      const nextForm = formStateFromReport(next);
      setPristine(nextForm);
      setForm(nextForm);
      flashSaveSuccess("Cambios guardados");
      onUpdated?.(next);
    } catch {
      setSaveError("Error de red. Intente nuevamente.");
    } finally {
      setSaving(false);
    }
  }

  async function handleStartWhatsAppPrepare() {
    setPreparingWhatsApp(true);
    setSendError(null);
    setSendSuccess(null);

    try {
      const res = await fetch(
        `/api/admin/reports/${reportData.id}/prepare-whatsapp`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        }
      );
      const body = (await res.json()) as
        | PrepareWhatsAppResponse
        | { success: false; error?: string };
      if (!res.ok || !("success" in body) || body.success !== true) {
        const errMessage =
          "error" in body && typeof body.error === "string"
            ? body.error
            : "Error al preparar el envío por WhatsApp";
        setSendError(errMessage);
        return;
      }

      const data = body.data;
      setWaPrepared({
        wa_link: data.wa_link,
        signed_url: data.signed_url,
        pdf_storage_path: data.pdf_storage_path,
        notification_log_id: data.notification.id,
      });

      // Open WhatsApp in a new tab. Pop-up blockers may reject this if
      // the click was already async — the modal also surfaces the link
      // as a backup affordance.
      if (typeof window !== "undefined") {
        window.open(data.wa_link, "_blank", "noopener,noreferrer");
      }

      // Refresh the notifications list so the new pending row appears.
      setNotificationsRefreshKey((k) => k + 1);
    } catch {
      setSendError("Error de red. Intente nuevamente.");
    } finally {
      setPreparingWhatsApp(false);
    }
  }

  async function handleConfirmWhatsAppSent() {
    if (!waPrepared) return;
    setConfirmingWhatsApp(true);
    setSendError(null);
    setSendSuccess(null);

    try {
      const res = await fetch(
        `/api/admin/reports/${reportData.id}/confirm-whatsapp-sent`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            confirmed: true,
            notification_log_id: waPrepared.notification_log_id,
            pdf_storage_path: waPrepared.pdf_storage_path,
          }),
        }
      );
      const body = (await res.json()) as
        | ConfirmWhatsAppResponse
        | { success: false; error?: string };
      if (!res.ok || !("success" in body) || body.success !== true) {
        const errMessage =
          "error" in body && typeof body.error === "string"
            ? body.error
            : "Error al confirmar el envío por WhatsApp";
        setSendError(errMessage);
        return;
      }

      const data = body.data;
      const nextReport: TechnicalReportFull = {
        ...reportData,
        report_status: data.report_status,
        sent_at: data.sent_at ?? reportData.sent_at,
        pdf_storage_path: waPrepared.pdf_storage_path,
      };
      setReportData(nextReport);
      onUpdated?.(nextReport);
      setWaPrepared(null);
      flashSendSuccess("Informe enviado por WhatsApp y cita completada.");

      router.refresh();
      setNotificationsRefreshKey((k) => k + 1);
    } catch {
      setSendError("Error de red. Intente nuevamente.");
    } finally {
      setConfirmingWhatsApp(false);
    }
  }

  async function handleCancelWhatsApp() {
    if (!waPrepared) return;
    setCancellingWhatsApp(true);
    setSendError(null);
    setSendSuccess(null);

    try {
      const res = await fetch(
        `/api/admin/reports/${reportData.id}/confirm-whatsapp-sent`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            confirmed: false,
            notification_log_id: waPrepared.notification_log_id,
            pdf_storage_path: waPrepared.pdf_storage_path,
          }),
        }
      );
      const body = (await res.json()) as
        | ConfirmWhatsAppResponse
        | { success: false; error?: string };
      if (!res.ok || !("success" in body) || body.success !== true) {
        const errMessage =
          "error" in body && typeof body.error === "string"
            ? body.error
            : "Error al cancelar el envío por WhatsApp";
        setSendError(errMessage);
        return;
      }

      setWaPrepared(null);
      flashSendSuccess(
        "Envío por WhatsApp cancelado. El informe permanece aprobado para entrega."
      );

      router.refresh();
      setNotificationsRefreshKey((k) => k + 1);
    } catch {
      setSendError("Error de red. Intente nuevamente.");
    } finally {
      setCancellingWhatsApp(false);
    }
  }

  async function handleResend() {
    setResending(true);
    setSendError(null);
    setSendSuccess(null);

    try {
      const res = await fetch(
        `/api/admin/reports/${reportData.id}/resend-email`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        }
      );
      const body = (await res.json()) as
        | ResendReportEmailResponse
        | { success: false; error?: string };
      if (!res.ok || !("success" in body) || body.success !== true) {
        const errMessage =
          "error" in body && typeof body.error === "string"
            ? body.error
            : "Error al reenviar el correo";
        setSendError(errMessage);
        return;
      }

      if (body.data.email_delivered) {
        flashSendSuccess("Correo reenviado al cliente.");
      } else {
        setSendError(
          "No se pudo reenviar el correo al cliente. Revisa el historial e intenta nuevamente."
        );
      }

      router.refresh();
      // The resend always inserts a new notification_logs row (success
      // or failure) — bump the key so the list shows the new entry.
      setNotificationsRefreshKey((k) => k + 1);
    } catch {
      setSendError("Error de red. Intente nuevamente.");
    } finally {
      setResending(false);
    }
  }

  async function handleTransition(target: ReportTransitionTarget) {
    setTransitioning(target);
    setTransitionError(null);
    setTransitionSuccess(null);

    try {
      const res = await fetch(
        `/api/admin/reports/${reportData.id}/transition`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ to: target }),
        }
      );
      const body = (await res.json()) as
        | ReportTransitionResponse
        | { success: false; error: string };
      if (!res.ok || !("success" in body) || body.success !== true) {
        const errMessage =
          "error" in body && typeof body.error === "string"
            ? body.error
            : "Error al cambiar el estado";
        setTransitionError(errMessage);
        return;
      }

      const next = body.data;
      // Patch local state with the new status + updated_at, then ask
      // the server to re-render so joined fields (approved_by_admin
      // name, last_editor name) refresh from the GET handler. Save
      // doesn't need this — its PATCH response already returns the
      // joined record. router.refresh() is safe here because the
      // editor is in a clean state (transitions are gated on !isDirty).
      const nextReport: TechnicalReportFull = {
        ...reportData,
        report_status: next.report_status,
        updated_at: next.updated_at,
      };
      setReportData(nextReport);
      flashTransitionSuccess("Estado actualizado");
      onUpdated?.(nextReport);
      router.refresh();
    } catch {
      setTransitionError("Error de red. Intente nuevamente.");
    } finally {
      setTransitioning(null);
    }
  }

  function handleBack() {
    if (isDirty) return;
    router.push(currentRole === "admin" ? "/admin/citas" : "/admin/staff");
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-3">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={handleBack}
          disabled={isDirty}
        >
          <ArrowLeft className="h-4 w-4" />
          Volver
        </Button>
        {isDirty && (
          <p className="text-xs text-nav">
            Guarda los cambios antes de volver.
          </p>
        )}
      </div>

      <ReportMetadataPanel
        reportStatus={reportData.report_status}
        technician={reportData.technician}
        lastEditor={reportData.last_editor}
        approvedByAdmin={reportData.approved_by_admin}
        createdAt={reportData.created_at}
        updatedAt={reportData.updated_at}
        sentAt={reportData.sent_at}
      />

      <fieldset disabled={readOnly} className="flex flex-col gap-4">
        <Input
          label="Año del vehículo"
          name="vehicle_year"
          type="number"
          inputMode="numeric"
          value={form.vehicle_year}
          onChange={(e) => update("vehicle_year", e.target.value)}
          placeholder="Opcional"
        />
        <Textarea
          label="Síntomas iniciales"
          name="initial_symptoms"
          value={form.initial_symptoms}
          onChange={(e) => update("initial_symptoms", e.target.value)}
          maxLength={NARRATIVE_MAX}
        />
        <Textarea
          label="Diagnóstico y trabajos realizados"
          name="diagnosis_work_performed"
          value={form.diagnosis_work_performed}
          onChange={(e) => update("diagnosis_work_performed", e.target.value)}
          maxLength={NARRATIVE_MAX}
        />
        <Textarea
          label="Repuestos reemplazados"
          name="replaced_parts"
          value={form.replaced_parts}
          onChange={(e) => update("replaced_parts", e.target.value)}
          hint="Opcional — algunos servicios no requieren repuestos."
          maxLength={NARRATIVE_MAX}
        />
        <Textarea
          label="Observaciones finales"
          name="final_observations"
          value={form.final_observations}
          onChange={(e) => update("final_observations", e.target.value)}
          maxLength={NARRATIVE_MAX}
        />
        <Textarea
          label="Conclusiones"
          name="conclusions"
          value={form.conclusions}
          onChange={(e) => update("conclusions", e.target.value)}
          maxLength={NARRATIVE_MAX}
        />
      </fieldset>

      <ReportActions
        role={currentRole}
        reportStatus={reportData.report_status}
        isOwnReport={isOwnReport}
        isDirty={isDirty}
        saving={saving}
        transitioning={transitioning}
        preparingWhatsApp={preparingWhatsApp}
        resending={resending}
        onSave={handleSave}
        onTransition={handleTransition}
        onPrepareWhatsApp={handleStartWhatsAppPrepare}
        onResend={handleResend}
      />

      {(saveError || transitionError || sendError) && (
        <p className="text-sm text-red-600">
          {saveError ?? transitionError ?? sendError}
        </p>
      )}
      {(saveSuccess || transitionSuccess || sendSuccess) && (
        <p className="text-sm text-green-700">
          {saveSuccess ?? transitionSuccess ?? sendSuccess}
        </p>
      )}

      {reportData.report_status === "sent" && (
        <NotificationLogList
          reportId={reportData.id}
          refreshKey={notificationsRefreshKey}
        />
      )}

      {/* Phase 10c — post-prepare confirmation modal.
       *  Stays open until the admin confirms or cancels. Prevents
       *  closing the page from acting as an implicit "I already sent
       *  the message" — admin must click one of the two buttons. */}
      <Modal
        open={waPrepared !== null}
        onClose={() => {
          // Suppress backdrop / close-button dismissal. Forcing an
          // explicit confirm or cancel keeps the notification_logs
          // pending row from being silently abandoned.
        }}
        title="Enviar informe por WhatsApp"
      >
        {waPrepared && (
          <div className="flex flex-col gap-4">
            <p className="text-sm text-navy-900">
              Abrimos WhatsApp con un mensaje listo para enviar. Cuando hayas
              enviado el mensaje en WhatsApp, confirma para completar la cita.
            </p>
            <div className="rounded-lg bg-surface-50 px-3 py-2 text-xs text-nav">
              <p className="mb-1 uppercase tracking-wide">Enlace del PDF</p>
              <p className="break-all text-navy-900">
                {waPrepared.signed_url}
              </p>
            </div>
            <p className="text-xs text-nav">
              ¿No se abrió WhatsApp?{" "}
              <a
                href={waPrepared.wa_link}
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-blue-accent underline underline-offset-2"
              >
                Abrir WhatsApp
              </a>
              .
            </p>
            <div className="flex flex-wrap justify-end gap-2 pt-2">
              <Button
                variant="secondary"
                size="md"
                loading={cancellingWhatsApp}
                disabled={confirmingWhatsApp || cancellingWhatsApp}
                onClick={handleCancelWhatsApp}
              >
                Cancelar envío
              </Button>
              <Button
                variant="primary"
                size="md"
                loading={confirmingWhatsApp}
                disabled={confirmingWhatsApp || cancellingWhatsApp}
                onClick={handleConfirmWhatsAppSent}
              >
                Ya envié por WhatsApp
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
