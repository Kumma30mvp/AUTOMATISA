"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp, Loader2 } from "lucide-react";
import { StatusBadge } from "@/components/ui/Badge";
import type {
  VehicleHistoryItem,
  VehicleHistoryResponse,
} from "@/lib/types/history";

type Props = {
  carPlate: string;
  /**
   * Optional appointment id to omit from the rendered list —
   * typically the appointment whose detail is currently open.
   */
  excludeAppointmentId?: string;
};

function formatDate(iso: string): string {
  return new Intl.DateTimeFormat("es-PE", {
    timeZone: "America/Lima",
    dateStyle: "short",
  }).format(new Date(iso));
}

/**
 * Vehicle-history disclosure panel keyed on car plate.
 *
 * Collapsed by default. Expanding triggers a single fetch to
 * /api/admin/vehicle-history?car_plate=… (case-insensitive match
 * via ILIKE; LIMIT 50 enforced server-side). Both admin and
 * staff may consume this panel.
 *
 * Mirrors CustomerHistoryPanel's UX so the appointment detail
 * stays consistent. Phase 9 may add report links per row.
 */
export function VehicleHistoryPanel({
  carPlate,
  excludeAppointmentId,
}: Props) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<VehicleHistoryItem[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasFetched, setHasFetched] = useState(false);

  async function fetchHistory() {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams();
      qs.set("car_plate", carPlate);
      const res = await fetch(`/api/admin/vehicle-history?${qs.toString()}`);
      const body = await res.json();
      if (!res.ok) {
        setError(body.error ?? "Error al cargar el historial");
        setItems(null);
        return;
      }
      setItems((body as VehicleHistoryResponse).data);
      setHasFetched(true);
    } catch {
      setError("Error de red");
    } finally {
      setLoading(false);
    }
  }

  function handleToggle() {
    const willOpen = !open;
    setOpen(willOpen);
    if (willOpen && !hasFetched && !loading) {
      void fetchHistory();
    }
  }

  const visibleItems = (items ?? []).filter(
    (i) => !excludeAppointmentId || i.id !== excludeAppointmentId
  );

  return (
    <section className="rounded-lg border border-surface-200">
      <button
        type="button"
        onClick={handleToggle}
        className="flex w-full items-center justify-between px-4 py-3 text-left text-sm font-medium text-navy-900 hover:bg-surface-50"
        aria-expanded={open}
      >
        <span>Historial del vehículo</span>
        {open ? (
          <ChevronUp className="h-4 w-4 text-nav" />
        ) : (
          <ChevronDown className="h-4 w-4 text-nav" />
        )}
      </button>

      {open && (
        <div className="border-t border-surface-200 px-4 py-3">
          {loading && (
            <div className="flex items-center gap-2 text-sm text-nav">
              <Loader2 className="h-4 w-4 animate-spin" />
              Cargando historial…
            </div>
          )}

          {error && !loading && (
            <div className="flex items-center justify-between gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
              <span>{error}</span>
              <button
                type="button"
                onClick={() => void fetchHistory()}
                className="text-xs font-medium underline hover:no-underline"
              >
                Reintentar
              </button>
            </div>
          )}

          {!loading && !error && hasFetched && visibleItems.length === 0 && (
            <p className="text-sm text-nav">
              Sin historial previo para esta placa.
            </p>
          )}

          {!loading && !error && visibleItems.length > 0 && (
            <ul className="flex flex-col divide-y divide-surface-200">
              {visibleItems.map((item) => (
                <li
                  key={item.id}
                  className="flex flex-col gap-1 py-2 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="flex flex-col">
                    <p className="text-sm text-navy-900">
                      {item.service_name ?? "Servicio sin clasificar"}
                    </p>
                    <p className="text-xs text-nav">
                      {item.vehicle_brand || item.vehicle_model
                        ? `${[item.vehicle_brand, item.vehicle_model]
                            .filter(Boolean)
                            .join(" ")} · `
                        : ""}
                      {formatDate(item.created_at)}
                    </p>
                  </div>
                  <StatusBadge status={item.status} />
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
