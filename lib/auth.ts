import "server-only";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { Role } from "@prisma/client";

// Cookie the middleware sets from the /clinic/{slug} URL, so server actions
// (which don't see the URL) can scope to the clinic the user is viewing.
export const ACTIVE_CLINIC_COOKIE = "active-clinic";

// Centralized auth/tenancy helpers. Replaces the ad-hoc `getUser()` + Prisma
// role lookup that used to be duplicated across every layout / action / route.
// The per-clinic role now lives on ClinicMember; identity lives on Profile.

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
  // True when access is granted because the user is a platform admin rather than
  // an actual member of this clinic.
  viaPlatformAdmin: boolean;
};

// ─── Identity ───────────────────────────────────────────────────────────────

export async function getCurrentUser(): Promise<CurrentUser | null> {
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
}

export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

// ─── Clinic (tenant) access ───────────────────────────────────────────────────

/**
 * Resolves the clinic from the URL slug and authorizes the current user for it.
 * A user must be a member of THIS clinic (non-members are rejected — no
 * cross-clinic access). Platform admins may access any clinic to "see everything".
 * If `roles` is given, the member's role must be one of them.
 */
export async function requireClinicMember(
  slug: string,
  roles?: Role[]
): Promise<ClinicContext> {
  const user = await requireUser();

  const clinic = await prisma.clinic.findUnique({
    where: { slug },
    select: {
      id: true,
      slug: true,
      name: true,
      logoUrl: true,
      primaryColor: true,
      accentColor: true,
      isActive: true,
    },
  });
  if (!clinic || !clinic.isActive) redirect("/login");

  const membership = await prisma.clinicMember.findUnique({
    where: { userId_clinicId: { userId: user.id, clinicId: clinic.id } },
    select: { role: true },
  });

  const viaPlatformAdmin = !membership && user.profile.isPlatformAdmin;
  if (!membership && !viaPlatformAdmin) {
    // Not a member of this clinic: reject without revealing anything.
    redirect("/login");
  }

  // Platform admins act with ADMIN privileges inside any clinic.
  const role: Role = membership?.role ?? Role.ADMIN;

  if (roles && !roles.includes(role)) {
    redirect(roleHome(clinic.slug, role));
  }

  const { isActive: _isActive, ...clinicSummary } = clinic;
  return { user, clinic: clinicSummary, role, viaPlatformAdmin };
}

export async function requirePlatformAdmin(): Promise<CurrentUser> {
  const user = await requireUser();
  if (!user.profile.isPlatformAdmin) redirect("/login");
  return user;
}

// ─── Active-clinic bridge (for routes that are not yet under /clinic/[slug]) ──
// The existing /admin, /doctor, /dashboard routes have no slug in the URL, so
// they resolve the user's clinic from their (single) membership. Once those
// routes move under /clinic/[slug], switch them to requireClinicMember(slug).

const clinicSelect = {
  id: true,
  slug: true,
  name: true,
  logoUrl: true,
  primaryColor: true,
  accentColor: true,
} as const;

export async function getActiveClinicContext(): Promise<ClinicContext | null> {
  const user = await getCurrentUser();
  if (!user) return null;

  // Prefer the clinic in the URL (via the middleware cookie); fall back to the
  // user's first membership so callers without an active clinic still resolve.
  const cookieStore = await cookies();
  const slug = cookieStore.get(ACTIVE_CLINIC_COOKIE)?.value;

  let membership = slug
    ? await prisma.clinicMember.findFirst({
        where: { userId: user.id, clinic: { isActive: true, slug } },
        select: { role: true, clinic: { select: clinicSelect } },
      })
    : null;

  if (!membership) {
    membership = await prisma.clinicMember.findFirst({
      where: { userId: user.id, clinic: { isActive: true } },
      orderBy: { createdAt: "asc" },
      select: { role: true, clinic: { select: clinicSelect } },
    });
  }
  if (!membership) return null;

  return {
    user,
    clinic: membership.clinic,
    role: membership.role,
    viaPlatformAdmin: false,
  };
}

export async function requireActiveMember(roles?: Role[]): Promise<ClinicContext> {
  const ctx = await getActiveClinicContext();
  if (!ctx) redirect("/login");
  if (roles && !roles.includes(ctx.role)) redirect(roleHome(ctx.clinic.slug, ctx.role));
  return ctx;
}

// ─── Redirect helpers ─────────────────────────────────────────────────────────

export function roleHome(slug: string, role: Role): string {
  if (role === Role.ADMIN) return `/clinic/${slug}/admin`;
  if (role === Role.DOCTOR) return `/clinic/${slug}/doctor`;
  return `/clinic/${slug}/dashboard`;
}

/**
 * Where to send a user right after login. Platform admins go to the platform
 * console; otherwise the user lands in their clinic. Multi-clinic users go to
 * their first clinic for now (a picker can come later).
 */
export async function redirectToUserClinic(
  userId: string,
  isPlatformAdmin: boolean
): Promise<never> {
  if (isPlatformAdmin) redirect("/platform");

  const membership = await prisma.clinicMember.findFirst({
    where: { userId, clinic: { isActive: true } },
    orderBy: { createdAt: "asc" },
    select: { role: true, clinic: { select: { slug: true } } },
  });

  if (!membership) redirect("/login");
  redirect(roleHome(membership.clinic.slug, membership.role));
}
