import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { TENANT_HEADER, tenantFromHost } from "@/lib/clinic-url";

// The app has ONE set of routes; the Host decides which clinic they belong to.
// Nothing is rewritten and nothing is redirected between hosts here — the
// middleware only resolves the clinic from the subdomain, stamps it on the
// request (TENANT_HEADER) for the app to read, and gates access.

// Public routes on the ROOT domain: marketing and the platform-admin sign-in.
const PUBLIC_ROOT_ROUTES = ["/", "/login", "/forgot-password", "/reset-password", "/set-password"];

// A clinic's public surface, as seen on its own subdomain: the landing page and
// its own login/register. Everything deeper (/admin, /doctor, /dashboard…)
// stays authenticated.
const PUBLIC_TENANT_ROUTES = [
  "/",
  "/login",
  "/register",
  "/verify-otp",
  "/forgot-password",
  "/reset-password",
  "/set-password",
];

// Routes that only exist inside a clinic. On the root domain they are not a
// 404 to be discovered — the visitor is simply sent to the marketing page.
//
// The mirror case, /platform on a clinic host, is handled in the platform layout
// instead: a cross-host redirect from middleware is unreliable, because
// `nextUrl` carries the server's own origin in dev, so Next rewrites the
// Location back to a relative path and the request bounces here in a loop.
const TENANT_ONLY_PREFIXES = [
  "/admin",
  "/doctor",
  "/dashboard",
  "/profile",
  "/register",
  "/verify-otp",
];

// Routes that accept unauthenticated guest requests (no Supabase session at
// all) — the route handler itself scopes what a guest can do. `/api/inngest` is
// called by Inngest (sync + function invocations) with no Supabase session; it
// is secured instead by Inngest's request-signature verification (signing key),
// so it must bypass the auth redirect or the sync request lands on /login.
const PUBLIC_API_ROUTES = ["/api/meta/whatsapp/webhook", "/api/agent/chat", "/api/inngest"];

// API handlers scope themselves (the WhatsApp webhook identifies its clinic by
// token) and emailed auth links must resolve on whichever host they were built
// for, so neither is gated on which host it arrived at.
const HOST_AGNOSTIC_PREFIXES = ["/api/", "/auth/"];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  // `x-forwarded-host` before `host`: when a server action calls redirect() to an
  // app-relative path, Next re-fetches that path internally to stream it back with
  // the action response, and that fetch goes to the server's own origin — so `host`
  // arrives as the internal origin and the clinic subdomain is gone. The original
  // public host survives on `x-forwarded-host`. Without this, the first render after
  // login resolves to no clinic at all.
  const tenant = tenantFromHost(
    request.headers.get("x-forwarded-host") ?? request.headers.get("host")
  );

  // Rebuilt from the live request each time, so cookies Supabase refreshes below
  // are carried through. Stamping the tenant here — and deleting it otherwise —
  // is what makes the header trustworthy: a client can't inject its own.
  const requestHeaders = () => {
    const h = new Headers(request.headers);
    if (tenant) h.set(TENANT_HEADER, tenant);
    else h.delete(TENANT_HEADER);
    return h;
  };
  const passThrough = () => NextResponse.next({ request: { headers: requestHeaders() } });

  const isHostAgnostic = HOST_AGNOSTIC_PREFIXES.some((p) => pathname.startsWith(p));

  if (!isHostAgnostic) {
    const isTenantOnly = TENANT_ONLY_PREFIXES.some(
      (p) => pathname === p || pathname.startsWith(`${p}/`)
    );
    if (!tenant && isTenantOnly) {
      const url = request.nextUrl.clone();
      url.pathname = "/";
      url.search = "";
      return NextResponse.redirect(url);
    }
  }

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return passThrough();
  }

  let supabaseResponse = passThrough();

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = passThrough();
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isPublic =
    // Emailed auth links (verify token → set session → redirect). These must run
    // BEFORE any session exists, so they can't be gated on `user`.
    pathname.startsWith("/auth/") ||
    (tenant ? PUBLIC_TENANT_ROUTES.includes(pathname) : PUBLIC_ROOT_ROUTES.includes(pathname));
  const isPublicApi = PUBLIC_API_ROUTES.some((r) => pathname.startsWith(r));

  if (!user && !isPublic && !isPublicApi) {
    // Stays on the current host, so a clinic visitor lands on that clinic's login.
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  if (user && (pathname === "/login" || pathname === "/register")) {
    // Send to the host's landing page, which routes each user on from there
    // (patients to their dashboard, staff to their clinic area, platform admins
    // to /platform). Avoids assuming everyone has a patient dashboard.
    const url = request.nextUrl.clone();
    url.pathname = "/";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|logo.png|.*\\.svg).*)"],
};
