import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { SUPABASE_URL, getServiceRoleKey } from "@/lib/env";

/**
 * Service-role Supabase client factory — Phase 10.
 *
 * The service role bypasses RLS. Use this client ONLY inside admin-gated
 * server routes that have already validated authorization (typically via
 * `requireAdmin()` from `@/lib/auth/require`), and only for operations
 * that genuinely need privilege escalation:
 *
 *   - storage uploads + deletes for the private `technical-reports` bucket
 *   - signed-URL minting (after a standard RLS-gated visibility check)
 *   - calling the SECURITY DEFINER `fn_send_and_complete_report` RPC
 *   - inserting / updating notification_logs rows from inside the send
 *     pipeline
 *
 * Discipline (every importer must obey):
 *   1. Module imports must remain inside `src/app/api/admin/…` or
 *      `src/lib/{pdf,email}/…`. UI components, public pages, and public
 *      API routes MUST NOT import this file. The `import "server-only"`
 *      directive at the top of this file makes any client-component
 *      import a build-time error.
 *   2. Mutation routes (e.g. POST /reports/[id]/send) require
 *      `requireAdmin()` at entry.
 *   3. Read-only routes that use the service-role client purely to mint
 *      signed URLs (e.g. GET /reports/[id]/pdf-url) may use
 *      `requireStaff()` BUT only after performing a standard RLS-gated
 *      visibility check on the underlying record. The service-role call
 *      is reduced to mechanical signed-URL generation; the access
 *      decision is made by ordinary RLS.
 *   4. Never log or echo the key. Never serialize the client into a
 *      response body.
 *
 * Per-request factory (no singleton):
 *   The Supabase JS client maintains internal Auth state. A module-level
 *   singleton can leak that state across requests in a serverless runtime.
 *   Construct a fresh client per request via this factory.
 *
 * Auth options:
 *   - persistSession=false / autoRefreshToken=false: there is no user
 *     session here; the bearer is the service role key itself.
 *   - detectSessionInUrl=false: not relevant in a server runtime.
 */
export function createServiceRoleClient(): SupabaseClient {
  return createClient(SUPABASE_URL, getServiceRoleKey(), {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}
