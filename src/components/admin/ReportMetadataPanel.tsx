import { ReportStatusBadge } from "./ReportStatusBadge";
import type { ReportStatus } from "@/lib/types/reports";

type ActorSummary = { id: string; full_name: string } | null;

type Props = {
  reportStatus: ReportStatus;
  technician: ActorSummary;
  lastEditor: ActorSummary;
  approvedByAdmin: ActorSummary;
  createdAt: string;
  updatedAt: string;
  sentAt: string | null;
};

function formatDateTime(iso: string): string {
  return new Intl.DateTimeFormat("es-PE", {
    timeZone: "America/Lima",
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(iso));
}

/**
 * Read-only summary of a technical report: status pill, technician,
 * timestamps, last editor, and (when applicable) approver and send
 * timestamp. Pure presentation — receives all data via props.
 *
 * Technician edit (admin-only) lives outside this panel; the metadata
 * surface stays static so a glance gives current state without
 * accidentally exposing form controls during read-only views (sent /
 * staff-on-non-draft).
 */
export function ReportMetadataPanel({
  reportStatus,
  technician,
  lastEditor,
  approvedByAdmin,
  createdAt,
  updatedAt,
  sentAt,
}: Props) {
  return (
    <div className="grid grid-cols-1 gap-4 rounded-2xl border border-surface-200 bg-white p-4 sm:grid-cols-2">
      <div>
        <p className="text-xs uppercase tracking-wide text-nav">Estado</p>
        <div className="mt-1">
          <ReportStatusBadge status={reportStatus} />
        </div>
      </div>
      <div>
        <p className="text-xs uppercase tracking-wide text-nav">Técnico</p>
        <p className="text-sm text-navy-900">
          {technician?.full_name ?? "Sin asignar"}
        </p>
      </div>
      <div>
        <p className="text-xs uppercase tracking-wide text-nav">Creado</p>
        <p className="text-sm text-navy-900">{formatDateTime(createdAt)}</p>
      </div>
      <div>
        <p className="text-xs uppercase tracking-wide text-nav">
          Última edición
        </p>
        <p className="text-sm text-navy-900">
          {formatDateTime(updatedAt)}
          {lastEditor?.full_name && (
            <span className="text-nav"> · {lastEditor.full_name}</span>
          )}
        </p>
      </div>
      {approvedByAdmin && (
        <div>
          <p className="text-xs uppercase tracking-wide text-nav">
            Aprobado por
          </p>
          <p className="text-sm text-navy-900">{approvedByAdmin.full_name}</p>
        </div>
      )}
      {sentAt && (
        <div>
          <p className="text-xs uppercase tracking-wide text-nav">Enviado</p>
          <p className="text-sm text-navy-900">{formatDateTime(sentAt)}</p>
        </div>
      )}
    </div>
  );
}
