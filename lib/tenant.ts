import "server-only";
import { headers } from "next/headers";
import { TENANT_HEADER, tenantFromHost } from "@/lib/clinic-url";

/**
 * The clinic subdomain this request is for, or null on the root (platform)
 * domain. Works the same in pages, layouts, route handlers and server actions —
 * a server action POSTs to the page's own URL, so it carries the clinic host
 * too.
 *
 * Prefers the header the middleware stamped; falls back to deriving it from the
 * Host, which keeps things working if a request somehow bypasses the middleware
 * matcher. `x-forwarded-host` comes first: when a server action redirects, Next
 * re-fetches the target internally and `host` becomes the server's own origin,
 * while the public host survives on `x-forwarded-host`.
 */
export async function getTenantSlug(): Promise<string | null> {
  const h = await headers();
  const stamped = h.get(TENANT_HEADER);
  if (stamped) return stamped;
  return tenantFromHost(h.get("x-forwarded-host") ?? h.get("host"));
}
