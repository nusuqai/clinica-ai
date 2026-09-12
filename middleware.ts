import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { clinicOrigin, tenantFromHost } from "@/lib/clinic-url";

// Public routes on the ROOT domain: marketing, the clinic directory, and the
// platform-admin sign-in.
const PUBLIC_ROUTES = [
  "/",
  "/clinics",
  "/login",
  "/register",
  "/forgot-password",
  "/verify-otp",
  "/reset-password",
];

// A clinic's public surface, as seen on its own subdomain: the landing page and
// its own login/register. Everything deeper (/admin, /doctor, /dashboard…)
// stays authenticated.
const PUBLIC_TENANT_ROUTES = ["/", "/login", "/register", "/verify-otp"];

// Routes that accept unauthenticated guest requests (no Supabase session at
// all) — the route handler itself scopes what a guest can do.
const PUBLIC_API_ROUTES = ["/api/meta/whatsapp/webhook", "/api/agent/chat"];

// Host-agnostic paths, never rewritten onto a clinic: API handlers scope
// themselves (the WhatsApp webhook identifies its clinic by token), and emailed
// auth links must resolve on whichever host they were built for.
const HOST_AGNOSTIC_PREFIXES = ["/api/", "/auth/"];

// Cookie recording the active clinic so server actions — which never see the
// URL — can scope to it. Mirrors ACTIVE_CLINIC_COOKIE in lib/auth.ts; kept as a
// literal here because middleware runs on the edge and must not pull in Prisma.
const ACTIVE_CLINIC_COOKIE = "active-clinic";

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  // `x-forwarded-host` before `host`: when a server action calls redirect() to an
  // app-relative path, Next re-fetches that path internally to stream it back with
  // the action response, and that fetch goes to the server's own origin — so `host`
  // arrives as the internal origin and the clinic subdomain is gone. The original
  // public host survives on `x-forwarded-host`. Without this, the first render after
  // login is never rewritten onto /clinic/{slug}/… and 404s until the user refreshes.
  const tenant = tenantFromHost(
    request.headers.get("x-forwarded-host") ?? request.headers.get("host")
  );

  // Legacy path-based URLs (/clinic/{slug}/…) move to the clinic's subdomain.
  // Done before any auth work so an unauthenticated visitor lands on the right
  // host first and is then gated there. Temporary (307) rather than permanent
  // while the migration settles — browsers cache a 308 aggressively.
  if (!tenant) {
    const legacy = pathname.match(/^\/clinic\/([^/]+)(\/.*)?$/);
    if (legacy) {
      const [, slug, rest = ""] = legacy;
      const target = new URL(`${clinicOrigin(slug)}${rest}`);
      target.search = request.nextUrl.search;
      return NextResponse.redirect(target, 307);
    }
  }

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return NextResponse.next({ request });
  }

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
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({ request });
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
    (tenant ? PUBLIC_TENANT_ROUTES.includes(pathname) : PUBLIC_ROUTES.includes(pathname));
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
    return NextResponse.redirect(url);
  }

  const isHostAgnostic = HOST_AGNOSTIC_PREFIXES.some((p) => pathname.startsWith(p));
  if (!tenant || isHostAgnostic) {
    return supabaseResponse;
  }

  // The clinic host serves the existing /clinic/[slug]/… route tree: rewriting
  // (not redirecting) keeps the subdomain in the URL bar while every page, its
  // `slug` param, and every revalidatePath("/clinic/[slug]/…") keep working.
  const rewriteUrl = request.nextUrl.clone();
  rewriteUrl.pathname = `/clinic/${tenant}${pathname === "/" ? "" : pathname}`;
  // Set the clinic on the REQUEST as well as the response. Server components in
  // this very request (requireActiveMember → getActiveClinicContext) read it
  // from the incoming cookies, so a response-only cookie would leave the first
  // request on a clinic host resolving to the user's first membership instead of
  // the one they actually asked for.
  request.cookies.set(ACTIVE_CLINIC_COOKIE, tenant);

  const response = NextResponse.rewrite(rewriteUrl, { request });

  // Carry over any auth cookies Supabase refreshed while handling this request —
  // they live on `supabaseResponse`, which we're replacing.
  supabaseResponse.cookies.getAll().forEach((cookie) => response.cookies.set(cookie));
  response.cookies.set(ACTIVE_CLINIC_COOKIE, tenant, {
    path: "/",
    sameSite: "lax",
  });

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|logo.png|.*\\.svg).*)"],
};
