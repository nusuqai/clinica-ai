"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  LucideIcon,
  ChevronRight,
  ChevronDown,
  LogOut,
  Stethoscope,
  Bell,
  Coins,
} from "lucide-react";
import { signOut } from "@/server/actions/auth";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarRail,
  useSidebar,
} from "@/components/ui/sidebar";
import { useEscalationAlerts } from "./escalation-provider";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Sub-items — when present the item renders as a collapsible group. */
  children?: NavItem[];
}

/** The clinic's AI unit meter, shown in the admin sidebar. */
export interface AiUnitsBadge {
  balance: number;
  /** Running low — amber. */
  low: boolean;
  /** Out of units — red, and the agent has stopped answering. */
  sufficient: boolean;
}

interface AppSidebarProps {
  navItems: NavItem[];
  roleLabel: string;
  userFullName: string;
  userEmail: string;
  clinicName: string;
  clinicLogoUrl?: string | null;
  /** Admin only — omitted for doctors and patients, who have no meter. */
  aiUnits?: AiUnitsBadge | null;
}

/** Hidden on the collapsed icon rail. */
const HIDE_COLLAPSED = "group-data-[collapsible=icon]:hidden";

/**
 * ClinicaAI styling for a top-level nav row: the navy rail with a cyan active
 * state and an accent bar on the inner edge. The collapsed-rail size is widened
 * from shadcn's 32px so the 20px icons keep their breathing room.
 */
const NAV_BUTTON = cn(
  "group/nav relative h-10 gap-3 rounded-xl px-3 font-sans text-sm text-white/70",
  "hover:bg-white/[0.08] hover:text-white active:bg-white/[0.08] active:text-white",
  "data-[active=true]:bg-accent/15 data-[active=true]:font-medium data-[active=true]:text-accent",
  "data-[active=true]:after:absolute data-[active=true]:after:end-0 data-[active=true]:after:top-1/2 data-[active=true]:after:h-6 data-[active=true]:after:w-0.5 data-[active=true]:after:-translate-y-1/2 data-[active=true]:after:rounded-full data-[active=true]:after:bg-accent",
  "group-data-[collapsible=icon]:!size-10 group-data-[collapsible=icon]:!p-2.5"
);

function navIconClass(active: boolean) {
  return cn(
    "size-5",
    "shrink-0 transition-colors",
    active ? "text-accent" : "text-white/50 group-hover/nav:text-white/80"
  );
}

