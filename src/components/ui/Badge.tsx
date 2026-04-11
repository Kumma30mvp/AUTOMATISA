import type { AppointmentStatus } from "@/lib/types/database";

const STATUS_STYLES: Record<AppointmentStatus, string> = {
  pendiente: "bg-amber-100 text-amber-800 border-amber-200",
  confirmada: "bg-blue-lighter text-blue-accent border-blue-light",
  cancelada: "bg-red-100 text-red-700 border-red-200",
  completada: "bg-green-100 text-green-700 border-green-200",
};

const STATUS_LABELS: Record<AppointmentStatus, string> = {
  pendiente: "Pendiente",
  confirmada: "Confirmada",
  cancelada: "Cancelada",
  completada: "Completada",
};

export function StatusBadge({ status }: { status: AppointmentStatus }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${STATUS_STYLES[status]}`}
    >
      {STATUS_LABELS[status]}
    </span>
  );
}
