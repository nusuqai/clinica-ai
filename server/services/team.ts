import "server-only";
import { Prisma, Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { createAdminClient } from "@/lib/supabase/admin";
import { authEmailsByIds, findAuthUserIdByEmail } from "@/lib/supabase/auth-users";
import { sendTeamInvite } from "@/lib/email/send-auth-email";
import { clinicUrl } from "@/lib/clinic-url";
import { sanitizePermissions, type Permission } from "@/lib/permissions";
import { isSyntheticEmail } from "@/server/services/patients";
import { ok, err, type Result } from "./_result";

// The clinic's team: its ADMINs and its STAFF (members holding a custom
// ClinicRole). Everything here is called from ADMIN-only server actions — see
// server/actions/team.ts — and is scoped by clinicId throughout.

// ─── Types ────────────────────────────────────────────────────────────────────

export interface TeamRole {
  id: string;
  name: string;
  description: string | null;
  permissions: Permission[];
  memberCount: number;
}

export interface TeamMember {
  id: string;
  fullName: string;
  email: string;
  phone: string | null;
  role: Role;
  /** The custom role a STAFF member holds; null for an ADMIN (or a STAFF member
      whose role was removed — they have no access until given a new one). */
  clinicRoleId: string | null;
  clinicRoleName: string | null;
  /** Branch scope (STAFF only — an ADMIN always works across every branch).
      `allBranches` false + `branchIds` = the only branches they may work in. */
  allBranches: boolean;
  branchIds: string[];
  joinedAt: Date;
}

/** Where a staff member works: everywhere, or only in the listed branches. */
export type BranchSelection = { all: true } | { all: false; branchIds: string[] };

/** Who a member becomes: another admin, or staff under one custom role. */
export type TeamAssignment = { kind: "admin" } | { kind: "role"; roleId: string };

const ADMIN_ROLE_LABEL = "مدير العيادة";

// ─── Default roles ────────────────────────────────────────────────────────────

// Starter roles a clinic gets on creation — plain rows the admin may edit or
// delete. Existing clinics received the same two from the roles_permissions
// migration.
const DEFAULT_ROLES: { name: string; description: string; permissions: Permission[] }[] = [
  {
    name: "استقبال",
    description: "حجز المواعيد ومتابعة المرضى والرد على الرسائل",
    permissions: ["appointments", "patients", "messages"],
  },
  {
    name: "خدمة العملاء",
    description: "الرد على رسائل العملاء فقط",
    permissions: ["messages"],
  },
];

/** Idempotent. Best-effort: a clinic without starter roles still works. */
export async function seedDefaultClinicRoles(clinicId: string): Promise<void> {
  try {
    await prisma.clinicRole.createMany({
      data: DEFAULT_ROLES.map((r) => ({ ...r, clinicId })),
      skipDuplicates: true,
    });
  } catch (e) {
    console.error("Failed to seed default clinic roles:", e);
  }
}

// ─── Roles ────────────────────────────────────────────────────────────────────

export async function listRoles(clinicId: string): Promise<TeamRole[]> {
  const roles = await prisma.clinicRole.findMany({
    where: { clinicId },
    orderBy: { createdAt: "asc" },
    include: { _count: { select: { members: true } } },
  });
  return roles.map((r) => ({
    id: r.id,
    name: r.name,
    description: r.description,
    permissions: sanitizePermissions(r.permissions),
    memberCount: r._count.members,
  }));
}

export interface RoleInput {
  name: string;
  description?: string | null;
  permissions: readonly unknown[];
}

function cleanRoleInput(input: RoleInput): Result<{
  name: string;
  description: string | null;
  permissions: Permission[];
}> {
  const name = input.name?.trim() ?? "";
  if (name.length < 2) return err("اسم الدور مطلوب");
  if (name.length > 60) return err("اسم الدور طويل جداً");
  const permissions = sanitizePermissions(input.permissions);
  if (permissions.length === 0) return err("اختر صلاحية واحدة على الأقل");
  return ok({ name, description: input.description?.trim() || null, permissions });
}

function isUniqueViolation(e: unknown): boolean {
  return e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";
}

export async function createRole(
  clinicId: string,
  input: RoleInput
): Promise<Result<{ id: string }>> {
  const clean = cleanRoleInput(input);
  if (!clean.ok) return clean;
  try {
    const role = await prisma.clinicRole.create({
      data: { clinicId, ...clean.data },
      select: { id: true },
    });
    return ok(role);
  } catch (e) {
    if (isUniqueViolation(e)) return err("يوجد دور بهذا الاسم بالفعل");
    return err("تعذّر إنشاء الدور");
  }
}

export async function updateRole(
  clinicId: string,
  roleId: string,
  input: RoleInput
): Promise<Result<void>> {
  const clean = cleanRoleInput(input);
  if (!clean.ok) return clean;
  try {
    const res = await prisma.clinicRole.updateMany({
      where: { id: roleId, clinicId },
      data: clean.data,
    });
    if (res.count === 0) return err("الدور غير موجود");
    return ok(undefined);
  } catch (e) {
    if (isUniqueViolation(e)) return err("يوجد دور بهذا الاسم بالفعل");
    return err("تعذّر تحديث الدور");
  }
}

/** A role still held by members can't be deleted — reassign them first, so
    nobody silently loses all access. */
export async function deleteRole(clinicId: string, roleId: string): Promise<Result<void>> {
  const role = await prisma.clinicRole.findFirst({
    where: { id: roleId, clinicId },
    select: { _count: { select: { members: true } } },
  });
  if (!role) return err("الدور غير موجود");
  if (role._count.members > 0) {
    return err("لا يمكن حذف دور مُسند إلى أعضاء — انقلهم إلى دور آخر أولاً");
  }
  await prisma.clinicRole.deleteMany({ where: { id: roleId, clinicId } });
  return ok(undefined);
}

// ─── Members ──────────────────────────────────────────────────────────────────

export async function listTeamMembers(clinicId: string): Promise<TeamMember[]> {
  const members = await prisma.clinicMember.findMany({
    where: { clinicId, role: { in: [Role.ADMIN, Role.STAFF] } },
    orderBy: [{ role: "asc" }, { createdAt: "asc" }],
    select: {
      role: true,
      createdAt: true,
      allBranches: true,
      branches: { select: { branchId: true } },
      clinicRole: { select: { id: true, name: true } },
      user: { select: { id: true, fullName: true, phone: true } },
    },
  });
  const emails = await authEmailsByIds(members.map((m) => m.user.id));

  return members.map((m) => ({
    id: m.user.id,
    fullName: m.user.fullName,
    email: emails.get(m.user.id) ?? "",
    phone: m.user.phone,
    role: m.role,
    clinicRoleId: m.role === Role.STAFF ? (m.clinicRole?.id ?? null) : null,
    clinicRoleName: m.role === Role.STAFF ? (m.clinicRole?.name ?? null) : null,
    allBranches: m.role === Role.ADMIN || m.allBranches,
    branchIds: m.role === Role.STAFF && !m.allBranches ? m.branches.map((b) => b.branchId) : [],
    joinedAt: m.createdAt,
  }));
}

/** Resolves an assignment to the membership columns + a display label. */
async function resolveAssignment(
  clinicId: string,
  assignment: TeamAssignment
): Promise<Result<{ role: Role; clinicRoleId: string | null; label: string }>> {
  if (assignment.kind === "admin") {
    return ok({ role: Role.ADMIN, clinicRoleId: null, label: ADMIN_ROLE_LABEL });
  }
  const role = await prisma.clinicRole.findFirst({
    where: { id: assignment.roleId, clinicId },
    select: { id: true, name: true },
  });
  if (!role) return err("الدور المحدد غير موجود");
  return ok({ role: Role.STAFF, clinicRoleId: role.id, label: role.name });
}

// ─── Branch scope ─────────────────────────────────────────────────────────────

/** Validates a selection against the clinic: real branches, and at least one
    when limited (a limited member with no branch could open nothing). */
async function cleanBranchSelection(
  clinicId: string,
  selection: BranchSelection
): Promise<Result<BranchSelection>> {
  if (selection.all) return ok({ all: true });
  const ids = [...new Set(selection.branchIds)];
  if (ids.length === 0) return err("اختر فرعاً واحداً على الأقل، أو «كل الفروع»");
  const found = await prisma.branch.count({ where: { clinicId, id: { in: ids } } });
  if (found !== ids.length) return err("أحد الفروع المحددة غير موجود");
  return ok({ all: false, branchIds: ids });
}

/** Replaces a membership's branch scope. `selection` must already be clean. */
async function writeBranchSelection(
  tx: Prisma.TransactionClient,
  memberId: string,
  selection: BranchSelection
): Promise<void> {
  await tx.clinicMemberBranch.deleteMany({ where: { memberId } });
  await tx.clinicMember.update({ where: { id: memberId }, data: { allBranches: selection.all } });
  if (!selection.all) {
    await tx.clinicMemberBranch.createMany({
      data: selection.branchIds.map((branchId) => ({ memberId, branchId })),
    });
  }
}

/** Sets where a STAFF member works. An ADMIN is always clinic-wide. */
export async function setTeamMemberBranches(args: {
  clinicId: string;
  userId: string;
  selection: BranchSelection;
}): Promise<Result<void>> {
  const member = await prisma.clinicMember.findUnique({
    where: { userId_clinicId: { userId: args.userId, clinicId: args.clinicId } },
    select: { id: true, role: true },
  });
  if (!member || (member.role !== Role.ADMIN && member.role !== Role.STAFF)) {
    return err("العضو غير موجود في فريق العيادة");
  }
  if (member.role === Role.ADMIN) return err("مدير العيادة يعمل على كل الفروع دائماً");

  const selection = await cleanBranchSelection(args.clinicId, args.selection);
  if (!selection.ok) return selection;

  await prisma.$transaction((tx) => writeBranchSelection(tx, member.id, selection.data));
  return ok(undefined);
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Adds someone to the clinic's team. A new email gets an account (random
 * password, pre-confirmed) and a set-password link; an existing account is
 * attached as-is and told to sign in. Refuses to convert a DOCTOR (they keep
 * their own dashboard) or to re-invite someone already on the team.
 */
export async function inviteTeamMember(args: {
  clinic: { id: string; slug: string; name: string };
  email: string;
  fullName: string;
  assignment: TeamAssignment;
  /** Branch scope for a staff invite; ignored for an admin. Default: all. */
  branches?: BranchSelection;
}): Promise<Result<{ emailSent: boolean }>> {
  const email = args.email.trim().toLowerCase();
  const fullName = args.fullName.trim();
  if (!EMAIL_RE.test(email)) return err("البريد الإلكتروني غير صالح");

  const target = await resolveAssignment(args.clinic.id, args.assignment);
  if (!target.ok) return target;

  // Checked before any account is created, so a bad pick leaves nothing behind.
  const branches = await cleanBranchSelection(
    args.clinic.id,
    target.data.role === Role.STAFF ? (args.branches ?? { all: true }) : { all: true }
  );
  if (!branches.ok) return branches;

  try {
    let userId = await findAuthUserIdByEmail(email);
    let isNewAccount = false;

    if (!userId) {
      if (fullName.length < 2) return err("الاسم مطلوب");
      const { data, error } = await createAdminClient().auth.admin.createUser({
        email,
        password: globalThis.crypto.randomUUID(),
        email_confirm: true,
        user_metadata: { full_name: fullName },
      });
      if (error || !data.user) return err(error?.message ?? "تعذّر إنشاء الحساب");
      userId = data.user.id;
      isNewAccount = true;
    }

    // The auth trigger normally creates the Profile; upsert covers trigger lag
    // and never overwrites an existing person's name.
    const profile = await prisma.profile.upsert({
      where: { id: userId },
      update: {},
      create: { id: userId, fullName: fullName || email },
      select: { fullName: true },
    });

    const existing = await prisma.clinicMember.findUnique({
      where: { userId_clinicId: { userId, clinicId: args.clinic.id } },
      select: { role: true },
    });
    if (existing?.role === Role.ADMIN || existing?.role === Role.STAFF) {
      return err("هذا الحساب عضو في فريق العيادة بالفعل");
    }
    if (existing?.role === Role.DOCTOR) {
      return err("هذا الحساب مسجّل كطبيب في العيادة ولا يمكن إضافته كموظف");
    }

    const memberWhere = { userId_clinicId: { userId, clinicId: args.clinic.id } };
    await prisma.$transaction(async (tx) => {
      const member = await tx.clinicMember.upsert({
        where: memberWhere,
        update: { role: target.data.role, clinicRoleId: target.data.clinicRoleId },
        create: {
          userId,
          clinicId: args.clinic.id,
          role: target.data.role,
          clinicRoleId: target.data.clinicRoleId,
        },
        select: { id: true },
      });
      await writeBranchSelection(tx, member.id, branches.data);
    });

    // Best-effort: the membership stands even if the email fails — the admin is
    // told, and the member can still use "forgot password" on the login page.
    let emailSent = false;
    try {
      const sent = await sendTeamInvite({
        email,
        name: profile.fullName || fullName || null,
        clinicName: args.clinic.name,
        roleName: target.data.label,
        isNewAccount,
        loginUrl: clinicUrl(args.clinic.slug, "/login"),
      });
      emailSent = sent.ok;
    } catch (e) {
      console.error("Failed to send team invite:", e);
    }
    return ok({ emailSent });
  } catch (e) {
    console.error("Failed to invite team member:", e);
    return err("تعذّرت إضافة العضو");
  }
}

/** True when `userId` is the only ADMIN left in the clinic. */
async function isLastAdmin(clinicId: string, userId: string): Promise<boolean> {
  const admins = await prisma.clinicMember.findMany({
    where: { clinicId, role: Role.ADMIN },
    select: { userId: true },
    take: 2,
  });
  return admins.length === 1 && admins[0].userId === userId;
}

async function getTeamMembership(clinicId: string, userId: string) {
  const member = await prisma.clinicMember.findUnique({
    where: { userId_clinicId: { userId, clinicId } },
    select: { role: true },
  });
  return member && (member.role === Role.ADMIN || member.role === Role.STAFF) ? member : null;
}

/** Changes a team member's role. You can't change your own (an admin can't lock
    themselves out by accident), and the clinic always keeps one ADMIN. */
export async function changeTeamMemberRole(args: {
  clinicId: string;
  actorId: string;
  userId: string;
  assignment: TeamAssignment;
}): Promise<Result<void>> {
  if (args.userId === args.actorId) return err("لا يمكنك تغيير دورك بنفسك");

  const member = await getTeamMembership(args.clinicId, args.userId);
  if (!member) return err("العضو غير موجود في فريق العيادة");

  const target = await resolveAssignment(args.clinicId, args.assignment);
  if (!target.ok) return target;

  if (
    member.role === Role.ADMIN &&
    target.data.role !== Role.ADMIN &&
    (await isLastAdmin(args.clinicId, args.userId))
  ) {
    return err("يجب أن يبقى للعيادة مدير واحد على الأقل");
  }

  await prisma.$transaction(async (tx) => {
    const updated = await tx.clinicMember.update({
      where: { userId_clinicId: { userId: args.userId, clinicId: args.clinicId } },
      data: { role: target.data.role, clinicRoleId: target.data.clinicRoleId },
      select: { id: true },
    });
    // An admin is clinic-wide: drop any branch limit so it can't linger and
    // re-apply by surprise if they are later made staff again.
    if (target.data.role === Role.ADMIN) await writeBranchSelection(tx, updated.id, { all: true });
  });
  return ok(undefined);
}

/**
 * Takes someone off the team. Their account is never deleted: with a patient
 * history at this clinic they fall back to a PATIENT membership (their
 * appointments stay reachable); otherwise the membership is dropped.
 */
export async function removeTeamMember(args: {
  clinicId: string;
  actorId: string;
  userId: string;
}): Promise<Result<void>> {
  if (args.userId === args.actorId) return err("لا يمكنك إزالة نفسك من الفريق");

  const member = await getTeamMembership(args.clinicId, args.userId);
  if (!member) return err("العضو غير موجود في فريق العيادة");

  if (member.role === Role.ADMIN && (await isLastAdmin(args.clinicId, args.userId))) {
    return err("يجب أن يبقى للعيادة مدير واحد على الأقل");
  }

  const where = { userId_clinicId: { userId: args.userId, clinicId: args.clinicId } };
  const hasPatientHistory = await prisma.appointment.findFirst({
    where: { clinicId: args.clinicId, patientId: args.userId },
    select: { id: true },
  });
  if (hasPatientHistory) {
    await prisma.$transaction(async (tx) => {
      const updated = await tx.clinicMember.update({
        where,
        data: { role: Role.PATIENT, clinicRoleId: null },
        select: { id: true },
      });
      await writeBranchSelection(tx, updated.id, { all: true });
    });
  } else {
    await prisma.clinicMember.delete({ where });
  }
  return ok(undefined);
}

// ─── Patients list ────────────────────────────────────────────────────────────

export interface PatientListItem {
  id: string;
  fullName: string;
  /** Empty while the login email is still a WhatsApp placeholder. */
  email: string;
  phone: string | null;
  appointmentCount: number;
  joinedAt: Date;
}

/** The clinic's patients only — team members and doctors have their own pages. */
export async function listPatients(clinicId: string): Promise<PatientListItem[]> {
  const members = await prisma.clinicMember.findMany({
    where: { clinicId, role: Role.PATIENT },
    orderBy: { createdAt: "desc" },
    select: {
      createdAt: true,
      user: { select: { id: true, fullName: true, phone: true } },
    },
  });
  const ids = members.map((m) => m.user.id);
  const [emails, counts] = await Promise.all([
    authEmailsByIds(ids),
    prisma.appointment.groupBy({
      by: ["patientId"],
      where: { clinicId, patientId: { in: ids } },
      _count: { _all: true },
    }),
  ]);
  const countByPatient = new Map(counts.map((c) => [c.patientId, c._count._all]));

  return members.map((m) => {
    const email = emails.get(m.user.id) ?? "";
    return {
      id: m.user.id,
      fullName: m.user.fullName,
      email: isSyntheticEmail(email) ? "" : email,
      phone: m.user.phone,
      appointmentCount: countByPatient.get(m.user.id) ?? 0,
      joinedAt: m.createdAt,
    };
  });
}
