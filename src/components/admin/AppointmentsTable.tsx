"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { Eye, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { StatusBadge } from "@/components/ui/Badge";
import { AppointmentDetail } from "@/components/admin/AppointmentDetail";
import type { AppointmentRequestFull } from "@/lib/types/database";

type Props = {
  rows: AppointmentRequestFull[];
  total: number;
  page: number;
  pageSize: number;
};

function formatDateTime(iso: string): string {
  return new Intl.DateTimeFormat("es-PE", {
    timeZone: "America/Lima",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(iso));
}

export function AppointmentsTable({ rows, total, page, pageSize }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  function goToPage(nextPage: number) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("page", String(nextPage));
    router.replace(`/admin/citas?${params.toString()}`);
  }

  return (
    <div className="overflow-hidden rounded-xl border border-surface-200 bg-white shadow-sm">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-surface-200 text-sm">
          <thead className="bg-surface-50 text-left text-xs uppercase tracking-wide text-nav">
            <tr>
              <th className="px-4 py-3">Recibida</th>
              <th className="px-4 py-3">DNI</th>
              <th className="px-4 py-3">Nombre</th>
              <th className="px-4 py-3">Placa</th>
              <th className="px-4 py-3">Servicio</th>
              <th className="px-4 py-3">Preferida</th>
              <th className="px-4 py-3">Estado</th>
              <th className="px-4 py-3 text-right">Acción</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-surface-200 text-navy-900">
            {rows.length === 0 && (
              <tr>
                <td
                  colSpan={8}
                  className="px-4 py-10 text-center text-sm text-nav"
                >
                  No hay solicitudes que coincidan con los filtros.
                </td>
              </tr>
            )}
            {rows.map((r) => (
              <tr key={r.id} className="hover:bg-surface-50">
                <td className="whitespace-nowrap px-4 py-3">
                  {formatDateTime(r.created_at)}
                </td>
                <td className="px-4 py-3">{r.dni}</td>
                <td className="px-4 py-3">{r.full_name ?? "—"}</td>
                <td className="px-4 py-3 font-mono">{r.car_plate}</td>
                <td className="px-4 py-3">
                  {r.service_catalog?.name ?? "—"}
                </td>
                <td className="px-4 py-3">
                  {r.preferred_date ? (
                    <>
                      {r.preferred_date}
                      {r.preferred_time ? ` ${r.preferred_time.slice(0, 5)}` : ""}
                    </>
                  ) : (
                    "—"
                  )}
                </td>
                <td className="px-4 py-3">
                  <StatusBadge status={r.status} />
                </td>
                <td className="px-4 py-3 text-right">
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => setSelectedId(r.id)}
                  >
                    <Eye className="h-4 w-4" /> Ver
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between border-t border-surface-200 bg-surface-50 px-4 py-3 text-sm text-nav">
        <p>
          {total === 0
            ? "0 resultados"
            : `Mostrando ${Math.min((page - 1) * pageSize + 1, total)}-${Math.min(
                page * pageSize,
                total
              )} de ${total}`}
        </p>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="ghost"
            disabled={page <= 1}
            onClick={() => goToPage(page - 1)}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span>
            Página {page} / {totalPages}
          </span>
          <Button
            size="sm"
            variant="ghost"
            disabled={page >= totalPages}
            onClick={() => goToPage(page + 1)}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <AppointmentDetail
        appointmentId={selectedId}
        onClose={() => setSelectedId(null)}
      />
    </div>
  );
}
