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

// =============================================================
// Gmail SMTP env (Phase 10b)
// =============================================================
//
// Phase 10 originally shipped with Resend as the email provider. Phase
// 10b swaps that for Gmail SMTP via nodemailer + a Google App Password
// because the project does not own a custom domain. The send pipeline,
// retry caps, notification_logs lifecycle, and UI all stay unchanged —
// only the underlying transport changes.
//
// All accessors below are lazy: builds without the env vars succeed,
// and only routes that actually invoke the email module fail at runtime.
// None of these may be prefixed with NEXT_PUBLIC_; treat the App
// Password (and the user/host config alongside it) as secrets on Vercel.

function readRequiredEnv(name: string, hint: string): string {
  const value = process.env[name];
  if (!value || value.length === 0) {
    throw new Error(
      `${name} is not set. ${hint} ` +
        "Add it to .env.local (development) and Vercel project env " +
        "(preview + production). NEVER prefix with NEXT_PUBLIC_."
    );
  }
  return value;
}

export function getSmtpHost(): string {
  return readRequiredEnv(
    "SMTP_HOST",
    "Typically 'smtp.gmail.com' for Gmail SMTP."
  );
}

export function getSmtpPort(): number {
  const raw = readRequiredEnv(
    "SMTP_PORT",
    "Typically '465' for Gmail with implicit TLS."
  );
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(
      `SMTP_PORT must be a positive integer; got '${raw}'.`
    );
  }
  return parsed;
}

export function getSmtpSecure(): boolean {
  const raw = readRequiredEnv(
    "SMTP_SECURE",
    "Set to 'true' for implicit TLS (port 465) or 'false' for STARTTLS."
  );
  if (raw === "true") return true;
  if (raw === "false") return false;
  throw new Error(
    `SMTP_SECURE must be 'true' or 'false'; got '${raw}'.`
  );
}

export function getSmtpUser(): string {
  return readRequiredEnv(
    "SMTP_USER",
    "The Gmail address that owns the App Password (e.g., admin@gmail.com)."
  );
}

/**
 * Returns the Google App Password used to authenticate SMTP.
 *
 * Generated at https://myaccount.google.com/apppasswords (requires
 * 2-Step Verification on the Gmail account). Strip spaces; the value
 * is the 16 contiguous characters Google shows in the dialog.
 *
 * The error message intentionally does NOT echo the raw value, so a
 * misconfigured deployment doesn't end up logging the secret.
 */
export function getSmtpAppPassword(): string {
  const value = process.env.SMTP_APP_PASSWORD;
  if (!value || value.length === 0) {
    throw new Error(
      "SMTP_APP_PASSWORD is not set. This is a Google App Password " +
        "(16 chars, no spaces) for the SMTP_USER account. Generate it at " +
        "https://myaccount.google.com/apppasswords. Add it to .env.local " +
        "and Vercel project env. NEVER prefix with NEXT_PUBLIC_."
    );
  }
  return value;
}

/**
 * Returns the From header used for outbound email. Must use the same
 * Gmail address as `SMTP_USER` — Gmail SMTP rejects mismatched senders.
 * Accepts a bare address (`admin@gmail.com`) or RFC 5322 form
 * (`Administradora <admin@gmail.com>`).
 */
export function getSmtpFromAddress(): string {
  return readRequiredEnv(
    "SMTP_FROM_ADDRESS",
    "Used as the email From header. Must match SMTP_USER's domain. " +
      "Format: 'Administradora <admin@gmail.com>' or 'admin@gmail.com'."
  );
}