export default function AppSidebar({
  navItems,
  roleLabel,
  userFullName,
  userEmail,
  clinicName,
  clinicLogoUrl = null,
  aiUnits = null,
}: AppSidebarProps) {
  const pathname = usePathname();
  const { hasUnresolved } = useEscalationAlerts();
  const { state, toggleSidebar, isMobile, setOpenMobile } = useSidebar();
  const collapsed = state === "collapsed" && !isMobile;

  const initials = userFullName
    .split(" ")
    .slice(0, 2)
    .map((n) => n[0])
    .join("");

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

  // The mobile drawer is a modal Sheet — close it once a destination is picked.
  const onNavigate = () => {
    if (isMobile) setOpenMobile(false);
  };

  return (
    <Sidebar side="right" collapsible="icon" className="border-white/5">
      {/* Clinic identity — this host's clinic, not the platform brand. */}
      <SidebarHeader
        className="h-16 flex-row items-center gap-3 border-b border-white/10 px-4 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0"
        title={collapsed ? clinicName : undefined}
      >
        {clinicLogoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={clinicLogoUrl}
            alt={clinicName}
            className="h-9 w-9 shrink-0 rounded-xl object-cover"
          />
        ) : (
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent/20">
            <Stethoscope className="h-5 w-5 text-accent" />
          </div>
        )}
        <span
          className={cn(
            "truncate font-heading text-lg font-bold tracking-wide text-white",
            HIDE_COLLAPSED
          )}
        >
          {clinicName}
        </span>
      </SidebarHeader>

      <SidebarContent className="gap-0">
        {/* Role badge */}
        <div className={cn("px-4 pb-2 pt-4", HIDE_COLLAPSED)}>
          <Badge className="bg-accent/20 text-accent">{roleLabel}</Badge>
        </div>

        {/* AI unit meter — admin only. Rendered here rather than in a page so the
            clinic always knows what it has left, from wherever it is working.
            Reflects the count at page load; the usage report is the live view. */}
        {aiUnits && <AiUnitsPill units={aiUnits} collapsed={collapsed} onNavigate={onNavigate} />}

        {/* Nav items */}
        <SidebarGroup className="px-2 py-2 group-data-[collapsible=icon]:items-center">
          <SidebarMenu className="gap-0.5">
            {navItems.map((item) =>
              item.children && item.children.length > 0 ? (
                <NavGroup
                  key={item.href}
                  item={item}
                  collapsed={collapsed}
                  isHrefActive={isHrefActive}
                  onExpandRail={toggleSidebar}
                  onNavigate={onNavigate}
                />
              ) : (
                <NavLeaf
                  key={item.href}
                  item={item}
                  active={isHrefActive(item.href)}
                  showAlert={item.href.endsWith("/admin/messages") && hasUnresolved}
                  onNavigate={onNavigate}
                />
              )
            )}
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>

      {/* Bottom: user info + sign out + collapse toggle */}
      <SidebarFooter className="gap-1 border-t border-white/10 p-3 group-data-[collapsible=icon]:items-center">
        <div className="flex items-center gap-3 rounded-xl px-2 py-2 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent/30">
            <span className="font-sans text-xs font-bold text-accent">{initials}</span>
          </div>
          <div className={cn("overflow-hidden", HIDE_COLLAPSED)}>
            <p className="truncate font-sans text-sm font-medium leading-tight text-white">
              {userFullName}
            </p>
            <p className="truncate font-sans text-xs text-white/40" dir="ltr">
              {userEmail}
            </p>
          </div>
        </div>

        <SidebarMenu>
          <SidebarMenuItem>
            <form action={signOut}>
              <SidebarMenuButton
                type="submit"
                tooltip="تسجيل الخروج"
                className={cn(NAV_BUTTON, "text-white/60 hover:bg-red-500/15 hover:text-red-400")}
              >
                <span className="shrink-0">
                  <LogOut className="size-5" />
                </span>
                <span>تسجيل الخروج</span>
              </SidebarMenuButton>
            </form>
          </SidebarMenuItem>

          {/* Collapse toggle (desktop only) */}
          <SidebarMenuItem className="hidden md:block">
            <SidebarMenuButton
              onClick={toggleSidebar}
              tooltip="توسيع القائمة"
              className={cn(
                NAV_BUTTON,
                "h-9 text-xs text-white/30 hover:bg-white/5 hover:text-white/60"
              )}
            >
              <ChevronRight
                className={cn(
                  "size-4 shrink-0 transition-transform duration-300",
                  collapsed ? "rotate-180" : "rotate-0"
                )}
              />
              <span>طي القائمة</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  );
}

/**
 * The clinic's remaining AI replies, always in view. Links to the usage report
 * so "I'm running low" leads straight to "here's where they went". On the
 * collapsed rail it shrinks to the bare icon, with the count in the tooltip.
 */
function AiUnitsPill({
  units,
  collapsed,
  onNavigate,
}: {
  units: AiUnitsBadge;
  collapsed: boolean;
  onNavigate: () => void;
}) {
  const tone = !units.sufficient
    ? "border-red-400/40 bg-red-500/15 text-red-300 hover:text-red-300"
    : units.low
      ? "border-amber-400/40 bg-amber-400/15 text-amber-300 hover:text-amber-300"
      : "border-white/10 bg-white/5 text-white/70 hover:text-white/70";

  const title = !units.sufficient
    ? "نفدت وحدات المساعد الذكي — توقّف الرد الآلي"
    : `${units.balance.toLocaleString("ar-EG")} وحدة متبقية للمساعد الذكي`;

  return (
    <SidebarGroup className="px-4 pb-1 pt-2 group-data-[collapsible=icon]:items-center group-data-[collapsible=icon]:px-2">
      <SidebarMenu>
        <SidebarMenuItem>
          <SidebarMenuButton
            asChild
            tooltip={title}
            className={cn(
              "h-auto gap-2 rounded-xl border px-2.5 py-2 font-sans hover:bg-white/10",
              "group-data-[collapsible=icon]:!size-10 group-data-[collapsible=icon]:!p-2.5",
              tone
            )}
          >
            <Link href="/admin/ai/usage" title={collapsed ? undefined : title} onClick={onNavigate}>
              <Coins className="size-4 shrink-0" />
              <span className="flex min-w-0 flex-1 items-baseline justify-between gap-2">
                <span className="truncate text-xs opacity-80">وحدات المساعد</span>
                <span className="font-heading text-sm font-bold">
                  {units.balance.toLocaleString("ar-EG")}
                </span>
              </span>
            </Link>
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
    </SidebarGroup>
  );
}

