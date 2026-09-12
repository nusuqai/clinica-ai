"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { LucideIcon, ChevronRight, ChevronDown, X, LogOut, Stethoscope, Bell } from "lucide-react";
import { signOut } from "@/server/actions/auth";
import { useEscalationAlerts } from "./escalation-provider";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Sub-items — when present the item renders as a collapsible group. */
  children?: NavItem[];
}

interface SidebarProps {
  navItems: NavItem[];
  roleLabel: string;
  userFullName: string;
  userEmail: string;
  clinicName: string;
  clinicLogoUrl?: string | null;
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
  clinicName,
  clinicLogoUrl = null,
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
          "hidden h-full flex-shrink-0 flex-col border-s border-white/5 bg-primary text-white transition-[width] duration-300 ease-in-out md:flex",
          collapsed ? "w-[72px]" : "w-64",
        ].join(" ")}
      >
        <SidebarContent
          navItems={navItems}
          roleLabel={roleLabel}
          userFullName={userFullName}
          userEmail={userEmail}
          clinicName={clinicName}
          clinicLogoUrl={clinicLogoUrl}
          initials={initials}
          collapsed={collapsed}
          onToggleCollapse={onToggleCollapse}
          pathname={pathname}
        />
      </aside>

      {/* Mobile drawer */}
      <aside
        className={[
          "fixed inset-y-0 end-0 z-30 flex w-72 flex-col bg-primary text-white transition-transform duration-300 ease-in-out md:hidden",
          mobileOpen ? "translate-x-0" : "translate-x-full rtl:-translate-x-full",
        ].join(" ")}
      >
        <button
          onClick={onMobileClose}
          className="absolute start-4 top-4 rounded-lg p-1.5 text-white/60 transition-colors hover:bg-white/10 hover:text-white"
          aria-label="إغلاق القائمة"
        >
          <X className="h-5 w-5" />
        </button>
        <SidebarContent
          navItems={navItems}
          roleLabel={roleLabel}
          userFullName={userFullName}
          userEmail={userEmail}
          clinicName={clinicName}
          clinicLogoUrl={clinicLogoUrl}
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
  clinicName: string;
  clinicLogoUrl?: string | null;
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
  clinicName,
  clinicLogoUrl = null,
  initials,
  collapsed,
  onToggleCollapse,
  pathname,
}: SidebarContentProps) {
  const { hasUnresolved } = useEscalationAlerts();

  // Every href in the tree (parents + children), used for active tie-breaking so
  // a broad parent like `/admin` doesn't light up on a deeper route.
  const allHrefs = navItems.flatMap((item) => [
    item.href,
    ...(item.children?.map((c) => c.href) ?? []),
  ]);

  const isHrefActive = (href: string): boolean => {
    if (pathname === href) return true;
    if (href === "/" || !pathname.startsWith(href + "/")) return false;
    // A more specific href also matches → let that one win instead.
    return !allHrefs.some(
      (h) => h !== href && h.startsWith(href) && (pathname === h || pathname.startsWith(h + "/"))
    );
  };

  return (
    <div className="flex h-full flex-col">
      {/* Clinic identity — this host's clinic, not the platform brand. */}
      <div
        className="flex h-16 flex-shrink-0 items-center gap-3 border-b border-white/10 px-4"
        title={collapsed ? clinicName : undefined}
      >
        {clinicLogoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={clinicLogoUrl}
            alt={clinicName}
            className="h-9 w-9 flex-shrink-0 rounded-xl object-cover"
          />
        ) : (
          <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-accent/20">
            <Stethoscope className="h-5 w-5 text-accent" />
          </div>
        )}
        {!collapsed && (
          <span className="truncate font-heading text-lg font-bold tracking-wide text-white">
            {clinicName}
          </span>
        )}
      </div>

      {/* Role badge */}
      {!collapsed && (
        <div className="px-4 pb-2 pt-4">
          <span className="inline-flex items-center rounded-full bg-accent/20 px-2.5 py-0.5 font-sans text-xs font-medium text-accent">
            {roleLabel}
          </span>
        </div>
      )}

      {/* Nav items */}
      <nav className="flex-1 space-y-0.5 overflow-y-auto px-2 py-2">
        {navItems.map((item) =>
          item.children && item.children.length > 0 ? (
            <NavGroup
              key={item.href}
              item={item}
              collapsed={collapsed}
              isHrefActive={isHrefActive}
              hasUnresolved={hasUnresolved}
              onToggleCollapse={onToggleCollapse}
            />
          ) : (
            <NavLeaf
              key={item.href}
              item={item}
              collapsed={collapsed}
              active={isHrefActive(item.href)}
              showAlert={item.href.endsWith("/admin/messages") && hasUnresolved}
            />
          )
        )}
      </nav>

      {/* Bottom: user info + sign out */}
      <div className="flex-shrink-0 space-y-1 border-t border-white/10 p-3">
        {/* User info */}
        <div
          className={[
            "flex items-center gap-3 rounded-xl px-2 py-2",
            collapsed ? "justify-center" : "",
          ].join(" ")}
        >
          <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-accent/30">
            <span className="font-sans text-xs font-bold text-accent">{initials}</span>
          </div>
          {!collapsed && (
            <div className="overflow-hidden">
              <p className="truncate font-sans text-sm font-medium leading-tight text-white">
                {userFullName}
              </p>
              <p className="truncate font-sans text-xs text-white/40" dir="ltr">
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
              "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 font-sans text-sm text-white/60 transition-all duration-150 hover:bg-red-500/15 hover:text-red-400",
              collapsed ? "justify-center" : "",
            ].join(" ")}
          >
            <LogOut className="h-5 w-5 flex-shrink-0" />
            {!collapsed && <span>تسجيل الخروج</span>}
          </button>
        </form>

        {/* Collapse toggle (desktop only) */}
        <button
          onClick={onToggleCollapse}
          className={[
            "hidden w-full items-center gap-3 rounded-xl px-3 py-2 font-sans text-xs text-white/30 transition-all duration-150 hover:bg-white/5 hover:text-white/60 md:flex",
            collapsed ? "justify-center" : "",
          ].join(" ")}
        >
          <ChevronRight
            className={[
              "h-4 w-4 flex-shrink-0 transition-transform duration-300",
              collapsed ? "rotate-180" : "rotate-0",
            ].join(" ")}
          />
          {!collapsed && <span>طي القائمة</span>}
        </button>
      </div>
    </div>
  );
}

