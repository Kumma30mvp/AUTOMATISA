import { redirect } from "next/navigation";
import { cookies, headers } from "next/headers";
import { verifySession } from "@/lib/auth/verify-session";
import { StaffQueueTable } from "@/components/admin/StaffQueueTable";
import type { AdminListResponse } from "@/lib/types/database";

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

/**
 * Fetches the confirmed-only queue from the dedicated API route.
 * The route enforces RBAC and the status='confirmada' filter
 * server-side. We forward the session cookies so the route's
 * verifySession() / requireStaff() check passes for the same user.
 *
 * We deliberately do NOT read appointment_requests directly from
 * Supabase here — access filtering must stay centralized in the
 * route handler so it cannot drift across call sites.
 */
async function fetchQueue(
  params: Record<string, string>
): Promise<AdminListResponse> {
  const headerStore = await headers();
  const cookieStore = await cookies();

  const host = headerStore.get("host");
  if (!host) {
    throw new Error("Cannot determine request host for SSR fetch");
  }
  const proto = headerStore.get("x-forwarded-proto") ?? "http";
  const baseUrl = `${proto}://${host}`;

  const cookieHeader = cookieStore
    .getAll()
    .map((c) => `${c.name}=${c.value}`)
    .join("; ");

  const qs = new URLSearchParams();
  if (params.page) qs.set("page", params.page);
  if (params.pageSize) qs.set("pageSize", params.pageSize);

  const url = `${baseUrl}/api/admin/staff/queue${
    qs.toString() ? `?${qs.toString()}` : ""
  }`;

  const response = await fetch(url, {
    headers: { cookie: cookieHeader },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(
      `Failed to fetch staff queue: ${response.status} ${response.statusText}`
    );
  }

  return (await response.json()) as AdminListResponse;
}

export default async function StaffWorkspacePage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  // Defense-in-depth: the (protected) layout already redirects
  // unauthenticated users. Both admin and staff may render this page.
  const session = await verifySession();
  if (!session) {
    redirect("/admin/login");
  }

  const rawParams = normalize(await searchParams);
  const queue = await fetchQueue(rawParams);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-heading text-2xl font-semibold text-navy-900">
          Citas confirmadas
        </h1>
        <p className="text-sm text-nav">
          Cola operativa. Solo se muestran citas confirmadas.
        </p>
      </div>

      <StaffQueueTable
        rows={queue.data}
        total={queue.total}
        page={queue.page}
        pageSize={queue.pageSize}
      />
    </div>
  );
}
