"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { StatusBadge } from "@/components/ui/Badge";
import { AssignmentField } from "@/components/admin/AssignmentField";
import { CustomerHistoryPanel } from "@/components/admin/CustomerHistoryPanel";
import { VehicleHistoryPanel } from "@/components/admin/VehicleHistoryPanel";
import { StatusActions } from "@/components/admin/StatusActions";
import type {
  AppointmentDetailResponse,
  AppointmentStatus,
} from "@/lib/types/database";

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
  const [detail, setDetail] = useState<AppointmentDetailResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
