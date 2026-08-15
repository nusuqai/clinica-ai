import {
  LayoutDashboard,
  CalendarDays,
  CalendarPlus,
  MessageCircle,
  UserCircle,
  Users,
  Clock,
  Stethoscope,
  BarChart3,
  Globe,
  Smartphone,
  MessageSquare,
  FileText,
  KeyRound,
  BookOpen,
  Bot,
  Wallet,
  MapPin,
  Building2,
  Tags,
} from "lucide-react";
import type { NavItem } from "./sidebar";

export const navConfig: Record<"patient" | "doctor" | "admin", NavItem[]> = {
  patient: [
    { href: "/dashboard", label: "الرئيسية", icon: LayoutDashboard },
    { href: "/dashboard/appointments", label: "مواعيدي", icon: CalendarDays },
    { href: "/dashboard/book", label: "احجز موعد", icon: CalendarPlus },
    // { href: "/dashboard/chat", label: "المساعد الذكي", icon: MessageCircle },
    { href: "/dashboard/profile", label: "الملف الشخصي", icon: UserCircle },
    { href: "/", label: "الموقع الرئيسي", icon: Globe },
  ],
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
    { href: "/admin/appointments", label: "المواعيد", icon: CalendarDays },
    { href: "/admin/messages", label: "الرسائل", icon: MessageSquare },
    {
      href: "/admin/whatsapp",
      label: "واتساب والقوالب",
      icon: Smartphone,
      children: [
        { href: "/admin/whatsapp/templates", label: "القوالب", icon: FileText },
        { href: "/admin/whatsapp/configuration", label: "الإعدادات", icon: KeyRound },
        { href: "/admin/whatsapp/guide", label: "دليل الإعداد", icon: BookOpen },
      ],
    },
    {
      href: "/admin/ai",
      label: "المساعد الذكي",
      icon: Bot,
      children: [
        { href: "/admin/ai", label: "الإعدادات والرصيد", icon: Wallet },
        { href: "/admin/ai/usage", label: "تقرير التكاليف", icon: BarChart3 },
      ],
    },
    { href: "/admin/reports", label: "التقارير", icon: BarChart3 },
  ],
};

export const roleMeta: Record<
  "patient" | "doctor" | "admin",
  { label: string; pageTitle: string }
> = {
  patient: { label: "مريض", pageTitle: "لوحة تحكم المريض" },
  doctor: { label: "طبيب", pageTitle: "لوحة تحكم الطبيب" },
  admin: { label: "مشرف", pageTitle: "لوحة تحكم المسؤول" },
};
