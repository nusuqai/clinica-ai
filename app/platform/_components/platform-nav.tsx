"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  ClipboardList,
  Building2,
  Wallet,
  LogOut,
  Menu,
  X,
  type LucideIcon,
} from "lucide-react";
import { signOut } from "@/server/actions/auth";

interface NavLink {
  href: string;
  label: string;
  icon: LucideIcon;
  badge?: number;
}

interface Props {
  email: string;
  pendingRequests: number;
}

export default function PlatformNav({ email, pendingRequests }: Props) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const links: NavLink[] = [
    { href: "/platform", label: "نظرة عامة", icon: LayoutDashboard },
    {
      href: "/platform/requests",
      label: "الطلبات",
      icon: ClipboardList,
      badge: pendingRequests,
    },
    { href: "/platform/clinics", label: "العيادات", icon: Building2 },
    { href: "/platform/credits", label: "الأرصدة والتكاليف", icon: Wallet },
  ];

  // "/platform" must match exactly (it's a prefix of every other link);
  // the rest match on prefix so nested pages keep the parent highlighted.
  const isActive = (href: string) =>
    href === "/platform" ? pathname === href : pathname.startsWith(href);

  return (
    <header className="sticky top-0 z-30 border-b border-border bg-card/95 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 md:px-6">
        {/* Brand */}
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-white">
            <LayoutDashboard className="h-4 w-4" />
          </div>
          <div className="leading-tight">
            <p className="font-heading text-sm font-bold text-foreground">
              Nusuq
            </p>
            <p className="text-[11px] text-muted-foreground">لوحة المنصة</p>
          </div>
        </div>

        {/* Desktop nav */}
        <nav className="hidden items-center gap-1 md:flex">
          {links.map((link) => (
            <NavPill key={link.href} link={link} active={isActive(link.href)} />
          ))}
        </nav>

        {/* User + logout (desktop) */}
        <div className="hidden items-center gap-3 md:flex">
          <span
            className="max-w-[180px] truncate text-xs text-muted-foreground"
            dir="ltr"
            title={email}
          >
            {email}
          </span>
          <form action={signOut}>
            <button
              type="submit"
              className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:border-red-500/40 hover:bg-red-500/10 hover:text-red-600"
            >
              <LogOut className="h-4 w-4" />
              تسجيل الخروج
            </button>
          </form>
        </div>

        {/* Mobile toggle */}
        <button
          onClick={() => setOpen((v) => !v)}
          className="rounded-lg p-2 text-muted-foreground hover:bg-muted md:hidden"
          aria-label="القائمة"
        >
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {/* Mobile menu */}
      {open && (
        <div className="border-t border-border bg-card px-4 py-3 md:hidden">
          <nav className="flex flex-col gap-1">
            {links.map((link) => (
              <NavPill
                key={link.href}
                link={link}
                active={isActive(link.href)}
                onClick={() => setOpen(false)}
                block
              />
            ))}
          </nav>
          <div className="mt-3 flex items-center justify-between border-t border-border pt-3">
            <span className="max-w-[180px] truncate text-xs text-muted-foreground" dir="ltr">
              {email}
            </span>
            <form action={signOut}>
              <button
                type="submit"
                className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:border-red-500/40 hover:bg-red-500/10 hover:text-red-600"
              >
                <LogOut className="h-4 w-4" />
                تسجيل الخروج
              </button>
            </form>
          </div>
        </div>
      )}
    </header>
  );
}

function NavPill({
  link,
  active,
  onClick,
  block,
}: {
  link: NavLink;
  active: boolean;
  onClick?: () => void;
  block?: boolean;
}) {
  const { href, label, icon: Icon, badge } = link;
  return (
    <Link
      href={href}
      onClick={onClick}
      className={[
        "relative inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-sans transition-colors",
        block ? "w-full" : "",
        active
          ? "bg-primary/10 text-primary"
          : "text-muted-foreground hover:bg-muted hover:text-foreground",
      ].join(" ")}
    >
      <Icon className="h-4 w-4 flex-shrink-0" />
      <span>{label}</span>
      {badge != null && badge > 0 && (
        <span className="ms-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1.5 text-[11px] font-medium text-white">
          {badge}
        </span>
      )}
    </Link>
  );
}
