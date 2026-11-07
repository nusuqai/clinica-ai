import { Role } from "@prisma/client";

// The permission catalog for clinic staff. One key per area of the admin
// dashboard — holding it means full control ("manage") of that area: seeing it
// and changing it. There is deliberately no view/edit split.
//
// Keys are stored as plain strings on ClinicRole.permissions, so adding one here
// needs no migration. A clinic ADMIN holds all of them implicitly; team & role
// management itself has NO key — it is ADMIN-only, so staff can never widen
// their own access.

export const PERMISSIONS = [
  "messages",
  "appointments",
  "doctors",
  "patients",
  "medical_records",
  "agent",
  "whatsapp",
  "clinic",
  "branches",
  "reports",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

// Where a permission applies once a staff member is limited to some branches:
//   "branch" — only inside their branches (the data carries a branch).
//   "clinic" — across the whole clinic regardless (the data has no branch, or
//              is deliberately shared: a patient may visit any branch).
export type PermissionScope = "branch" | "clinic";

export const PERMISSION_META: Record<
  Permission,
  { label: string; description: string; scope: PermissionScope }
> = {
  messages: {
    label: "إدارة الرسائل",
    description:
      "صندوق الرسائل: قراءة المحادثات، الرد على العملاء، وإيقاف أو تشغيل المساعد الذكي للمحادثة",
    scope: "clinic",
  },
  appointments: {
    label: "إدارة المواعيد",
    description: "عرض المواعيد وتغيير حالتها، تسجيل الحضور وإدارة قائمة الانتظار",
    scope: "branch",
  },
  doctors: {
    label: "إدارة الأطباء",
    description: "إضافة وتعديل الأطباء، وضبط مواعيد العمل والفترات المتاحة",
    scope: "branch",
  },
  patients: {
    label: "إدارة المرضى",
    description: "عرض قائمة المرضى وتعديل بياناتهم",
    scope: "clinic",
  },
  medical_records: {
    label: "إدارة السجلات الطبية",
    description: "الاطلاع على التاريخ المرضي وسجلات العلاج والمرفقات وتعديلها",
    scope: "clinic",
  },
  agent: {
    label: "إدارة تعلّم المساعد الذكي",
    description: "قاعدة المعرفة التي يتعلم منها المساعد، وإعداداته وتقرير استخدامه",
    scope: "clinic",
  },
  whatsapp: {
    label: "إدارة واتساب",
    description: "التذكيرات ورسائل التقييم التلقائية وحالة الاتصال",
    scope: "clinic",
  },
  clinic: {
    label: "إدارة بيانات العيادة",
    description: "معلومات العيادة والتخصصات، وإضافة الفروع وحذفها",
    scope: "clinic",
  },
  branches: {
    label: "إدارة بيانات الفروع",
    description: "تعديل عنوان الفرع وأرقامه وساعات عمله",
    scope: "branch",
  },
  reports: {
    label: "التقارير والإحصائيات",
    description:
      "لوحة الإحصائيات الرئيسية وصفحة التقارير (أرقام المواعيد فقط لمن يعمل في فروع محددة)",
    scope: "branch",
  },
};

export function isPermission(value: unknown): value is Permission {
  return typeof value === "string" && (PERMISSIONS as readonly string[]).includes(value);
}

/** Keeps only known keys, de-duplicated, in catalog order. */
export function sanitizePermissions(values: readonly unknown[]): Permission[] {
  const set = new Set(values.filter(isPermission));
  return PERMISSIONS.filter((p) => set.has(p));
}

/** The permissions a membership actually grants. */
export function permissionsFor(role: Role, rolePermissions: readonly string[] = []): Permission[] {
  if (role === Role.ADMIN) return [...PERMISSIONS];
  if (role === Role.STAFF) return sanitizePermissions(rolePermissions);
  return [];
}

/** Roles that work in the clinic's admin dashboard (/admin). */
export function isDashboardRole(role: Role): boolean {
  return role === Role.ADMIN || role === Role.STAFF;
}

// Where each dashboard section lives, in the order a staff member should land
// on them: the first one they hold is their home when they can't see the stats.
export const PERMISSION_HOME: { permission: Permission; href: string }[] = [
  { permission: "reports", href: "/admin" },
  { permission: "messages", href: "/admin/messages" },
  { permission: "appointments", href: "/admin/appointments" },
  { permission: "patients", href: "/admin/patients" },
  { permission: "doctors", href: "/admin/doctors" },
  { permission: "agent", href: "/admin/knowledge" },
  { permission: "whatsapp", href: "/admin/whatsapp/automation" },
  { permission: "clinic", href: "/admin/settings" },
  { permission: "branches", href: "/admin/branches" },
];

export const PERMISSION_SCOPE_LABEL: Record<PermissionScope, string> = {
  branch: "حسب الفرع",
  clinic: "كل العيادة",
};
