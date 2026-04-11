import { createClient } from "@/lib/supabase/server";
import { adminListQuerySchema } from "@/lib/validations/admin";
import { SummaryCards } from "@/components/admin/SummaryCards";
import { Filters } from "@/components/admin/Filters";
import { AppointmentsTable } from "@/components/admin/AppointmentsTable";
import type {
  AppointmentRequestFull,
  SummaryCounts,
} from "@/lib/types/database";

export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function normalize(
  sp: Record<string, string | string[] | undefined>
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(sp)) {
    if (typeof v === "string") out[k] = v;
    else if (Array.isArray(v) && v[0]) out[k] = v[0];
  }
  return out;
}

export default async function CitasPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const rawParams = normalize(await searchParams);
  const parsed = adminListQuerySchema.safeParse(rawParams);

  // If the user manually crafts bad params, fall back to defaults silently.
  const query = parsed.success
    ? parsed.data
    : adminListQuerySchema.parse({});

  const supabase = await createClient();

  // Build list query
  let listQuery = supabase
    .from("appointment_requests")
    .select("*, service_catalog(name)", { count: "exact" })
    .order("created_at", { ascending: false });

  if (query.dni) listQuery = listQuery.ilike("dni", `${query.dni}%`);
  if (query.car_plate)
    listQuery = listQuery.ilike("car_plate", `${query.car_plate}%`);
  if (query.status) listQuery = listQuery.eq("status", query.status);
  if (query.from)
    listQuery = listQuery.gte("created_at", `${query.from}T00:00:00`);
  if (query.to)
    listQuery = listQuery.lte("created_at", `${query.to}T23:59:59.999`);

  const fromIdx = (query.page - 1) * query.pageSize;
  const toIdx = fromIdx + query.pageSize - 1;
  listQuery = listQuery.range(fromIdx, toIdx);

  const [listResult, summaryResult] = await Promise.all([
    listQuery,
    supabase.rpc("get_appointment_summary"),
  ]);

  const rows = (listResult.data ?? []) as AppointmentRequestFull[];
  const total = listResult.count ?? 0;

  const summaryRow = Array.isArray(summaryResult.data)
    ? summaryResult.data[0]
    : summaryResult.data;
  const counts: SummaryCounts = {
    pendiente: Number(summaryRow?.pendiente ?? 0),
    confirmada: Number(summaryRow?.confirmada ?? 0),
    cancelada: Number(summaryRow?.cancelada ?? 0),
    completada: Number(summaryRow?.completada ?? 0),
  };

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-heading text-2xl font-semibold text-navy-900">
          Solicitudes de cita
        </h1>
        <p className="text-sm text-nav">
          Gestione las solicitudes recibidas desde el sitio público.
        </p>
      </div>

      <SummaryCards counts={counts} />
      <Filters />
      <AppointmentsTable
        rows={rows}
        total={total}
        page={query.page}
        pageSize={query.pageSize}
      />
    </div>
  );
}
