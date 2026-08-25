import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Allow auth callback, login, cron, the calendar feed, and the biometric
  // ingest paths without session auth. The calendar feed is polled by external
  // clients (Google Calendar) with no cookies — it authenticates itself via
  // its ?token= query param, so a session redirect here would break every
  // subscription.
  //
  // /iclock/* is the fingerprint scanner's ADMS feed. The device has no
  // cookies and does not follow redirects — bouncing it to /login would look
  // to the firmware like the server is broken, and it would silently stop
  // posting attendance. It authenticates on its serial number instead; see
  // lib/biometric/device.ts. /api/biometric/ingest uses a bearer secret.
  const isAuthRoute =
    request.nextUrl.pathname.startsWith("/login") ||
    request.nextUrl.pathname.startsWith("/auth") ||
    request.nextUrl.pathname.startsWith("/api/auth") ||
    request.nextUrl.pathname.startsWith("/api/cron") ||
    request.nextUrl.pathname.startsWith("/api/calendar/feed") ||
    request.nextUrl.pathname.startsWith("/api/biometric/ingest") ||
    request.nextUrl.pathname.startsWith("/iclock");

  // Skip getUser() for auth routes — calling it during the PKCE callback
  // can interfere with the code verifier cookie before exchangeCodeForSession runs
  if (isAuthRoute) {
    return supabaseResponse;
  }

  // If there's an auth code in the URL, redirect to the callback handler
  const code = request.nextUrl.searchParams.get("code");
  if (code) {
    const url = request.nextUrl.clone();
    url.pathname = "/auth/callback";
    return NextResponse.redirect(url);
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  // Bump last_active_at at most once per minute per session. The cookie is the
  // hot-path throttle (no DB round-trip when fresh); the SQL function carries
  // its own 1-minute WHERE guard so a missing/forged cookie can't cause write
  // amplification.
  const lastBump = Number(request.cookies.get("last_active_bump")?.value);
  if (!lastBump || Date.now() - lastBump > 60_000) {
    await supabase.rpc("touch_last_active");
    supabaseResponse.cookies.set("last_active_bump", String(Date.now()), {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24,
    });
  }

  return supabaseResponse;
}
