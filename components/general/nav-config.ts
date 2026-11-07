import {
  LayoutDashboard,
  CalendarDays,
  UserCircle,
  Users,
  Clock,
  Stethoscope,
  BarChart3,
  Smartphone,
  MessageSquare,
  KeyRound,
  BookOpen,
  MapPin,
  Building2,
  Tags,
  BellRing,
  ShieldCheck,
  HeartPulse,
} from "lucide-react";
import type { NavItem } from "./sidebar";
import type { Permission } from "@/lib/permissions";

// Patients have no dashboard shell: their home is the clinic landing page (see
// the removal of app/(clinic)/dashboard). Only staff (doctor/admin) use the
// sidebar dashboard.
export const navConfig: Record<"doctor" | "admin", NavItem[]> = {
  doctor: [
    { href: "/doctor", label: "الرئيسية", icon: LayoutDashboard },
    { href: "/doctor/appointments", label: "المواعيد", icon: CalendarDays },
    { href: "/doctor/patients", label: "المرضى", icon: Users },
    { href: "/doctor/schedule", label: "جدول العمل", icon: Clock },
    { href: "/doctor/profile", label: "الملف الشخصي", icon: UserCircle },
  ],
  admin: [
    // Each item names the permission that opens it (see lib/permissions.ts);
    // the shell drops what the signed-in member can't manage. `adminOnly`
    // items are for the clinic ADMIN alone.
    { href: "/admin", label: "الرئيسية", icon: LayoutDashboard, permission: "reports" },
    { href: "/admin/team", label: "فريق العمل", icon: ShieldCheck, adminOnly: true },
    { href: "/admin/patients", label: "المرضى", icon: HeartPulse, permission: "patients" },
    { href: "/admin/doctors", label: "الأطباء", icon: Stethoscope, permission: "doctors" },
    { href: "/admin/specialties", label: "التخصصات", icon: Tags, permission: "clinic" },
    {
      href: "/admin/branches",
      label: "الفروع",
      icon: MapPin,
      permission: ["clinic", "branches"],
    },
    { href: "/admin/settings", label: "معلومات العيادة", icon: Building2, permission: "clinic" },
    { href: "/admin/knowledge", label: "قاعدة المعرفة", icon: BookOpen, permission: "agent" },
    {
      href: "/admin/appointments",
      label: "المواعيد",
      icon: CalendarDays,
      permission: "appointments",
    },
    { href: "/admin/messages", label: "الرسائل", icon: MessageSquare, permission: "messages" },
    {
      href: "/admin/whatsapp",
      label: "واتساب",
      icon: Smartphone,
      permission: "whatsapp",
      // Connecting the clinic to Meta (credentials, templates, setup guide) is
      // platform-admin work and lives at /platform/whatsapp.
      children: [
        {
          href: "/admin/whatsapp/automation",
          label: "التذكيرات والتقييم",
          icon: BellRing,
        },
        {
          href: "/admin/whatsapp/configuration",
          label: "حالة الاتصال",
          icon: KeyRound,
        },
      ],
    },
    // {
    //   href: "/admin/ai",
    //   label: "المساعد الذكي",
    //   icon: Bot,
    //   children: [
    //     { href: "/admin/ai", label: "الإعدادات والرصيد", icon: Wallet },
    //     { href: "/admin/ai/usage", label: "تقرير التكاليف", icon: BarChart3 },
    //   ],
    // },
    { href: "/admin/reports", label: "التقارير", icon: BarChart3, permission: "reports" },
  ],
};

export const roleMeta: Record<"doctor" | "admin", { label: string; pageTitle: string }> = {
  doctor: { label: "طبيب", pageTitle: "لوحة تحكم الطبيب" },
  admin: { label: "مشرف", pageTitle: "لوحة تحكم المسؤول" },
};

/** The admin-dashboard items a member may see: everything for the clinic ADMIN,
    otherwise only what their role's permissions open. */
export function visibleAdminNav(permissions: readonly Permission[], isClinicAdmin: boolean) {
  if (isClinicAdmin) return navConfig.admin;
  return navConfig.admin.filter((item) => {
    if (item.adminOnly) return false;
    if (!item.permission) return true;
    const needed = Array.isArray(item.permission) ? item.permission : [item.permission];
    return needed.some((p) => permissions.includes(p));
  });
}