/** A single navigable row. `indented` shifts it to read as a sub-item. */
function NavLeaf({
  item,
  collapsed,
  active,
  showAlert = false,
  indented = false,
}: {
  item: NavItem;
  collapsed: boolean;
  active: boolean;
  showAlert?: boolean;
  indented?: boolean;
}) {
  const { href, label, icon: Icon } = item;
  return (
    <Link
      href={href}
      title={collapsed ? (showAlert ? `${label} — يوجد طلب تصعيد غير محلول` : label) : undefined}
      className={[
        "group relative flex items-center gap-3 rounded-xl px-3 py-2.5 font-sans text-sm transition-all duration-150",
        indented ? "py-2 ps-9" : "",
        active
          ? "bg-accent/15 font-medium text-accent"
          : "hover:bg-white/8 text-white/70 hover:text-white",
      ].join(" ")}
    >
      {active && (
        <span className="absolute end-0 top-1/2 h-6 w-0.5 -translate-y-1/2 rounded-full bg-accent" />
      )}
      <span className="relative flex-shrink-0">
        <Icon
          className={[
            indented ? "h-4 w-4" : "h-5 w-5",
            "transition-colors",
            active ? "text-accent" : "text-white/50 group-hover:text-white/80",
          ].join(" ")}
        />
        {showAlert && (
          <span className="absolute -end-1 -top-1 flex h-2.5 w-2.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full border border-primary bg-red-500" />
          </span>
        )}
      </span>
      {!collapsed && (
        <span className="flex items-center gap-1.5 truncate">
          {label}
          {showAlert && <Bell className="h-3.5 w-3.5 flex-shrink-0 text-red-400" />}
        </span>
      )}
    </Link>
  );
}

/** A parent row with children — expands to reveal its sub-items. */
function NavGroup({
  item,
  collapsed,
  isHrefActive,
  hasUnresolved,
  onToggleCollapse,
}: {
  item: NavItem;
  collapsed: boolean;
  isHrefActive: (href: string) => boolean;
  hasUnresolved: boolean;
  onToggleCollapse: () => void;
}) {
  const { label, icon: Icon, children = [] } = item;
  const childActive = children.some((c) => isHrefActive(c.href));
  // Auto-open when a child is active; let the user override afterwards.
  const [manualOpen, setManualOpen] = useState<boolean | null>(null);
  const open = manualOpen ?? childActive;

  const handleHeaderClick = () => {
    // On the collapsed rail there's no room for children — expand the rail
    // first so they become visible.
    if (collapsed) {
      onToggleCollapse();
      setManualOpen(true);
      return;
    }
    setManualOpen(!open);
  };

  return (
    <div>
      <button
        type="button"
        onClick={handleHeaderClick}
        title={collapsed ? label : undefined}
        className={[
          "group relative flex w-full items-center gap-3 rounded-xl px-3 py-2.5 font-sans text-sm transition-all duration-150",
          childActive
            ? "bg-accent/15 font-medium text-accent"
            : "hover:bg-white/8 text-white/70 hover:text-white",
        ].join(" ")}
      >
        {childActive && (
          <span className="absolute end-0 top-1/2 h-6 w-0.5 -translate-y-1/2 rounded-full bg-accent" />
        )}
        <span className="relative flex-shrink-0">
          <Icon
            className={[
              "h-5 w-5 transition-colors",
              childActive ? "text-accent" : "text-white/50 group-hover:text-white/80",
            ].join(" ")}
          />
        </span>
        {!collapsed && (
          <>
            <span className="flex-1 truncate text-start">{label}</span>
            <ChevronDown
              className={[
                "h-4 w-4 flex-shrink-0 transition-transform duration-200",
                open ? "rotate-180" : "rotate-0",
              ].join(" ")}
            />
          </>
        )}
      </button>
      {!collapsed && open && (
        <div className="mt-0.5 space-y-0.5">
          {children.map((child) => (
            <NavLeaf
              key={child.href}
              item={child}
              collapsed={false}
              active={isHrefActive(child.href)}
              indented
            />
          ))}
        </div>
      )}
    </div>
  );
}
