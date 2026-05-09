"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { StatusBadge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { AssignmentField } from "@/components/admin/AssignmentField";
import { CustomerHistoryPanel } from "@/components/admin/CustomerHistoryPanel";
import { VehicleHistoryPanel } from "@/components/admin/VehicleHistoryPanel";
import { StatusActions } from "@/components/admin/StatusActions";
import { ReportStatusBadge } from "@/components/admin/ReportStatusBadge";
import type {
  AppointmentDetailResponse,
  AppointmentStatus,
} from "@/lib/types/database";
import type { TechnicalReportCreateResponse } from "@/lib/types/reports";

type Role = "admin" | "staff";

type Props = {
  appointmentId: string | null;
  role: Role;
  onClose: () => void;
};

const STATUS_LABELS: Record<AppointmentStatus, string> = {
  pendiente: "Pendiente",
  confirmada: "Confirmada",
  cancelada: "Cancelada",
  completada: "Completada",
};

function formatDateTime(iso: string): string {
  return new Intl.DateTimeFormat("es-PE", {
    timeZone: "America/Lima",
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(iso));
}

function Field({
  label,
  value,
}: {
  label: string;
  value: string | null | undefined;
}) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-nav">{label}</p>
      <p className="text-sm text-navy-900">{value || "—"}</p>
    </div>
  );
}