/** A single top-level navigable row. */
function NavLeaf({
  item,
  active,
  showAlert = false,
  onNavigate,
}: {
  item: NavItem;
  active: boolean;
  showAlert?: boolean;
  onNavigate: () => void;
}) {
  const { href, label, icon: Icon } = item;
  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        asChild
        isActive={active}
        tooltip={showAlert ? `${label} — يوجد طلب تصعيد غير محلول` : label}
        className={NAV_BUTTON}
      >
        <Link href={href} onClick={onNavigate}>
          <span className="relative shrink-0">
            <Icon className={navIconClass(active)} />
            {showAlert && (
              <span className="absolute -end-1 -top-1 flex h-2.5 w-2.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
                <span className="relative inline-flex h-2.5 w-2.5 rounded-full border border-primary bg-red-500" />
              </span>
            )}
          </span>
          <span>{label}</span>
        </Link>
      </SidebarMenuButton>
      {showAlert && (
        <SidebarMenuBadge className="!top-2.5 text-red-400">
          <Bell className="h-3.5 w-3.5" />
        </SidebarMenuBadge>
      )}
    </SidebarMenuItem>
  );
}

/** A parent row with children — expands to reveal its sub-items. */
function NavGroup({
  item,
  collapsed,
  isHrefActive,
  onExpandRail,
  onNavigate,
}: {
  item: NavItem;
  collapsed: boolean;
  isHrefActive: (href: string) => boolean;
  onExpandRail: () => void;
  onNavigate: () => void;
}) {
  const { label, icon: Icon, children = [] } = item;
  const childActive = children.some((c) => isHrefActive(c.href));
  // Auto-open when a child is active; let the user override afterwards.
  const [manualOpen, setManualOpen] = useState<boolean | null>(null);
  const open = manualOpen ?? childActive;

  return (
    <Collapsible
      asChild
      open={open}
      onOpenChange={(next) => {
        // On the collapsed rail there's no room for children — expand the rail
        // first so they become visible.
        if (collapsed) {
          onExpandRail();
          setManualOpen(true);
          return;
        }
        setManualOpen(next);
      }}
    >
      <SidebarMenuItem>
        <CollapsibleTrigger asChild>
          <SidebarMenuButton isActive={childActive} tooltip={label} className={NAV_BUTTON}>
            <span className="shrink-0">
              <Icon className={navIconClass(childActive)} />
            </span>
            <span className="flex-1 truncate text-start">{label}</span>
            <ChevronDown
              className={cn(
                "size-4 shrink-0 transition-transform duration-200",
                open ? "rotate-180" : "rotate-0"
              )}
            />
          </SidebarMenuButton>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <SidebarMenuSub className="me-0 ms-5 mt-0.5 gap-0.5 border-white/10 pe-0">
            {children.map((child) => {
              const active = isHrefActive(child.href);
              const ChildIcon = child.icon;
              return (
                <SidebarMenuSubItem key={child.href}>
                  <SidebarMenuSubButton
                    asChild
                    isActive={active}
                    className={cn(
                      "group/nav h-9 gap-3 rounded-xl px-3 font-sans text-white/70",
                      "hover:bg-white/[0.08] hover:text-white",
                      "data-[active=true]:bg-accent/15 data-[active=true]:font-medium data-[active=true]:text-accent",
                      // Override shadcn's forced icon color on sub-items.
                      "[&>svg]:text-white/50 hover:[&>svg]:text-white/80 data-[active=true]:[&>svg]:text-accent"
                    )}
                  >
                    <Link href={child.href} onClick={onNavigate}>
                      <ChildIcon className="transition-colors" />
                      <span>{child.label}</span>
                    </Link>
                  </SidebarMenuSubButton>
                </SidebarMenuSubItem>
              );
            })}
          </SidebarMenuSub>
        </CollapsibleContent>
      </SidebarMenuItem>
    </Collapsible>
  );
}
