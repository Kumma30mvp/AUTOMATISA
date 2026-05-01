import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const GENERIC_ERROR = "No se pudo iniciar sesión. Verifique sus datos.";

const loginSchema = z.object({
  email: z.email().transform((v) => v.toLowerCase()),
  password: z.string().min(1),
});

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, error: GENERIC_ERROR },
      { status: 401 }
    );
  }

  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: GENERIC_ERROR },
      { status: 401 }
    );
  }

  const supabase = await createClient();

  const { error: authError } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });

  if (authError) {
    return NextResponse.json(
      { success: false, error: GENERIC_ERROR },
      { status: 401 }
    );
  }

  // Use the same client that just signed in — it already holds the
  // authenticated session in memory, so getUser() works without
  // needing the response cookies to round-trip through the browser.
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    await supabase.auth.signOut();
    return NextResponse.json(
      { success: false, error: GENERIC_ERROR },
      { status: 401 }
    );
  }

  const { data: staff, error: staffError } = await supabase
    .from("staff_profiles")
    .select("is_active")
    .eq("id", user.id)
    .single();

  if (staffError || !staff || !staff.is_active) {
    await supabase.auth.signOut();
    return NextResponse.json(
      { success: false, error: GENERIC_ERROR },
      { status: 401 }
    );
  }

  return NextResponse.json({ success: true });
}
