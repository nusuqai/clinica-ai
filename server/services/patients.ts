import "server-only";
import { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { createAdminClient } from "@/lib/supabase/admin";
import { findAuthUserIdByEmail } from "@/lib/supabase/auth-users";
import { normalizePhone } from "@/lib/phone";

// Anonymous WhatsApp patients. A Profile cannot exist without a Supabase auth
// user (profiles.id → auth.users.id), so we provision a REAL but incomplete auth
// user: a synthetic email + a random password nobody knows. It backs the Profile
// so the contact can book over WhatsApp, but it can't be logged into on the
// website until "claimed" (real email + a password the user sets — see the
// claim_web_login agent tool). Keyed by phone, which is globally unique on Profile.

/** Placeholder login email for a not-yet-claimed WhatsApp account. */
export function syntheticEmail(phone: string): string {
  return `wa-${phone}@wa.local`;
}

/** True for a login email that is still an unclaimed WhatsApp placeholder. */
export function isSyntheticEmail(email: string | null | undefined): boolean {
  return !!email && email.toLowerCase().endsWith("@wa.local");
}

// The auth DB trigger normally creates the Profile from user_metadata; this is
// the fallback for trigger lag (mirrors ensureProfile in server/actions/auth.ts).
async function ensureProfile(userId: string, fullName: string, phone: string) {
  let profile = await prisma.profile.findUnique({ where: { id: userId } });
  if (!profile) {
    await new Promise((r) => setTimeout(r, 500));
    profile = await prisma.profile.findUnique({ where: { id: userId } });
  }
  if (!profile) {
    await prisma.profile.create({ data: { id: userId, fullName, phone } });
  }
}

/**
 * Resolve the Profile for a WhatsApp number, creating an anonymous account if the
 * number is brand-new, and ensure a PATIENT membership in the clinic. Idempotent:
 * concurrent messages for one phone converge on a single Profile (the unique
 * synthetic email + unique Profile.phone serialize the create; we refetch on race).
 */
export async function getOrCreatePatientByPhone(args: {
  clinicId: string;
  phone: string;
  name: string;
}): Promise<{ profileId: string; created: boolean }> {
  const phone = normalizePhone(args.phone);
  const name = args.name?.trim() || "";

  const existing = await prisma.profile.findUnique({
    where: { phone },
    select: { id: true },
  });
  if (existing) {
    await prisma.clinicMember.upsert({
      where: { userId_clinicId: { userId: existing.id, clinicId: args.clinicId } },
      update: {},
      create: { userId: existing.id, clinicId: args.clinicId, role: Role.PATIENT },
    });
    return { profileId: existing.id, created: false };
  }

  const admin = createAdminClient();
  const email = syntheticEmail(phone);
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: globalThis.crypto.randomUUID(),
    email_confirm: true,
    user_metadata: { full_name: name, phone },
  });

  let userId = data?.user?.id;
  if (error || !userId) {
    // Most likely a concurrent create for the same phone — the auth user (or its
    // trigger-made Profile) already exists. Recover the id rather than fail.
    const again = await prisma.profile.findUnique({ where: { phone }, select: { id: true } });
    userId = again?.id ?? (await findAuthUserIdByEmail(email)) ?? undefined;
    if (!userId) throw new Error(error?.message ?? "تعذّر إنشاء حساب المريض");
  }

  await ensureProfile(userId, name, phone);
  await prisma.clinicMember.upsert({
    where: { userId_clinicId: { userId, clinicId: args.clinicId } },
    update: {},
    create: { userId, clinicId: args.clinicId, role: Role.PATIENT },
  });
  return { profileId: userId, created: true };
}
