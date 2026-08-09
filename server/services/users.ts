import "server-only";
import { prisma } from "@/lib/prisma";
import { createAdminClient } from "@/lib/supabase/admin";
import { ok, err, type Result } from "./_result";
import type { Role } from "@prisma/client";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AdminUser {
  id: string;
  fullName: string;
  email: string;
  phone: string | null;
  role: Role;
  createdAt: Date;
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

// ─── Mutations ────────────────────────────────────────────────────────────────

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
