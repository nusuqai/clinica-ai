"use server";

import { revalidatePath } from "next/cache";
import { Role } from "@prisma/client";
import { getClinicContext, type ClinicContext } from "@/lib/auth";
import * as TeamService from "@/server/services/team";
import type { TeamAssignment } from "@/server/services/team";

// Team & role management. ADMIN-only by design — there is no permission key for
// it (see lib/permissions.ts), so staff can never grant themselves access.

const TEAM_PATH = "/admin/team";

type ActionResult = { ok: true; notice?: string } | { ok: false; error: string };

async function requireClinicAdmin(): Promise<ClinicContext | null> {
  const ctx = await getClinicContext();
  return ctx && ctx.role === Role.ADMIN ? ctx : null;
}

const FORBIDDEN: ActionResult = { ok: false, error: "غير مصرح" };

/** "admin" → another clinic admin; anything else is a custom role id. */
function parseAssignment(value: string): TeamAssignment {
  return value === "admin" ? { kind: "admin" } : { kind: "role", roleId: value };
}

// ─── Roles ────────────────────────────────────────────────────────────────────

export interface RoleFormInput {
  name: string;
  description: string;
  permissions: string[];
}

export async function createRoleAction(input: RoleFormInput): Promise<ActionResult> {
  const ctx = await requireClinicAdmin();
  if (!ctx) return FORBIDDEN;
  const res = await TeamService.createRole(ctx.clinic.id, input);
  if (!res.ok) return res;
  revalidatePath(TEAM_PATH, "page");
  return { ok: true };
}

export async function updateRoleAction(
  roleId: string,
  input: RoleFormInput
): Promise<ActionResult> {
  const ctx = await requireClinicAdmin();
  if (!ctx) return FORBIDDEN;
  const res = await TeamService.updateRole(ctx.clinic.id, roleId, input);
  if (!res.ok) return res;
  // A role's permissions shape every staff page — refresh the whole dashboard.
  revalidatePath("/admin", "layout");
  return { ok: true };
}

export async function deleteRoleAction(roleId: string): Promise<ActionResult> {
  const ctx = await requireClinicAdmin();
  if (!ctx) return FORBIDDEN;
  const res = await TeamService.deleteRole(ctx.clinic.id, roleId);
  if (!res.ok) return res;
  revalidatePath(TEAM_PATH, "page");
  return { ok: true };
}

// ─── Members ──────────────────────────────────────────────────────────────────

export async function inviteTeamMemberAction(input: {
  email: string;
  fullName: string;
  assignment: string;
}): Promise<ActionResult> {
  const ctx = await requireClinicAdmin();
  if (!ctx) return FORBIDDEN;
  const res = await TeamService.inviteTeamMember({
    clinic: ctx.clinic,
    email: input.email,
    fullName: input.fullName,
    assignment: parseAssignment(input.assignment),
  });
  if (!res.ok) return res;
  revalidatePath(TEAM_PATH, "page");
  return {
    ok: true,
    notice: res.data.emailSent
      ? "تمت إضافة العضو وأُرسلت له دعوة على بريده الإلكتروني"
      : "تمت إضافة العضو، لكن تعذّر إرسال بريد الدعوة — يمكنه استخدام «نسيت كلمة المرور» من صفحة الدخول",
  };
}

export async function changeTeamMemberRoleAction(
  userId: string,
  assignment: string
): Promise<ActionResult> {
  const ctx = await requireClinicAdmin();
  if (!ctx) return FORBIDDEN;
  const res = await TeamService.changeTeamMemberRole({
    clinicId: ctx.clinic.id,
    actorId: ctx.user.id,
    userId,
    assignment: parseAssignment(assignment),
  });
  if (!res.ok) return res;
  revalidatePath(TEAM_PATH, "page");
  return { ok: true };
}

export async function removeTeamMemberAction(userId: string): Promise<ActionResult> {
  const ctx = await requireClinicAdmin();
  if (!ctx) return FORBIDDEN;
  const res = await TeamService.removeTeamMember({
    clinicId: ctx.clinic.id,
    actorId: ctx.user.id,
    userId,
  });
  if (!res.ok) return res;
  revalidatePath(TEAM_PATH, "page");
  revalidatePath("/admin/patients", "page");
  return { ok: true };
}
