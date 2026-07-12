"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LucideIcon,
  ChevronRight,
  X,
  LogOut,
  Stethoscope,
  Bell,
} from "lucide-react";
import { signOut } from "@/server/actions/auth";
import { useEscalationAlerts } from "./escalation-provider";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

interface SidebarProps {
  navItems: NavItem[];
  roleLabel: string;
  userFullName: string;
  userEmail: string;
  collapsed: boolean;
  onToggleCollapse: () => void;
  mobileOpen: boolean;
  onMobileClose: () => void;
}

export default function Sidebar({
  navItems,
  roleLabel,
  userFullName,
  userEmail,
  collapsed,
  onToggleCollapse,
  mobileOpen,
  onMobileClose,
}: SidebarProps) {
  const pathname = usePathname();

  const initials = userFullName
    .split(" ")
    .slice(0, 2)
    .map((n) => n[0])
    .join("");

  return (
    <>
      {/* Desktop sidebar */}
      <aside
        className={[
          "hidden md:flex flex-col h-full bg-primary text-white transition-[width] duration-300 ease-in-out flex-shrink-0 border-s border-white/5",
          collapsed ? "w-[72px]" : "w-64",
        ].join(" ")}
      >
        <SidebarContent
          navItems={navItems}
          roleLabel={roleLabel}
          userFullName={userFullName}
          userEmail={userEmail}
          initials={initials}
          collapsed={collapsed}
          onToggleCollapse={onToggleCollapse}
          pathname={pathname}
        />
      </aside>

      {/* Mobile drawer */}
      <aside
        className={[
          "fixed inset-y-0 end-0 z-30 flex flex-col w-72 bg-primary text-white md:hidden transition-transform duration-300 ease-in-out",
          mobileOpen
            ? "translate-x-0"
            : "translate-x-full rtl:-translate-x-full",
        ].join(" ")}
      >
        <button
          onClick={onMobileClose}
          className="absolute top-4 start-4 p-1.5 rounded-lg text-white/60 hover:text-white hover:bg-white/10 transition-colors"
          aria-label="إغلاق القائمة"
        >
          <X className="w-5 h-5" />
        </button>
        <SidebarContent
          navItems={navItems}
          roleLabel={roleLabel}
          userFullName={userFullName}
          userEmail={userEmail}
          initials={initials}
          collapsed={false}
          onToggleCollapse={onMobileClose}
          pathname={pathname}
        />
      </aside>
    </>
  );
}

interface SidebarContentProps {
  navItems: NavItem[];
  roleLabel: string;
  userFullName: string;
  userEmail: string;
  initials: string;
  collapsed: boolean;
  onToggleCollapse: () => void;
  pathname: string;
}

function SidebarContent({
  navItems,
  roleLabel,
  userFullName,
  userEmail,
  initials,
  collapsed,
  onToggleCollapse,
  pathname,
}: SidebarContentProps) {
  const { hasUnresolved } = useEscalationAlerts();

  return (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className="flex items-center gap-3 px-4 h-16 border-b border-white/10 flex-shrink-0">
        <div className="w-9 h-9 rounded-xl bg-accent/20 flex items-center justify-center flex-shrink-0">
          <Stethoscope className="w-5 h-5 text-accent" />
        </div>
        {!collapsed && (
          <span className="font-heading font-bold text-lg text-white tracking-wide truncate">
            Clinica AI
          </span>
        )}
      </div>

      {/* Role badge */}
      {!collapsed && (
        <div className="px-4 pt-4 pb-2">
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-accent/20 text-accent font-sans">
            {roleLabel}
          </span>
        </div>
      )}

      {/* Nav items */}
      <nav className="flex-1 overflow-y-auto py-2 px-2 space-y-0.5">
        {navItems.map(({ href, label, icon: Icon }) => {
          const isActive =
            pathname === href ||
            (href !== "/" &&
              pathname.startsWith(href + "/") &&
              !navItems.some(
                (item) =>
                  item.href !== href &&
                  (pathname === item.href ||
                    pathname.startsWith(item.href + "/")),
              ));
          const showAlert = href === "/admin/messages" && hasUnresolved;
          return (
            <Link
              key={href}
              href={href}
              title={
                collapsed
                  ? showAlert
                    ? `${label} — يوجد طلب تصعيد غير محلول`
                    : label
                  : undefined
              }
              className={[
                "flex items-center gap-3 px-3 py-2.5 rounded-xl font-sans text-sm transition-all duration-150 group relative",
                isActive
                  ? "bg-accent/15 text-accent font-medium"
                  : "text-white/70 hover:bg-white/8 hover:text-white",
              ].join(" ")}
            >
              {isActive && (
                <span className="absolute end-0 top-1/2 -translate-y-1/2 w-0.5 h-6 bg-accent rounded-full" />
              )}
              <span className="relative flex-shrink-0">
                <Icon
                  className={[
                    "w-5 h-5 transition-colors",
                    isActive
                      ? "text-accent"
                      : "text-white/50 group-hover:text-white/80",
                  ].join(" ")}
                />
                {showAlert && (
                  <span className="absolute -top-1 -end-1 flex w-2.5 h-2.5">
                    <span className="animate-ping absolute inline-flex w-full h-full rounded-full bg-red-400 opacity-75" />
                    <span className="relative inline-flex w-2.5 h-2.5 rounded-full bg-red-500 border border-primary" />
                  </span>
                )}
              </span>
              {!collapsed && (
                <span className="truncate flex items-center gap-1.5">
                  {label}
                  {showAlert && (
                    <Bell className="w-3.5 h-3.5 text-red-400 flex-shrink-0" />
                  )}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* Bottom: user info + sign out */}
      <div className="flex-shrink-0 border-t border-white/10 p-3 space-y-1">
        {/* User info */}
        <div
          className={[
            "flex items-center gap-3 px-2 py-2 rounded-xl",
            collapsed ? "justify-center" : "",
          ].join(" ")}
        >
          <div className="w-8 h-8 rounded-full bg-accent/30 flex items-center justify-center flex-shrink-0">
            <span className="text-xs font-bold text-accent font-sans">
              {initials}
            </span>
          </div>
          {!collapsed && (
            <div className="overflow-hidden">
              <p className="text-sm font-medium text-white truncate font-sans leading-tight">
                {userFullName}
              </p>
              <p className="text-xs text-white/40 truncate font-sans" dir="ltr">
                {userEmail}
              </p>
            </div>
          )}
        </div>

        {/* Sign out */}
        <form action={signOut}>
          <button
            type="submit"
            title={collapsed ? "تسجيل الخروج" : undefined}
            className={[
              "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl font-sans text-sm text-white/60 hover:bg-red-500/15 hover:text-red-400 transition-all duration-150",
              collapsed ? "justify-center" : "",
            ].join(" ")}
          >
            <LogOut className="w-5 h-5 flex-shrink-0" />
            {!collapsed && <span>تسجيل الخروج</span>}
          </button>
        </form>

        {/* Collapse toggle (desktop only) */}
        <button
          onClick={onToggleCollapse}
          className={[
            "hidden md:flex w-full items-center gap-3 px-3 py-2 rounded-xl font-sans text-xs text-white/30 hover:text-white/60 hover:bg-white/5 transition-all duration-150",
            collapsed ? "justify-center" : "",
          ].join(" ")}
        >
          <ChevronRight
            className={[
              "w-4 h-4 flex-shrink-0 transition-transform duration-300",
              collapsed ? "rotate-180" : "rotate-0",
            ].join(" ")}
          />
          {!collapsed && <span>طي القائمة</span>}
        </button>
      </div>
    </div>
  );
}
