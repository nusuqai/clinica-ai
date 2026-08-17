"use server";

import { revalidatePath } from "next/cache";
import { ClinicRequestStatus, Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { ensureClinicAiCredit } from "@/server/services/aiCredit";
import {
  sendClinicApprovedInvite,
  sendClinicCreatedInvite,
} from "@/lib/email/send-auth-email";
import {
  sendRequestReceived,
  sendClinicRejected,
} from "@/lib/email/send-transactional";

// ─── Guard ────────────────────────────────────────────────────────────────────

async function requirePlatform() {
  const u = await getCurrentUser();
  if (!u || !u.profile.isPlatformAdmin) throw new Error("غير مصرح");
  return u;
}

function slugify(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

async function uniqueSlug(base: string): Promise<string> {
  const root = slugify(base) || "clinic";
  let slug = root;
  let n = 1;
  while (await prisma.clinic.findUnique({ where: { slug }, select: { id: true } })) {
    slug = `${root}-${++n}`;
  }
  return slug;
}

// ─── Public: request a new clinic ─────────────────────────────────────────────

export async function submitClinicRequest(formData: FormData) {
  const requesterName = (formData.get("requesterName") as string)?.trim();
  const requesterEmail = (formData.get("requesterEmail") as string)?.trim();
  const requestedClinicName = (formData.get("requestedClinicName") as string)?.trim();

  if (!requesterName || !requesterEmail || !requestedClinicName) {
    return { error: "الرجاء تعبئة الاسم والبريد واسم العيادة." };
  }

  await prisma.clinicRequest.create({
    data: {
      requesterName,
      requesterEmail,
      requesterPhone: (formData.get("requesterPhone") as string)?.trim() || null,
      requestedClinicName,
      requestedSlug: (formData.get("requestedSlug") as string)?.trim() || null,
      note: (formData.get("note") as string)?.trim() || null,
    },
  });

  // Best-effort acknowledgement — never block the request on email delivery.
  await sendRequestReceived({
    email: requesterEmail,
    requesterName,
    clinicName: requestedClinicName,
  }).catch(() => {});

  return { success: true };
}

// ─── Platform admin: manage requests ──────────────────────────────────────────

async function getOrCreateAuthUser(
  admin: ReturnType<typeof createAdminClient>,
  email: string,
  fullName: string,
  phone: string | null,
): Promise<string> {
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: globalThis.crypto.randomUUID(),
    email_confirm: true,
    user_metadata: { full_name: fullName, phone },
  });
  if (!error && data.user) return data.user.id;

  // Email already registered — reuse that account.
  const { data: list } = await admin.auth.admin.listUsers({ perPage: 1000 });
  const found = list?.users.find(
    (u) => u.email?.toLowerCase() === email.toLowerCase(),
  );
  if (found) return found.id;

  throw new Error(error?.message ?? "تعذّر إنشاء حساب المستخدم");
}

export async function approveClinicRequest(requestId: string) {
  const reviewer = await requirePlatform();

  const request = await prisma.clinicRequest.findUnique({
    where: { id: requestId },
  });
  if (!request) return { error: "الطلب غير موجود" };
  if (request.status !== ClinicRequestStatus.PENDING) return { error: "تمت معالجة هذا الطلب بالفعل" };

  const admin = createAdminClient();
  try {
    const slug = await uniqueSlug(request.requestedSlug ?? request.requestedClinicName);

    const userId = await getOrCreateAuthUser(
      admin,
      request.requesterEmail,
      request.requesterName,
      request.requesterPhone,
    );

    // Ensure the identity profile exists (created by the auth trigger).
    let profile = await prisma.profile.findUnique({ where: { id: userId } });
    if (!profile) {
      await new Promise((r) => setTimeout(r, 500));
      profile = await prisma.profile.findUnique({ where: { id: userId } });
    }
    if (!profile) {
      await prisma.profile.create({
        data: {
          id: userId,
          fullName: request.requesterName,
          phone: request.requesterPhone,
        },
      });
    }

    const clinic = await prisma.$transaction(async (tx) => {
      const c = await tx.clinic.create({
        data: { name: request.requestedClinicName, slug },
      });
      // Every clinic must have at least one branch.
      await tx.branch.create({
        data: { clinicId: c.id, name: "الفرع الرئيسي", isMain: true },
      });
      await tx.clinicMember.upsert({
        where: { userId_clinicId: { userId, clinicId: c.id } },
        update: { role: Role.ADMIN },
        create: { userId, clinicId: c.id, role: Role.ADMIN },
      });
      await tx.clinicRequest.update({
        where: { id: requestId },
        data: {
          status: ClinicRequestStatus.APPROVED,
          reviewedById: reviewer.id,
          reviewedAt: new Date(),
          createdClinicId: c.id,
        },
      });
      return c;
    });

    await ensureClinicAiCredit(clinic.id);

    // Invite the new clinic admin to set their password. Best-effort: approval
    // already succeeded, so a mail failure must not roll it back — surface it as
    // a soft warning the UI can show while still reporting success.
    const invite = await sendClinicApprovedInvite({
      email: request.requesterEmail,
      name: request.requesterName,
      clinicName: clinic.name,
    }).catch((e) => ({ ok: false as const, error: e instanceof Error ? e.message : "email failed" }));

    revalidatePath("/platform/requests");
    revalidatePath("/platform/clinics");
    return {
      success: true,
      clinicId: clinic.id,
      slug: clinic.slug,
      emailSent: invite.ok,
    };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "فشل الموافقة على الطلب" };
  }
}

