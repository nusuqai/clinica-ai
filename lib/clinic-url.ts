/**
 * Clinic URLs are host-based: every clinic lives on its own subdomain of
 * NEXT_PUBLIC_ROOT_DOMAIN — e.g. `demo.clinica-ai.nusuqai.com`, or
 * `demo.localhost:3000` in dev (browsers resolve *.localhost to 127.0.0.1 with
 * no hosts-file entry).
 *
 * The middleware rewrites that host onto the internal `/clinic/{slug}/…` route
 * tree, so INSIDE a clinic every link is root-relative ("/admin") and the slug
 * never appears in a path. Only cross-host links — the root domain sending a
 * user into their clinic, or one clinic linking to another — need an absolute
 * URL; build those here.
 *
 * No server-only imports: this is used by the edge middleware too.
 */

export const ROOT_DOMAIN = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "localhost:3000";

/** Local dev runs over http; everything else is https. */
function protocolFor(host: string): "http" | "https" {
  const name = host.split(":")[0];
  return name === "localhost" || name === "127.0.0.1" ? "http" : "https";
}

/** `https://{slug}.{ROOT_DOMAIN}` — no trailing slash. */
export function clinicOrigin(slug: string): string {
  return `${protocolFor(ROOT_DOMAIN)}://${slug}.${ROOT_DOMAIN}`;
}

/** Absolute URL to `path` inside a clinic, e.g. clinicUrl("demo", "/admin"). */
export function clinicUrl(slug: string, path = "/"): string {
  return `${clinicOrigin(slug)}${path === "/" ? "" : path}`;
}

/**
 * The clinic subdomain carried by a Host header, or null when the request is
 * for the root domain itself (marketing, /clinics, /platform), a Vercel preview
 * URL, or anything not under the root domain.
 */
export function tenantFromHost(host: string | null | undefined): string | null {
  if (!host) return null;
  const hostname = host.split(":")[0].toLowerCase();
  const root = ROOT_DOMAIN.split(":")[0].toLowerCase();

  // Preview/production *.vercel.app deployments carry no tenant.
  if (hostname.endsWith(".vercel.app")) return null;
  if (hostname === root) return null;
  if (!hostname.endsWith(`.${root}`)) return null;

  const sub = hostname.slice(0, -(root.length + 1));
  // `www` is the root site, and a dotted remainder is a deeper level we don't
  // serve (the wildcard cert covers one level only).
  if (!sub || sub === "www" || sub.includes(".")) return null;
  return sub;
}
