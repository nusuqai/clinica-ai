import "server-only";
import { ROOT_DOMAIN } from "@/lib/clinic-url";

/**
 * Registers clinic subdomains with the Vercel project.
 *
 * WHY THIS EXISTS: a wildcard domain (`*.clinica-ai.nusuqai.com`) needs a
 * wildcard certificate, which Vercel only offers on Pro and above. On Hobby the
 * DNS wildcard at Namecheap is enough to make every subdomain RESOLVE, but
 * Vercel will not serve a host it doesn't know — and, more importantly, will not
 * issue a certificate for it, so the TLS handshake fails before any code runs.
 * Registering each subdomain through this API is what triggers that certificate.
 *
 * Because DNS already resolves via the wildcard, registration is normally
 * verified instantly — there's no propagation wait per clinic.
 *
 * Upgrading to Pro makes this redundant (add the wildcard domain once instead),
 * but the same module is what per-clinic CUSTOM domains will need later, so it
 * is worth keeping either way.
 */

const API_BASE = "https://api.vercel.com";

const TOKEN = process.env.VERCEL_API_TOKEN;
const PROJECT_ID = process.env.VERCEL_PROJECT_ID;
const TEAM_ID = process.env.VERCEL_TEAM_ID;

export type DomainOutcome =
  /** Newly attached to the project. `verified` false means DNS isn't resolving yet. */
  | { ok: true; status: "registered"; domain: string; verified: boolean }
  /** Already attached — re-approving or re-running the backfill is harmless. */
  | { ok: true; status: "already_exists"; domain: string }
  /** No Vercel credentials (local dev): nothing to do, and not an error. */
  | { ok: true; status: "skipped"; domain: string }
  | { ok: false; domain: string; error: string; code?: string };

/** True when the Vercel API is configured. False in local dev, where subdomains
 *  need no registration (nothing issues certificates for *.localhost). */
export function isVercelDomainsConfigured(): boolean {
  return Boolean(TOKEN && PROJECT_ID);
}

/** The public host for a clinic, with any dev port stripped. */
export function clinicDomainName(slug: string): string {
  return `${slug}.${ROOT_DOMAIN.split(":")[0]}`;
}

function url(path: string): string {
  const qs = TEAM_ID ? `?teamId=${encodeURIComponent(TEAM_ID)}` : "";
  return `${API_BASE}${path}${qs}`;
}

async function call(
  path: string,
  init: RequestInit
): Promise<{ status: number; body: Record<string, unknown> }> {
  const res = await fetch(url(path), {
    ...init,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
    // Never let a slow Vercel API hold up clinic creation.
    signal: AbortSignal.timeout(15_000),
  });
  let body: Record<string, unknown> = {};
  try {
    body = (await res.json()) as Record<string, unknown>;
  } catch {
    // Some responses (e.g. DELETE) have no JSON body.
  }
  return { status: res.status, body };
}

function errorOf(body: Record<string, unknown>): { message: string; code?: string } {
  const err = body.error as { message?: string; code?: string } | undefined;
  return { message: err?.message ?? "Vercel API error", code: err?.code };
}

/**
 * Attaches `{slug}.{ROOT_DOMAIN}` to the Vercel project so it gets served and
 * certificated. Idempotent: an already-registered domain reports success, which
 * is what makes re-approval and the backfill script safe to re-run.
 */
export async function registerClinicDomain(slug: string): Promise<DomainOutcome> {
  const domain = clinicDomainName(slug);
  if (!isVercelDomainsConfigured()) return { ok: true, status: "skipped", domain };

  try {
    const { status, body } = await call(`/v10/projects/${PROJECT_ID}/domains`, {
      method: "POST",
      body: JSON.stringify({ name: domain }),
    });

    if (status >= 200 && status < 300) {
      return { ok: true, status: "registered", domain, verified: body.verified === true };
    }

    const { message, code } = errorOf(body);
    // Already attached to this project — treat as success so retries are safe.
    if (status === 409 || code === "domain_already_in_use") {
      return { ok: true, status: "already_exists", domain };
    }
    return { ok: false, domain, error: message, code };
  } catch (e) {
    return {
      ok: false,
      domain,
      error: e instanceof Error ? e.message : "Vercel API request failed",
    };
  }
}

/** Detaches a clinic's subdomain — frees a slot against the per-project domain
 *  limit when a clinic is deleted. */
export async function removeClinicDomain(slug: string): Promise<DomainOutcome> {
  const domain = clinicDomainName(slug);
  if (!isVercelDomainsConfigured()) return { ok: true, status: "skipped", domain };

  try {
    const { status, body } = await call(
      `/v9/projects/${PROJECT_ID}/domains/${encodeURIComponent(domain)}`,
      { method: "DELETE" }
    );
    // 404 means it was never attached — the desired end state either way.
    if ((status >= 200 && status < 300) || status === 404) {
      return { ok: true, status: "registered", domain, verified: false };
    }
    const { message, code } = errorOf(body);
    return { ok: false, domain, error: message, code };
  } catch (e) {
    return {
      ok: false,
      domain,
      error: e instanceof Error ? e.message : "Vercel API request failed",
    };
  }
}
