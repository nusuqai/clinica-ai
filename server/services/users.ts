import "server-only";
import { Prisma, type Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { createAdminClient } from "@/lib/supabase/admin";
import { findAuthUserIdByEmail } from "@/lib/supabase/auth-users";
import { isSyntheticEmail } from "@/server/services/patients";
import { sendEmailChange } from "@/lib/email/send-auth-email";
import { normalizePhone, isValidPhone } from "@/lib/phone";
import { ok, err, type Result } from "./_result";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AdminUser {
  id: string;
  fullName: string;
  email: string;
  phone: string | null;
  role: Role;
  createdAt: Date;
}

export interface ClinicUserDetail {
  id: string;
  fullName: string;
  email: string;
  phone: string | null;
  role: Role;
  createdAt: Date;
  appointmentCount: number;
  /** False while the login email is still a WhatsApp placeholder (@wa.local). */
  claimed: boolean;
}

// ─── Queries ──────────────────────────────────────────────────────────────────

/**
 * Lists the members of a clinic with their per-clinic role, merged with email
 * from auth.users via the service-role client.
 */
export async function listUsers(clinicId: string): Promise<AdminUser[]> {
  const [members, { data: authList }] = await Promise.all([
    prisma.clinicMember.findMany({
      where: { clinicId },
      select: {
        role: true,
        createdAt: true,
        user: { select: { id: true, fullName: true, phone: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
    createAdminClient().auth.admin.listUsers({ perPage: 1000 }),
  ]);

  const emailMap = new Map<string, string>(
    (authList?.users ?? []).map((u) => [u.id, u.email ?? ""]),
  );

  return members.map((m) => ({
    id: m.user.id,
    fullName: m.user.fullName,
    phone: m.user.phone,
    role: m.role,
    createdAt: m.createdAt,
    email: emailMap.get(m.user.id) ?? "",
  }));
}

/**
 * One clinic member's full detail for the admin user page. Returns null if the
 * user isn't a member of this clinic (keeps the page tenant-scoped). Email comes
 * from a single targeted `getUserById`, not a listUsers scan.
 */
export async function getClinicUser(
  userId: string,
  clinicId: string,
): Promise<ClinicUserDetail | null> {
  const member = await prisma.clinicMember.findUnique({
    where: { userId_clinicId: { userId, clinicId } },
    select: {
      role: true,
      createdAt: true,
      user: { select: { id: true, fullName: true, phone: true } },
    },
  });
  if (!member) return null;

  const [{ data: authUser }, appointmentCount] = await Promise.all([
    createAdminClient().auth.admin.getUserById(userId),
    prisma.appointment.count({ where: { patientId: userId, clinicId } }),
  ]);
  const email = authUser?.user?.email ?? "";

  return {
    id: member.user.id,
    fullName: member.user.fullName,
    phone: member.user.phone,
    role: member.role,
    createdAt: member.createdAt,
    email,
    appointmentCount,
    claimed: !isSyntheticEmail(email),
  };
}

// ─── Mutations ────────────────────────────────────────────────────────────────

/** Edit a member's Profile (name/phone). Scoped: the user must be a member here. */
export async function updatePatientProfile(
  userId: string,
  clinicId: string,
  input: { fullName?: string; phone?: string | null },
): Promise<Result<void>> {
  const member = await prisma.clinicMember.findUnique({
    where: { userId_clinicId: { userId, clinicId } },
    select: { userId: true },
  });
  if (!member) return err("المستخدم ليس عضواً في هذه العيادة");

  const data: { fullName?: string; phone?: string | null } = {};
  if (input.fullName !== undefined) {
    const name = input.fullName.trim();
    if (!name) return err("الاسم مطلوب");
    data.fullName = name;
  }
  if (input.phone !== undefined) {
    if (input.phone === null || input.phone === "") {
      data.phone = null;
    } else {
      const phone = normalizePhone(input.phone);
      if (!isValidPhone(phone)) return err("رقم الهاتف غير صالح");
      data.phone = phone;
    }
  }

  try {
    await prisma.profile.update({ where: { id: userId }, data });
    return ok(undefined);
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return err("رقم الهاتف مستخدم من قبل مريض آخر");
    }
    return err(e instanceof Error ? e.message : "فشل تحديث بيانات المستخدم");
  }
}

/**
 * Change a member's login email — sends a VERIFICATION link to the new address;
 * the change only applies once they click it (via /auth/confirm, email_change).
 */
export async function changePatientEmail(
  userId: string,
  clinicId: string,
  newEmailRaw: string,
): Promise<Result<void>> {
  const member = await prisma.clinicMember.findUnique({
    where: { userId_clinicId: { userId, clinicId } },
    select: { user: { select: { fullName: true } } },
  });
  if (!member) return err("المستخدم ليس عضواً في هذه العيادة");

  const newEmail = newEmailRaw.trim().toLowerCase();
  if (!newEmail) return err("البريد الإلكتروني مطلوب");

  const admin = createAdminClient();
  const { data: authUser } = await admin.auth.admin.getUserById(userId);
  const currentEmail = authUser?.user?.email ?? "";
  if (currentEmail.toLowerCase() === newEmail) {
    return err("هذا هو البريد الحالي بالفعل");
  }

  const clash = await findAuthUserIdByEmail(newEmail);
  if (clash && clash !== userId) {
    return err("هذا البريد مستخدم بحساب آخر");
  }

  try {
    await sendEmailChange({
      currentEmail,
      newEmail,
      name: member.user.fullName,
    });
    return ok(undefined);
  } catch (e) {
    return err(e instanceof Error ? e.message : "تعذّر إرسال رابط التأكيد");
  }
}

export async function updateUserRole(
  userId: string,
  clinicId: string,
  role: Role,
): Promise<Result<void>> {
  try {
    await prisma.clinicMember.upsert({
      where: { userId_clinicId: { userId, clinicId } },
      update: { role },
      create: { userId, clinicId, role },
    });
    return ok(undefined);
  } catch (e) {
    return err(e instanceof Error ? e.message : "فشل تحديث دور المستخدم");
  }
}

export async function deleteUser(userId: string): Promise<Result<void>> {
  try {
    const admin = createAdminClient();
    const { error } = await admin.auth.admin.deleteUser(userId);
    if (error) return err(error.message);
    return ok(undefined);
  } catch (e) {
    return err(e instanceof Error ? e.message : "فشل حذف المستخدم");
  }
}