export function AppointmentDetail({ appointmentId, role, onClose }: Props) {
  const router = useRouter();
  const [detail, setDetail] = useState<AppointmentDetailResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Phase 9 — local state for the "Crear informe" CTA in the
  // "Informe técnico" section. The summary itself comes from the
  // appointment-detail GET (request.technical_report).
  const [creatingReport, setCreatingReport] = useState(false);
  const [reportError, setReportError] = useState<string | null>(null);

  const load = useCallback(async (id: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/appointment-requests/${id}`);
      const body = await res.json();
      if (!res.ok) {
        setError(body.error ?? "Error al cargar la solicitud");
        setDetail(null);
        return;
      }
      setDetail(body as AppointmentDetailResponse);
    } catch {
      setError("Error de red");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (appointmentId) {
      load(appointmentId);
    } else {
      setDetail(null);
      setError(null);
    }
  }, [appointmentId, load]);

  // Reset CTA state whenever the modal switches appointments.
  useEffect(() => {
    setCreatingReport(false);
    setReportError(null);
  }, [appointmentId]);

  /**
   * POST /api/admin/appointment-requests/[id]/report.
   *
   * Body shaping by role:
   *   - Admin: send `technician_staff_id = assigned_staff.id`. The
   *     "Crear informe" CTA is only rendered when an assigned staff
   *     is present (see the section below), so this path always has
   *     a value to send.
   *   - Staff: send empty body. The route forces
   *     technician_staff_id = session.userId regardless of body
   *     content (see /api/admin/appointment-requests/[id]/report).
   *
   * On success, navigate to the editor. The page mounts with the
   * fresh report and the user can start filling sections.
   */
  async function handleCreateReport() {
    if (!detail) return;
    setCreatingReport(true);
    setReportError(null);
    try {
      const body: { technician_staff_id?: string } = {};
      if (role === "admin" && detail.request.assigned_staff) {
        body.technician_staff_id = detail.request.assigned_staff.id;
      }
      const res = await fetch(
        `/api/admin/appointment-requests/${detail.request.id}/report`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      );
      const respBody = (await res.json()) as
        | TechnicalReportCreateResponse
        | { success: false; error?: string };
      if (!res.ok || respBody.success !== true) {
        const message =
          ("error" in respBody && respBody.error) ||
          "Error al crear el informe";
        setReportError(message);
        return;
      }
      router.push(`/admin/reports/${respBody.data.id}`);
    } catch {
      setReportError("Error de red. Intente nuevamente.");
    } finally {
      setCreatingReport(false);
    }
  }

  const open = appointmentId !== null;

  return (
    <Modal open={open} onClose={onClose} title="Detalle de solicitud">
      {loading && (
        <div className="flex items-center justify-center py-10 text-nav">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      )}

      {error && !loading && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      {detail && !loading && (
        <div className="flex flex-col gap-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-wide text-nav">
                Estado actual
              </p>
              <div className="mt-1">
                <StatusBadge status={detail.request.status} />
              </div>
            </div>
            <p className="text-xs text-nav">
              Recibida: {formatDateTime(detail.request.created_at)}
            </p>
          </div>

          <section>
            <h3 className="mb-3 font-heading text-sm font-semibold text-navy-900">
              Asignación
            </h3>
            <AssignmentField
              appointmentId={detail.request.id}
              appointmentStatus={detail.request.status}
              currentAssignedStaff={detail.request.assigned_staff}
              role={role}
              onUpdated={() => load(detail.request.id)}
            />
          </section>

          <section>
            <h3 className="mb-3 font-heading text-sm font-semibold text-navy-900">
              Cliente
            </h3>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Nombre" value={detail.request.full_name} />
              <Field label="DNI" value={detail.request.dni} />
              <Field label="Teléfono" value={detail.request.phone} />
              <Field label="Correo" value={detail.request.email} />
            </div>
            <div className="mt-3">
              <CustomerHistoryPanel
                dni={detail.request.dni}
                email={detail.request.email}
                excludeAppointmentId={detail.request.id}
              />
            </div>
          </section>

          <section>
            <h3 className="mb-3 font-heading text-sm font-semibold text-navy-900">
              Vehículo
            </h3>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Placa" value={detail.request.car_plate} />
              <Field
                label="Servicio"
                value={detail.request.service_catalog?.name}
              />
              <Field label="Marca" value={detail.request.vehicle_brand} />
              <Field label="Modelo" value={detail.request.vehicle_model} />
            </div>
            <div className="mt-3">
              <VehicleHistoryPanel
                carPlate={detail.request.car_plate}
                excludeAppointmentId={detail.request.id}
              />
            </div>
          </section>

          <section>
            <h3 className="mb-3 font-heading text-sm font-semibold text-navy-900">
              Cita preferida
            </h3>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Fecha" value={detail.request.preferred_date} />
              <Field
                label="Hora"
                value={detail.request.preferred_time?.slice(0, 5)}
              />
            </div>
          </section>

          <section>
            <h3 className="mb-3 font-heading text-sm font-semibold text-navy-900">
              Problema reportado
            </h3>
            <p className="whitespace-pre-wrap rounded-lg bg-surface-50 p-3 text-sm text-navy-900">
              {detail.request.problem_description}
            </p>
            {detail.request.additional_notes && (
              <>
                <h4 className="mt-4 text-xs uppercase tracking-wide text-nav">
                  Notas adicionales
                </h4>
                <p className="mt-1 whitespace-pre-wrap rounded-lg bg-surface-50 p-3 text-sm text-navy-900">
                  {detail.request.additional_notes}
                </p>
              </>
            )}
          </section>

          <section>
            <h3 className="mb-3 font-heading text-sm font-semibold text-navy-900">
              Historial
            </h3>
            <ol className="flex flex-col gap-2 border-l-2 border-surface-200 pl-4">
              {(() => {
                // History is ordered by created_at ASC. The "latest
                // transition" we want to highlight is the most recent
                // entry with previous_status !== null — i.e. an actual
                // status change, NOT the trigger-created initial row.
                let latestTransitionIndex = -1;
                for (let i = detail.history.length - 1; i >= 0; i--) {
                  if (detail.history[i].previous_status !== null) {
                    latestTransitionIndex = i;
                    break;
                  }
                }
                return detail.history.map((h, idx) => {
                  // Actor label resolution:
                  //   changed_by === null               → "Sistema"
                  //   changed_by set, actor_full_name null → "Usuario no disponible"
                  //                                          (deleted staff or
                  //                                           lookup soft-fail)
                  //   otherwise                          → actor_full_name
                  const actorLabel =
                    h.changed_by === null
                      ? "Sistema"
                      : h.actor_full_name ?? "Usuario no disponible";
                  const isLatestTransition = idx === latestTransitionIndex;
                  return (
                    <li key={h.id} className="relative text-sm">
                      <span className="absolute -left-[21px] top-1.5 h-3 w-3 rounded-full bg-blue-accent" />
                      <p className="text-navy-900">
                        {h.previous_status
                          ? `${STATUS_LABELS[h.previous_status]} → ${STATUS_LABELS[h.new_status]}`
                          : `Creada como ${STATUS_LABELS[h.new_status]}`}
                      </p>
                      <p className="text-xs text-nav">
                        {formatDateTime(h.created_at)}
                        {" · Por "}
                        <span
                          className={
                            isLatestTransition
                              ? "font-semibold text-navy-900"
                              : undefined
                          }
                        >
                          {actorLabel}
                        </span>
                        {h.notes ? ` · ${h.notes}` : ""}
                      </p>
                    </li>
                  );
                });
              })()}
            </ol>
          </section>

          <section className="border-t border-surface-200 pt-4">
            <h3 className="mb-3 font-heading text-sm font-semibold text-navy-900">
              Informe técnico
            </h3>
            {(() => {
              const summary = detail.request.technical_report;

              // 1. A report exists — show the summary card with the
              //    status badge, technician name, last-edit timestamp,
              //    and a "Ver informe" CTA. Renders for any
              //    appointment status (a report can exist even after
              //    the appointment is later cancelled or completed).
              if (summary) {
                return (
                  <div className="flex flex-col gap-2">
                    <div className="flex flex-col gap-3 rounded-2xl border border-surface-200 bg-white p-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex flex-col gap-1">
                        <ReportStatusBadge status={summary.report_status} />
                        <p className="text-sm text-navy-900">
                          {summary.technician_full_name ??
                            "Técnico no disponible"}
                        </p>
                        <p className="text-xs text-nav">
                          Última edición:{" "}
                          {formatDateTime(summary.updated_at)}
                        </p>
                      </div>
                      <Button
                        variant="primary"
                        size="sm"
                        onClick={() =>
                          router.push(`/admin/reports/${summary.id}`)
                        }
                      >
                        Ver informe
                      </Button>
                    </div>
                    {summary.report_status === "approved_for_delivery" && (
                      <p className="text-xs text-nav">
                        Para finalizar la cita, abre el informe y usa
                        &ldquo;Enviar al cliente y completar&rdquo;.
                      </p>
                    )}
                  </div>
                );
              }

              // 2. No report yet, appointment not in confirmada — the
              //    DB trigger trg_05_…_require_confirmada blocks
              //    INSERTs here, so we surface the requirement
              //    instead of an actionable CTA.
              if (detail.request.status !== "confirmada") {
                return (
                  <p className="text-sm text-nav">
                    El informe se podrá crear cuando la cita esté
                    confirmada.
                  </p>
                );
              }

              // 3. No report yet, confirmada, admin without assigned
              //    technician — block creation here. The POST route
              //    requires `technician_staff_id` for admin callers
              //    (returns 400 + field detail otherwise). Asking for
              //    an assignment first matches the operational flow
              //    and avoids surfacing a 400 mid-click.
              if (role === "admin" && !detail.request.assigned_staff) {
                return (
                  <p className="text-sm text-nav">
                    Asigne un técnico antes de crear el informe.
                  </p>
                );
              }

              // 4. No report yet, confirmada, eligible to create:
              //    admin with assigned staff, or staff (server forces
              //    them as the technician regardless of body).
              return (
                <div className="flex flex-col gap-2">
                  <Button
                    variant="primary"
                    size="sm"
                    loading={creatingReport}
                    disabled={creatingReport}
                    onClick={handleCreateReport}
                  >
                    Crear informe
                  </Button>
                  {reportError && (
                    <p className="text-xs text-red-600">{reportError}</p>
                  )}
                </div>
              );
            })()}
          </section>

          <section className="border-t border-surface-200 pt-4">
            <h3 className="mb-3 font-heading text-sm font-semibold text-navy-900">
              Acciones
            </h3>
            <StatusActions
              appointmentId={detail.request.id}
              currentStatus={detail.request.status}
              role={role}
              onUpdated={() => load(detail.request.id)}
            />
          </section>
        </div>
      )}
    </Modal>
  );
}
