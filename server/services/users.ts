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
 * Lists all profiles merged with email from auth.users via the service-role client.
 * AI agent tools can call this directly.
 */
export async function listUsers(): Promise<AdminUser[]> {
  const [profiles, { data: authList }] = await Promise.all([
    prisma.profile.findMany({
      select: { id: true, fullName: true, phone: true, role: true, createdAt: true },
      orderBy: { createdAt: "desc" },
    }),
    createAdminClient().auth.admin.listUsers({ perPage: 1000 }),
  ]);

  const emailMap = new Map<string, string>(
    (authList?.users ?? []).map((u) => [u.id, u.email ?? ""])
  );

  return profiles.map((p) => ({
    ...p,
    email: emailMap.get(p.id) ?? "",
  }));
}

// ─── Mutations ────────────────────────────────────────────────────────────────

export async function updateUserRole(
  userId: string,
  role: Role
): Promise<Result<void>> {
  try {
    await prisma.profile.update({ where: { id: userId }, data: { role } });
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