export async function rejectClinicRequest(requestId: string) {
  const reviewer = await requirePlatform();
  const request = await prisma.clinicRequest.update({
    where: { id: requestId },
    data: { status: ClinicRequestStatus.REJECTED, reviewedById: reviewer.id, reviewedAt: new Date() },
  });

  await sendClinicRejected({
    email: request.requesterEmail,
    requesterName: request.requesterName,
    clinicName: request.requestedClinicName,
  }).catch(() => {});

  revalidatePath("/platform/requests");
  return { success: true };
}

// ─── Platform admin: manage clinics directly ──────────────────────────────────

export async function createClinic(formData: FormData) {
  await requirePlatform();
  const name = (formData.get("name") as string)?.trim();
  if (!name) return { error: "اسم العيادة مطلوب" };

  const adminName = (formData.get("adminName") as string)?.trim();
  const adminEmail = (formData.get("adminEmail") as string)?.trim();
  const adminPhone = (formData.get("adminPhone") as string)?.trim() || null;
  if (!adminName || !adminEmail) {
    return { error: "اسم وبريد مدير العيادة مطلوبان" };
  }

  const admin = createAdminClient();
  try {
    const slug = await uniqueSlug(
      (formData.get("slug") as string)?.trim() || name,
    );

    // Create (or reuse) the auth account that will manage this clinic, then set
    // it up as the clinic's ADMIN — same path as approving a clinic request.
    const userId = await getOrCreateAuthUser(
      admin,
      adminEmail,
      adminName,
      adminPhone,
    );

    let profile = await prisma.profile.findUnique({ where: { id: userId } });
    if (!profile) {
      await new Promise((r) => setTimeout(r, 500));
      profile = await prisma.profile.findUnique({ where: { id: userId } });
    }
    if (!profile) {
      await prisma.profile.create({
        data: { id: userId, fullName: adminName, phone: adminPhone },
      });
    }

    const clinic = await prisma.$transaction(async (tx) => {
      const c = await tx.clinic.create({
        data: {
          name,
          slug,
          logoUrl: (formData.get("logoUrl") as string)?.trim() || null,
          primaryColor: (formData.get("primaryColor") as string)?.trim() || null,
          accentColor: (formData.get("accentColor") as string)?.trim() || null,
        },
      });
      // Every clinic must have at least one branch.
      await tx.branch.create({
        data: { clinicId: c.id, name: "الفرع الرئيسي", isMain: true },
      });
      await tx.clinicMember.upsert({
        where: { userId_clinicId: { userId, clinicId: c.id } },
        update: { role: Role.ADMIN },
        create: { userId, clinicId: c.id, role: Role.ADMIN },
      });
      return c;
    });

    await ensureClinicAiCredit(clinic.id);

    // Invite the clinic admin to set their password (best-effort).
    const invite = await sendClinicCreatedInvite({
      email: adminEmail,
      name: adminName,
      clinicName: clinic.name,
    }).catch((e) => ({ ok: false as const, error: e instanceof Error ? e.message : "email failed" }));

    revalidatePath("/platform/clinics");
    return { success: true, clinicId: clinic.id, slug: clinic.slug, emailSent: invite.ok };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "فشل إنشاء العيادة" };
  }
}

export async function updateClinic(clinicId: string, formData: FormData) {
  await requirePlatform();
  try {
    await prisma.clinic.update({
      where: { id: clinicId },
      data: {
        ...(formData.has("name") && {
          name: (formData.get("name") as string).trim(),
        }),
        ...(formData.has("logoUrl") && {
          logoUrl: (formData.get("logoUrl") as string).trim() || null,
        }),
        ...(formData.has("primaryColor") && {
          primaryColor: (formData.get("primaryColor") as string).trim() || null,
        }),
        ...(formData.has("accentColor") && {
          accentColor: (formData.get("accentColor") as string).trim() || null,
        }),
        ...(formData.has("isActive") && {
          isActive: formData.get("isActive") === "true",
        }),
      },
    });
    revalidatePath("/platform/clinics");
    return { success: true as const };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "فشل تحديث العيادة" };
  }
}
