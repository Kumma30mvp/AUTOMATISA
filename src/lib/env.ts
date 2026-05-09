import { z } from "zod";

// Public env (browser-safe): validated eagerly so any deploy that's
// missing the required Supabase URL / anon key fails to boot rather
// than blowing up on first request.
const envSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
});

const parsed = envSchema.safeParse({
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
});

if (!parsed.success) {
  throw new Error(
    "Missing or invalid Supabase environment variables. " +
      "Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local.\n" +
      parsed.error.issues.map((i) => `  - ${i.path}: ${i.message}`).join("\n")
  );
}

export const SUPABASE_URL = parsed.data.NEXT_PUBLIC_SUPABASE_URL;
export const SUPABASE_ANON_KEY = parsed.data.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// =============================================================
// Server-only env (lazy validation)
// =============================================================
//
// Phase 10 introduces a service-role Supabase client used by the
// Send-PDF-and-complete pipeline. The service role key is a *secret*
// that bypasses RLS — it must NEVER be exposed to the browser bundle
// (no NEXT_PUBLIC_ prefix) and must only be read inside server-only
// modules.
//
// Validation is **lazy**: builds without the key still succeed, so
// local dev and preview deploys don't blow up just because the secret
// isn't wired yet. The key is only required when the API routes that
// import the service-role client are actually invoked. Each accessor
// throws a clear error at call time if the env var is missing.
//
// Do NOT export the raw value as a module-level constant. Lazy
// accessors keep the value scoped to where it's actually needed and
// make grep-driven security reviews trivial.

export function getServiceRoleKey(): string {
  const value = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!value || value.length === 0) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY is not set. This secret is required by the " +
        "service-role Supabase client used in the Phase 10 send pipeline. " +
        "Add it to .env.local (development) and Vercel project env (preview " +
        "+ production). NEVER prefix with NEXT_PUBLIC_."
    );
  }
  return value;
}

/**
 * Resend API key for outbound email delivery (Phase 10).
 *
 * Lazy: only required when the email module is actually invoked. Builds
 * without the key continue to succeed; routes that hit the send pipeline
 * will throw at call time if the env var is missing.
 *
 * Must NOT be prefixed with NEXT_PUBLIC_. Treat as a secret on Vercel.
 */
export function getResendApiKey(): string {
  const value = process.env.RESEND_API_KEY;
  if (!value || value.length === 0) {
    throw new Error(
      "RESEND_API_KEY is not set. This secret is required by the email " +
        "module used in the Phase 10 send pipeline. Add it to .env.local " +
        "(development) and Vercel project env (preview + production). " +
        "NEVER prefix with NEXT_PUBLIC_."
    );
  }
  return value;
}

/**
 * Verified sender address used for outbound report emails (Phase 10).
 *
 * Domain must be verified in Resend (SPF/DKIM) for production
 * deliverability. The accepted format is either a bare address
 * (`reports@automatisa.pe`) or RFC 5322 form
 * (`AUTOMATISA <reports@automatisa.pe>`); Resend handles both.
 *
 * Lazy: only required when the email module sends.
 */
export function getResendFromAddress(): string {
  const value = process.env.RESEND_FROM_ADDRESS;
  if (!value || value.length === 0) {
    throw new Error(
      "RESEND_FROM_ADDRESS is not set. This is the verified sender used by " +
        "the email module. Add it to .env.local and Vercel project env."
    );
  }
  return value;
}
