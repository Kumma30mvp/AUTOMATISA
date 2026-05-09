"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import type {
  NotificationLogListResponse,
  NotificationLogRow,
  NotificationStatus,
} from "@/lib/types/notifications";

type Props = {
  reportId: string;
  /** Increment to force a refetch (used by ReportEditor after send /
   *  resend). Optional — the component still loads on mount and can
   *  be refreshed manually via the "Actualizar" button. */
  refreshKey?: number;
};

const STATUS_LABELS: Record<NotificationStatus, string> = {
  pending: "Pendiente",
  sent: "Enviado",
  failed: "Fallido",
};

const STATUS_STYLES: Record<NotificationStatus, string> = {
  pending: "bg-amber-100 text-amber-800 border-amber-200",
  sent: "bg-green-100 text-green-700 border-green-200",
  failed: "bg-red-100 text-red-700 border-red-200",
};

function formatDateTime(iso: string): string {
  return new Intl.DateTimeFormat("es-PE", {
    timeZone: "America/Lima",
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(iso));
}

function StatusBadge({ status }: { status: NotificationStatus }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[status]}`}
    >
      {STATUS_LABELS[status]}
    </span>
  );
}

/**
 * Read-only audit timeline of notification attempts for a single
 * technical report. Wired into the report editor when
 * `reportStatus === 'sent'`. Phase 10.
 *
 * Data source: GET /api/admin/reports/[id]/notifications
 *   - admin: sees all logs
 *   - staff (technician): sees their own report's logs
 *   - staff (foreign report tied to confirmada): sees an empty list
 *     (RLS hides; UI mirrors)
 *
 * Phase 10 lifetime cap is 20 attempts/report so a single SELECT
 * without pagination is safe. The component stays compact: status pill
 * + attempt number + the actor-readable fields (recipient, provider,
 * timestamps, optional provider_message_id, optional error_message).
 *
 * No mutations. No service-role usage. The "Actualizar" button
 * re-issues the GET; bumping `refreshKey` from the parent (after a
 * successful send / resend) does the same automatically.
 */
export function NotificationLogList({ reportId, refreshKey }: Props) {
  const [logs, setLogs] = useState<NotificationLogRow[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/reports/${reportId}/notifications`);
      const body = await res.json();
      if (!res.ok) {
        setError(
          (body && typeof body.error === "string" ? body.error : null) ??
            `Error ${res.status}`
        );
        return;
      }
      setLogs((body as NotificationLogListResponse).data);
    } catch {
      setError("Error de red. Intente nuevamente.");
    } finally {
      setLoading(false);
    }
  }, [reportId]);

  // Initial load on mount + reactive reload when the parent bumps
  // refreshKey (e.g., after send / resend completes).
  useEffect(() => {
    load();
  }, [load, refreshKey]);

  const isInitialLoading = loading && logs === null;
  const hasLogs = logs !== null && logs.length > 0;
  const isEmpty = logs !== null && logs.length === 0;

  return (
    <section className="rounded-2xl border border-surface-200 bg-white p-4">
      <header className="mb-3 flex items-center justify-between gap-2">
        <h3 className="font-heading text-sm font-semibold text-navy-900">
          Historial de envíos
        </h3>
        <Button
          variant="secondary"
          size="sm"
          loading={loading}
          disabled={loading}
          onClick={() => load()}
        >
          Actualizar
        </Button>
      </header>

      {isInitialLoading && (
        <div className="flex items-center justify-center py-6 text-nav">
          <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
        </div>
      )}

      {error && !loading && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      {!error && isEmpty && (
        <p className="text-sm text-nav">
          No hay registros de envíos para este informe.
        </p>
      )}

      {!error && hasLogs && (
        <ol className="flex flex-col gap-3">
          {logs!.map((log) => (
            <li
              key={log.id}
              className="rounded-lg border border-surface-200 p-3"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <StatusBadge status={log.status} />
                <span className="text-xs text-nav">
                  Intento #{log.attempt}
                </span>
              </div>
              <div className="mt-2 grid grid-cols-1 gap-2 text-xs sm:grid-cols-2">
                <div>
                  <p className="uppercase tracking-wide text-nav">
                    Destinatario
                  </p>
                  <p className="break-all text-navy-900">
                    {log.recipient_email}
                  </p>
                </div>
                <div>
                  <p className="uppercase tracking-wide text-nav">Proveedor</p>
                  <p className="text-navy-900">{log.provider}</p>
                </div>
                <div>
                  <p className="uppercase tracking-wide text-nav">Creado</p>
                  <p className="text-navy-900">
                    {formatDateTime(log.created_at)}
                  </p>
                </div>
                {log.sent_at && (
                  <div>
                    <p className="uppercase tracking-wide text-nav">Enviado</p>
                    <p className="text-navy-900">
                      {formatDateTime(log.sent_at)}
                    </p>
                  </div>
                )}
                {log.provider_message_id && (
                  <div className="sm:col-span-2">
                    <p className="uppercase tracking-wide text-nav">
                      ID del proveedor
                    </p>
                    <p className="break-all text-navy-900">
                      {log.provider_message_id}
                    </p>
                  </div>
                )}
              </div>
              {log.error_message && (
                <div className="mt-2 rounded bg-red-50 p-2 text-xs text-red-700">
                  <p className="font-medium uppercase tracking-wide">Error</p>
                  <p className="mt-0.5 break-words">{log.error_message}</p>
                </div>
              )}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
