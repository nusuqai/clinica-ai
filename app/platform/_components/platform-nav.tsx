"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  ClipboardList,
  Building2,
  MessageCircle,
  BookOpen,
  Wallet,
  LogOut,
  Menu,
  type LucideIcon,
} from "lucide-react";
import { signOut } from "@/server/actions/auth";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import {
  NavigationMenu,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  navigationMenuTriggerStyle,
} from "@/components/ui/navigation-menu";
import { Sheet, SheetClose, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";

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

  const links: NavLink[] = [
    { href: "/platform", label: "نظرة عامة", icon: LayoutDashboard },
    {
      href: "/platform/requests",
      label: "الطلبات",
      icon: ClipboardList,
      badge: pendingRequests,
    },
    { href: "/platform/clinics", label: "العيادات", icon: Building2 },
    { href: "/platform/whatsapp", label: "واتساب", icon: MessageCircle },
    { href: "/platform/knowledge", label: "قاعدة المعرفة", icon: BookOpen },
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
            <p className="font-heading text-sm font-bold text-foreground">Nusuq</p>
            <p className="text-[11px] text-muted-foreground">لوحة المنصة</p>
          </div>
        </div>

        {/* Desktop nav */}
        <NavigationMenu className="hidden md:flex">
          <NavigationMenuList>
            {links.map((link) => (
              <NavigationMenuItem key={link.href}>
                <NavPill link={link} active={isActive(link.href)} />
              </NavigationMenuItem>
            ))}
          </NavigationMenuList>
        </NavigationMenu>

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
            <Button
              type="submit"
              variant="outline"
              size="sm"
              className="text-sm text-muted-foreground hover:border-red-500/40 hover:bg-red-500/10 hover:text-red-600"
            >
              <LogOut />
              تسجيل الخروج
            </Button>
          </form>
        </div>

        {/* Mobile menu — a drawer from the hamburger's side (left, on this RTL page). */}
        <Sheet>
          <SheetTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="md:hidden [&_svg]:size-5"
              aria-label="القائمة"
            >
              <Menu />
            </Button>
          </SheetTrigger>
          <SheetContent
            side="left"
            aria-describedby={undefined}
            className="flex w-72 flex-col border-border bg-card p-4 pt-14"
          >
            <SheetTitle className="sr-only">القائمة</SheetTitle>
            <nav className="flex flex-col gap-1">
              {links.map((link) => (
                <SheetClose asChild key={link.href}>
                  <NavPill link={link} active={isActive(link.href)} block />
                </SheetClose>
              ))}
            </nav>
            <div className="mt-auto flex flex-col gap-3 border-t border-border pt-3">
              <span className="truncate text-xs text-muted-foreground" dir="ltr">
                {email}
              </span>
              <form action={signOut}>
                <Button
                  type="submit"
                  variant="outline"
                  size="sm"
                  className="w-full text-sm text-muted-foreground hover:border-red-500/40 hover:bg-red-500/10 hover:text-red-600"
                >
                  <LogOut />
                  تسجيل الخروج
                </Button>
              </form>
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </header>
  );
}

/**
 * A section link. On the desktop bar it's a NavigationMenuLink; in the mobile
 * drawer (`block`) it's a plain Link — NavigationMenuLink needs the menu's
 * focus-group context, which the drawer doesn't have. Both mark the active page
 * with `data-active`, so they share one style.
 */
function NavPill({
  link,
  active,
  block,
  ...props
}: {
  link: NavLink;
  active: boolean;
  block?: boolean;
} & Omit<React.ComponentProps<typeof Link>, "href">) {
  const { href, label, icon: Icon, badge } = link;
  const anchor = (
    <Link
      href={href}
      {...props}
      data-active={block && active ? "" : undefined}
      aria-current={block && active ? "page" : undefined}
      className={cn(
        navigationMenuTriggerStyle(),
        "relative gap-2 px-3 font-normal text-muted-foreground",
        "data-[active]:bg-primary/10 data-[active]:text-primary",
        block && "w-full justify-start"
      )}
    >
      <Icon className="h-4 w-4 flex-shrink-0" />
      <span>{label}</span>
      {badge != null && badge > 0 && (
        <Badge className="ms-1 h-5 min-w-5 justify-center bg-red-500 px-1.5 text-[11px] text-white">
          {badge}
        </Badge>
      )}
    </Link>
  );
  if (block) return anchor;
  return (
    <NavigationMenuLink asChild active={active}>
      {anchor}
    </NavigationMenuLink>
  );
}
