"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Menu, UserRound } from "lucide-react";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  NavigationMenu,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  navigationMenuTriggerStyle,
} from "@/components/ui/navigation-menu";
import { Sheet, SheetClose, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Hint } from "@/components/ui/tooltip";
import { ClinicLogo } from "@/components/general/clinic-logo";

/** Nav link styling on the dark (navy / transparent-over-hero) bar. */
export const DARK_NAV_LINK = cn(
  navigationMenuTriggerStyle(),
  "font-normal text-white/80 hover:bg-white/10 hover:text-accent focus:bg-white/10 focus:text-accent"
);

/** Round avatar (the patient's initials) that opens their profile page. */
function ProfileAvatar({ name }: { name: string | null }) {
  const initials =
    (name ?? "")
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((w) => w[0])
      .join("") || null;
  return (
    <Hint label="الملف الشخصي" side="bottom" className="bg-white text-primary shadow-md">
      <Link href="/profile" aria-label="الملف الشخصي" className="group rounded-full">
        <Avatar className="h-9 w-9 border-2 border-white/30 transition-colors group-hover:border-accent">
          <AvatarFallback className="bg-white/10 font-heading text-sm font-bold text-white transition-colors group-hover:bg-accent">
            {initials ?? <UserRound className="h-4 w-4" />}
          </AvatarFallback>
        </Avatar>
      </Link>
    </Hint>
  );
}

interface LandingNavProps {
  isAuthenticated: boolean;
  isPatient: boolean;
  /** Signed-in patient's name — shown as the avatar linking to /profile. */
  userName?: string | null;
  /** Signed-in patient's dashboard URL (their clinic). */
  dashboardHref?: string;
  /** Brand shown in the nav (defaults to the product name). */
  brandName?: string;
  /** Where the logo/home link points (a clinic landing when scoped). */
  homeHref?: string;
  /** Auth links — clinic-scoped on a per-clinic landing. */
  loginHref?: string;
  registerHref?: string;
  /** Clinic logo shown instead of the default icon, when provided. */
  logoUrl?: string | null;
}

export function LandingNav({
  isAuthenticated,
  isPatient,
  userName = null,
  dashboardHref = "/",
  brandName = "ClinicaAI",
  homeHref = "/",
  loginHref = "/login",
  registerHref = "/register",
  logoUrl = null,
}: LandingNavProps) {
  const [scrolled, setScrolled] = useState(false);

  const links = [
    ...(isAuthenticated && isPatient ? [{ href: "#my-appointments", label: "مواعيدي" }] : []),
    { href: "#doctors", label: "الأطباء" },
    { href: "#book", label: "احجز موعد" },
  ];

  useEffect(() => {
    const handler = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", handler, { passive: true });
    return () => window.removeEventListener("scroll", handler);
  }, []);

  return (
    <header
      className={`fixed inset-x-0 top-0 z-50 transition-all duration-300 ${
        scrolled ? "bg-primary/95 shadow-lg backdrop-blur-md" : "bg-transparent"
      }`}
    >
      <nav className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
        {/* Logo */}
        <Link href={homeHref} className="flex items-center gap-2">
          <ClinicLogo src={logoUrl} name={brandName} />
          <span className="font-heading text-xl font-bold text-white">{brandName}</span>
        </Link>

        {/* Desktop links */}
        <NavigationMenu className="hidden md:flex">
          <NavigationMenuList>
            {links.map((l) => (
              <NavigationMenuItem key={l.href}>
                <NavigationMenuLink asChild className={DARK_NAV_LINK}>
                  <a href={l.href}>{l.label}</a>
                </NavigationMenuLink>
              </NavigationMenuItem>
            ))}
          </NavigationMenuList>
        </NavigationMenu>

        {/* Auth buttons */}
        <div className="hidden items-center gap-3 md:flex">
          {isAuthenticated && isPatient ? (
            // A patient's home is this landing page, so there's no separate
            // dashboard to link to — just their profile.
            <ProfileAvatar name={userName} />
          ) : isAuthenticated ? (
            <Button
              asChild
              variant="accent"
              className="h-auto rounded-lg px-4 py-2 text-sm transition-opacity hover:opacity-90"
            >
              <Link href={dashboardHref}>لوحة التحكم</Link>
            </Button>
          ) : (
            <>
              <Button
                asChild
                variant="outline"
                className="h-auto rounded-lg border-white/30 bg-transparent px-4 py-2 text-sm text-white hover:border-accent hover:bg-transparent hover:text-accent"
              >
                <Link href={loginHref}>تسجيل الدخول</Link>
              </Button>
              <Button
                asChild
                variant="accent"
                className="h-auto rounded-lg px-4 py-2 text-sm transition-opacity hover:opacity-90"
              >
                <Link href={registerHref}>إنشاء حساب</Link>
              </Button>
            </>
          )}
        </div>

        {/* Mobile menu — a drawer from the hamburger's side (left, on this RTL page). */}
        <Sheet>
          <SheetTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="text-white hover:bg-white/10 hover:text-white md:hidden [&_svg]:size-6"
              aria-label="القائمة"
            >
              <Menu />
            </Button>
          </SheetTrigger>
          <SheetContent
            side="left"
            aria-describedby={undefined}
            className="w-72 border-0 bg-primary p-6 pt-14 text-white [&>button]:text-white"
          >
            <SheetTitle className="sr-only">القائمة</SheetTitle>
            <nav className="flex flex-col gap-1">
              {links.map((l) => (
                <SheetClose asChild key={l.href}>
                  <a
                    href={l.href}
                    className={cn(
                      "rounded-lg px-3 py-2.5 font-sans text-sm text-white/80 transition-colors hover:bg-white/10 hover:text-accent",
                      l.href === "#my-appointments" && "font-medium text-accent"
                    )}
                  >
                    {l.label}
                  </a>
                </SheetClose>
              ))}
              {isAuthenticated && isPatient ? (
                <SheetClose asChild>
                  <Link
                    href="/profile"
                    className="flex items-center gap-2 rounded-lg px-3 py-2.5 font-sans text-sm text-white/80 transition-colors hover:bg-white/10 hover:text-accent"
                  >
                    <UserRound className="h-4 w-4" />
                    الملف الشخصي
                  </Link>
                </SheetClose>
              ) : !isAuthenticated ? (
                <div className="mt-4 flex flex-col gap-2 border-t border-white/10 pt-4">
                  <Button
                    asChild
                    variant="outline"
                    className="h-auto rounded-lg border-white/30 bg-transparent px-4 py-2 text-center text-sm text-white hover:bg-transparent"
                  >
                    <Link href={loginHref}>تسجيل الدخول</Link>
                  </Button>
                  <Button
                    asChild
                    variant="accent"
                    className="h-auto rounded-lg px-4 py-2 text-center text-sm"
                  >
                    <Link href={registerHref}>إنشاء حساب</Link>
                  </Button>
                </div>
              ) : (
                <div className="mt-4 border-t border-white/10 pt-4">
                  <Button
                    asChild
                    variant="accent"
                    className="h-auto w-full rounded-lg px-4 py-2 text-sm"
                  >
                    <Link href={dashboardHref}>لوحة التحكم</Link>
                  </Button>
                </div>
              )}
            </nav>
          </SheetContent>
        </Sheet>
      </nav>
    </header>
  );
}
