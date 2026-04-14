import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "@/lib/env";

/**
 * Next.js 16 Proxy — optimistic auth check for /admin/* routes.
 *
 * This only reads Supabase session cookies to detect whether a user
 * appears to be authenticated. It does NOT verify the token against
 * the database or check staff_profiles — that happens in the
 * server-side Data Access Layer (lib/auth/verify-session.ts).
 */
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Only protect /admin routes (except the login page itself)
  const isAdminRoute =
    pathname.startsWith("/admin") && !pathname.startsWith("/admin/login");

  if (!isAdminRoute) {
    return NextResponse.next();
  }

  // Create a response we can modify (to pass updated cookies through)
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    SUPABASE_URL,
    SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet, headers) {
          // Update the request cookies for downstream server components
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          // Recreate response to carry the updated request cookies
          response = NextResponse.next({ request });
          // Set cookies on the response
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
          // Set cache headers to prevent CDN caching of auth responses
          Object.entries(headers).forEach(([key, val]) =>
            response.headers.set(key, val)
          );
        },
      },
    }
  );

  // Optimistic check: getSession reads from cookies without server call.
  // This is intentional — proxy should be fast and avoid network calls.
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    const loginUrl = new URL("/admin/login", request.url);
    return NextResponse.redirect(loginUrl);
  }

  return response;
}

// Only run proxy on admin routes and auth callback
export const config = {
  matcher: ["/admin/:path*"],
};
