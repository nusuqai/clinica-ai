"use server";

import { revalidatePath } from "next/cache";
import { ClinicRequestStatus, Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { ensureClinicAiCredit } from "@/server/services/aiCredit";

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
    revalidatePath("/platform/requests");
    revalidatePath("/platform/clinics");
    return { success: true, clinicId: clinic.id, slug: clinic.slug };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "فشل الموافقة على الطلب" };
  }
}

export async function rejectClinicRequest(requestId: string) {
  const reviewer = await requirePlatform();
  await prisma.clinicRequest.update({
    where: { id: requestId },
    data: { status: ClinicRequestStatus.REJECTED, reviewedById: reviewer.id, reviewedAt: new Date() },
  });
  revalidatePath("/platform/requests");
  return { success: true };
}

// ─── Platform admin: manage clinics directly ──────────────────────────────────

export async function createClinic(formData: FormData) {
  await requirePlatform();
  const name = (formData.get("name") as string)?.trim();
  if (!name) return { error: "اسم العيادة مطلوب" };

  const slug = await uniqueSlug((formData.get("slug") as string)?.trim() || name);
  const clinic = await prisma.clinic.create({
    data: {
      name,
      slug,
      logoUrl: (formData.get("logoUrl") as string)?.trim() || null,
      primaryColor: (formData.get("primaryColor") as string)?.trim() || null,
      accentColor: (formData.get("accentColor") as string)?.trim() || null,
    },
  });
  await ensureClinicAiCredit(clinic.id);
  revalidatePath("/platform/clinics");
  return { success: true, clinicId: clinic.id, slug: clinic.slug };
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
