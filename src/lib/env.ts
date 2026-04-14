import { z } from "zod";

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
