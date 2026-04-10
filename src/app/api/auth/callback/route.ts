import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Supabase Auth callback handler.
 *
 * After a user signs in, Supabase redirects to this route with a `code`
 * query parameter. We exchange it for a session, which sets the auth
 * cookies for subsequent requests.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/admin/citas";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      return NextResponse.redirect(new URL(next, origin));
    }
  }

  // If code exchange fails, redirect to login with error indication
  return NextResponse.redirect(new URL("/admin/login?error=auth", origin));
}
