import type { ReportStatus } from "@/lib/types/reports";

const STATUS_STYLES: Record<ReportStatus, string> = {
  draft: "bg-surface-100 text-navy-700 border-surface-200",
  ready_for_review: "bg-amber-100 text-amber-800 border-amber-200",
  approved_for_delivery: "bg-blue-lighter text-blue-accent border-blue-light",
  sent: "bg-green-100 text-green-700 border-green-200",
};

const STATUS_LABELS: Record<ReportStatus, string> = {
  draft: "Borrador",
  ready_for_review: "Para revisión",
  approved_for_delivery: "Aprobado para entrega",
  sent: "Enviado",
};

export function ReportStatusBadge({ status }: { status: ReportStatus }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${STATUS_STYLES[status]}`}
    >
      {STATUS_LABELS[status]}
    </span>
  );
}
