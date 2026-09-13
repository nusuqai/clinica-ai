import "server-only";
import { cache } from "react";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { clinicUrl } from "@/lib/clinic-url";
import { getTenantSlug } from "@/lib/tenant";
import { Role } from "@prisma/client";

// Centralized auth/tenancy helpers. Identity lives on Profile; the per-clinic
// role lives on ClinicMember.
//
// The clinic is ALWAYS resolved from the request's host (see lib/tenant.ts) —
// never from a URL segment or a cookie — so pages, layouts and server actions
// all agree on which clinic they're in without passing a slug around.

export type CurrentUser = {
  id: string;
  email: string;
  profile: {
    id: string;
    fullName: string;
    phone: string | null;
    isPlatformAdmin: boolean;
  };
};

export type ClinicSummary = {
  id: string;
  slug: string;
  name: string;
  logoUrl: string | null;
  primaryColor: string | null;
  accentColor: string | null;
};

export type ClinicContext = {
  user: CurrentUser;
  clinic: ClinicSummary;
  role: Role;
};

const clinicSelect = {
  id: true,
  slug: true,
  name: true,
  logoUrl: true,
  primaryColor: true,
  accentColor: true,
} as const;

// ─── Identity ───────────────────────────────────────────────────────────────

// `cache` dedupes per request: a layout and its page both asking who the user is
// (or which clinic this is) costs one round trip, not two.
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const profile = await prisma.profile.findUnique({
    where: { id: user.id },
    select: { id: true, fullName: true, phone: true, isPlatformAdmin: true },
  });
  if (!profile) return null;

  return { id: user.id, email: user.email ?? "", profile };
});

export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

// ─── Clinic (tenant) access ───────────────────────────────────────────────────

/**
 * The active clinic for this request's host, or null on the root domain (and
 * for a subdomain with no matching active clinic). No auth involved — use it
 * for public surfaces like the clinic landing page and the auth screens.
 */
export const getHostClinic = cache(async (): Promise<ClinicSummary | null> => {
  const slug = await getTenantSlug();
  if (!slug) return null;
  return prisma.clinic.findFirst({
    where: { slug, isActive: true },
    select: clinicSelect,
  });
});

/**
 * Same, but a subdomain that names no active clinic is a 404 rather than a
 * silent fallback to the platform's own page. For public pages that render
 * differently per host — null still means "this is the root domain".
 */
export async function getHostClinicOrNotFound(): Promise<ClinicSummary | null> {
  const clinic = await getHostClinic();
  if (!clinic && (await getTenantSlug())) notFound();
  return clinic;
}

/**
 * The host's clinic plus the current user's role in it, or null when there's no
 * clinic host, no session, or no access. Non-redirecting — server actions use
 * this and return an error instead of navigating.
 */
export async function getClinicContext(): Promise<ClinicContext | null> {
  const [user, clinic] = await Promise.all([getCurrentUser(), getHostClinic()]);
  if (!user || !clinic) return null;

  const membership = await prisma.clinicMember.findUnique({
    where: { userId_clinicId: { userId: user.id, clinicId: clinic.id } },
    select: { role: true },
  });

  // Membership is the only way in — platform admins get no implicit access.
  if (!membership) return null;

  return { user, clinic, role: membership.role };
}

/**
 * Authorizes the current user for this host's clinic, redirecting rather than
 * returning null: to the clinic's login when there's no access, or to the
 * user's own role home when `roles` excludes them.
 */
export async function requireClinicMember(roles?: Role[]): Promise<ClinicContext> {
  const ctx = await getClinicContext();
  // Either not signed in, not a member, or this isn't a clinic host at all.
  // Rejecting to /login reveals nothing about which of those it was.
  if (!ctx) redirect("/login");
  if (roles && !roles.includes(ctx.role)) redirect(roleHome(ctx.role));
  return ctx;
}

export async function requirePlatformAdmin(): Promise<CurrentUser> {
  const user = await requireUser();
  if (!user.profile.isPlatformAdmin) redirect("/login");
  return user;
}

// ─── Redirect helpers ─────────────────────────────────────────────────────────

/**
 * A role's home, relative to the clinic's own host. Every clinic is served from
 * its own subdomain (see lib/clinic-url.ts), so no slug belongs in the path —
 * use clinicUrl(slug, roleHome(role)) when the redirect crosses hosts.
 */
export function roleHome(role: Role): string {
  if (role === Role.ADMIN) return "/admin";
  if (role === Role.DOCTOR) return "/doctor";
  return "/dashboard";
}

/** A user's first clinic membership, used to route them in from the root domain. */
export async function firstMembership(
  userId: string
): Promise<{ role: Role; slug: string } | null> {
  const membership = await prisma.clinicMember.findFirst({
    where: { userId, clinic: { isActive: true } },
    orderBy: { createdAt: "asc" },
    select: { role: true, clinic: { select: { slug: true } } },
  });
  return membership ? { role: membership.role, slug: membership.clinic.slug } : null;
}

/**
 * Where a signed-in user continues to from the ROOT domain: the platform
 * console for platform admins, otherwise their clinic's subdomain (multi-clinic
 * users get their first clinic for now — a picker can come later). Absolute,
 * because it crosses hosts.
 */
export async function continueHrefFor(user: CurrentUser): Promise<string> {
  if (user.profile.isPlatformAdmin) return "/platform";
  const membership = await firstMembership(user.id);
  return membership ? clinicUrl(membership.slug, roleHome(membership.role)) : "/login";
}

/**
 * Sends a user from the root domain into their clinic. Called right after a
 * platform-side login, so it has to cross hosts — hence an absolute URL.
 */
export async function redirectToUserClinic(
  userId: string,
  isPlatformAdmin: boolean
): Promise<never> {
  if (isPlatformAdmin) redirect("/platform");

  const membership = await firstMembership(userId);
  if (!membership) redirect("/login");
  redirect(clinicUrl(membership.slug, roleHome(membership.role)));
}
