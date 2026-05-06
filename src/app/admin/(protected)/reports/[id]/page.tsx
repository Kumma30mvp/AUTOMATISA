import { redirect } from "next/navigation";
import { cookies, headers } from "next/headers";
import { verifySession } from "@/lib/auth/verify-session";
import { ReportEditor } from "@/components/admin/ReportEditor";
import type { TechnicalReportResponse } from "@/lib/types/reports";

export const dynamic = "force-dynamic";

type Params = Promise<{ id: string }>;

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type FetchResult =
  | { kind: "ok"; data: TechnicalReportResponse }
  | { kind: "not_found" }
  | { kind: "forbidden"; message: string }
  | { kind: "error"; message: string };

/**
 * Server-side fetch of GET /api/admin/reports/[id], forwarding the
 * caller's cookies so the route's verifySession() / requireStaff()
 * sees the same authenticated user.
 *
 * We deliberately route through the API rather than reading
 * technical_reports directly here. RLS would still hold either way,
 * but the API layer is where actor-name joins, soft-fail behavior,
 * and the response shape are centralized — bypassing it would
 * duplicate that logic and risk drift.
 *
 * The route returns 404 for both "no such id" AND "RLS hides it from
 * this caller" by design (avoids leaking existence). The page surfaces
 * a single "Informe no encontrado" message in both cases.
 */
async function fetchReport(id: string): Promise<FetchResult> {
  const headerStore = await headers();
  const cookieStore = await cookies();

  const host = headerStore.get("host");
  if (!host) {
    return {
      kind: "error",
      message: "No se pudo determinar el host de la petición.",
    };
  }
  const proto = headerStore.get("x-forwarded-proto") ?? "http";
  const baseUrl = `${proto}://${host}`;

  const cookieHeader = cookieStore
    .getAll()
    .map((c) => `${c.name}=${c.value}`)
    .join("; ");

  const res = await fetch(`${baseUrl}/api/admin/reports/${id}`, {
    headers: { cookie: cookieHeader },
    cache: "no-store",
  });

  if (res.status === 404) return { kind: "not_found" };
  if (res.status === 403) {
    let message = "Acceso restringido al informe.";
    try {
      const body = (await res.json()) as { error?: string };
      if (body.error) message = body.error;
    } catch {
      // Ignore JSON parse failure; fall back to the default message.
    }
    return { kind: "forbidden", message };
  }
  if (!res.ok) {
    let message = `Error ${res.status} al cargar el informe.`;
    try {
      const body = (await res.json()) as { error?: string };
      if (body.error) message = body.error;
    } catch {
      // Ignore JSON parse failure; fall back to the default message.
    }
    return { kind: "error", message };
  }

  const data = (await res.json()) as TechnicalReportResponse;
  return { kind: "ok", data };
}

/**
 * Phase 9 full-page editor for a single technical report.
 *
 * Auth flow:
 *   1. (protected) layout already redirects unauthenticated users to
 *      /admin/login. We re-check verifySession() here as defense in
 *      depth (page is safe even if relocated outside the layout).
 *   2. Both admin and staff render this page. Visibility of the
 *      report itself is gated by RLS in the GET handler — staff can
 *      see own reports OR confirmada-tied reports; admin sees all.
 *      Hidden rows return 404 from the API (intentional, avoids
 *      leaking existence) → "Informe no encontrado" UI.
 *   3. The editor is read-only when:
 *        - report_status === 'sent' (lock-sent trigger; Phase 10
 *          territory — never reachable in Phase 9), or
 *        - role === 'staff' AND status !== 'draft' (RLS staff_update
 *          USING denies non-draft updates for staff).
 *      Read-only mode is ReportEditor's responsibility.
 *
 * Error states (page-level):
 *   - Bad UUID format → "ID inválido" (skips the API round-trip).
 *   - 404 from API → "Informe no encontrado".
 *   - 403 from API → "Acceso restringido" with the API message.
 *     (GET on a hidden report returns 404, not 403, so this branch
 *     is reached only if the API ever changes its posture.)
 *   - Any other non-2xx → generic error with the API message or HTTP
 *     status fallback.
 */
export default async function ReportEditorPage({
  params,
}: {
  params: Params;
}) {
  const session = await verifySession();
  if (!session) {
    redirect("/admin/login");
  }

  const { id } = await params;

  if (!UUID_REGEX.test(id)) {
    return (
      <div className="flex flex-col gap-2">
        <h1 className="font-heading text-2xl font-semibold text-navy-900">
          ID inválido
        </h1>
        <p className="text-sm text-nav">
          El identificador del informe no tiene el formato correcto.
        </p>
      </div>
    );
  }

  const result = await fetchReport(id);

  if (result.kind === "not_found") {
    return (
      <div className="flex flex-col gap-2">
        <h1 className="font-heading text-2xl font-semibold text-navy-900">
          Informe no encontrado
        </h1>
        <p className="text-sm text-nav">
          El informe técnico que buscas no existe o no es accesible.
        </p>
      </div>
    );
  }

  if (result.kind === "forbidden") {
    return (
      <div className="flex flex-col gap-2">
        <h1 className="font-heading text-2xl font-semibold text-navy-900">
          Acceso restringido
        </h1>
        <p className="text-sm text-nav">{result.message}</p>
      </div>
    );
  }

  if (result.kind === "error") {
    return (
      <div className="flex flex-col gap-2">
        <h1 className="font-heading text-2xl font-semibold text-navy-900">
          Error al cargar el informe
        </h1>
        <p className="text-sm text-nav">{result.message}</p>
      </div>
    );
  }

  const report = result.data.data;
  const customerName = report.appointment.full_name ?? "Cliente sin nombre";
  const vehicle = [
    report.appointment.vehicle_brand,
    report.appointment.vehicle_model,
  ]
    .filter((part): part is string => Boolean(part))
    .join(" ");

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-heading text-2xl font-semibold text-navy-900">
          Informe técnico
        </h1>
        <p className="text-sm text-nav">
          {customerName} · Placa {report.appointment.car_plate}
          {vehicle && ` · ${vehicle}`}
        </p>
      </div>

      <ReportEditor
        report={report}
        currentRole={session.role}
        currentUserId={session.userId}
      />
    </div>
  );
}
