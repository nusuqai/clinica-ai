/**
 * Registers every existing clinic's subdomain with the Vercel project.
 *
 * Run it once when switching to subdomain routing, and any time a clinic's
 * approval-time registration failed (that path is best-effort by design). It is
 * idempotent — already-registered domains report `already_exists`.
 *
 *   node --env-file=.env scripts/backfill-clinic-domains.mjs
 *   node --env-file=.env scripts/backfill-clinic-domains.mjs --dry-run
 *
 * Needs VERCEL_API_TOKEN, VERCEL_PROJECT_ID, NEXT_PUBLIC_ROOT_DOMAIN (and
 * VERCEL_TEAM_ID when the project belongs to a team).
 *
 * This deliberately re-implements the small Vercel call from
 * lib/vercel/domains.ts rather than importing it: that module is TypeScript and
 * marked `server-only`, so plain node can't load it.
 */

import { PrismaClient } from "@prisma/client";

const TOKEN = process.env.VERCEL_API_TOKEN;
const PROJECT_ID = process.env.VERCEL_PROJECT_ID;
const TEAM_ID = process.env.VERCEL_TEAM_ID;
const ROOT_DOMAIN = (process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "").split(":")[0];

const DRY_RUN = process.argv.includes("--dry-run");

// Mirrors the DNS-label rule enforced by slugify() in server/actions/clinics.ts.
const DNS_LABEL = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/;

function fail(message) {
  console.error(`✗ ${message}`);
  process.exit(1);
}

if (!ROOT_DOMAIN) fail("NEXT_PUBLIC_ROOT_DOMAIN is not set.");
if (ROOT_DOMAIN === "localhost") {
  fail("NEXT_PUBLIC_ROOT_DOMAIN is localhost — nothing to register in local dev.");
}
if (!DRY_RUN && (!TOKEN || !PROJECT_ID)) {
  fail("VERCEL_API_TOKEN and VERCEL_PROJECT_ID are required (or pass --dry-run).");
}

async function registerDomain(name) {
  const qs = TEAM_ID ? `?teamId=${encodeURIComponent(TEAM_ID)}` : "";
  const res = await fetch(`https://api.vercel.com/v10/projects/${PROJECT_ID}/domains${qs}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
    signal: AbortSignal.timeout(15_000),
  });

  let body = {};
  try {
    body = await res.json();
  } catch {
    /* empty body */
  }

  if (res.ok) return { ok: true, label: body.verified ? "registered" : "registered (unverified)" };
  if (res.status === 409 || body?.error?.code === "domain_already_in_use") {
    return { ok: true, label: "already registered" };
  }
  return { ok: false, label: body?.error?.message ?? `HTTP ${res.status}` };
}

const prisma = new PrismaClient();

try {
  const clinics = await prisma.clinic.findMany({
    where: { isActive: true },
    select: { slug: true, name: true },
    orderBy: { createdAt: "asc" },
  });

  console.log(
    `${clinics.length} active clinic(s) → *.${ROOT_DOMAIN}${DRY_RUN ? "  [dry run]" : ""}\n`
  );

  let done = 0;
  let skipped = 0;
  let failed = 0;

  for (const clinic of clinics) {
    const domain = `${clinic.slug}.${ROOT_DOMAIN}`;

    // A slug predating the DNS-safe slugify() (e.g. an Arabic one) cannot be a
    // hostname. Report it instead of sending a request Vercel will reject —
    // these need a manual slug rename before they can be served.
    if (!DNS_LABEL.test(clinic.slug)) {
      console.log(`  SKIP  ${clinic.slug} — not a valid DNS label (${clinic.name})`);
      skipped++;
      continue;
    }

    if (DRY_RUN) {
      console.log(`  WOULD ${domain}`);
      continue;
    }

    const result = await registerDomain(domain);
    console.log(`  ${result.ok ? "OK   " : "FAIL "} ${domain} — ${result.label}`);
    result.ok ? done++ : failed++;
  }

  if (!DRY_RUN) {
    console.log(`\n${done} ok, ${failed} failed, ${skipped} skipped (invalid slug)`);
  }
  if (skipped > 0) {
    console.log("Clinics with invalid slugs need a manual rename to become reachable.");
  }
  process.exitCode = failed > 0 ? 1 : 0;
} finally {
  await prisma.$disconnect();
}
