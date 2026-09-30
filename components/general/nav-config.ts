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
} from "lucide-react";
import type { NavItem } from "./sidebar";

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
    { href: "/admin", label: "الرئيسية", icon: LayoutDashboard },
    { href: "/admin/users", label: "المستخدمون", icon: Users },
    { href: "/admin/doctors", label: "الأطباء", icon: Stethoscope },
    { href: "/admin/specialties", label: "التخصصات", icon: Tags },
    { href: "/admin/branches", label: "الفروع", icon: MapPin },
    { href: "/admin/settings", label: "معلومات العيادة", icon: Building2 },
    { href: "/admin/knowledge", label: "قاعدة المعرفة", icon: BookOpen },
    { href: "/admin/appointments", label: "المواعيد", icon: CalendarDays },
    { href: "/admin/messages", label: "الرسائل", icon: MessageSquare },
    {
      href: "/admin/whatsapp",
      label: "واتساب",
      icon: Smartphone,
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
    { href: "/admin/reports", label: "التقارير", icon: BarChart3 },
  ],
};

export const roleMeta: Record<"doctor" | "admin", { label: string; pageTitle: string }> = {
  doctor: { label: "طبيب", pageTitle: "لوحة تحكم الطبيب" },
  admin: { label: "مشرف", pageTitle: "لوحة تحكم المسؤول" },
};
