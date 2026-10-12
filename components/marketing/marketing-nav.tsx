"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Stethoscope, Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DARK_NAV_LINK } from "@/components/landing/landing-nav";
import {
  NavigationMenu,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
} from "@/components/ui/navigation-menu";
import { Sheet, SheetClose, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";

interface Props {
  isAuthenticated: boolean;
  /** Where a signed-in user continues (their clinic or /platform). */
  continueHref: string;
}

const LINKS = [
  { href: "#features", label: "المميزات" },
  { href: "#faq", label: "الأسئلة الشائعة" },
];

export function MarketingNav({ isAuthenticated, continueHref }: Props) {
  const [scrolled, setScrolled] = useState(false);

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
        <Link href="/" className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent">
            <Stethoscope className="h-5 w-5 text-white" />
          </div>
          <span className="font-heading text-xl font-bold text-white">ClinicaAI</span>
        </Link>

        <NavigationMenu className="hidden md:flex">
          <NavigationMenuList>
            {LINKS.map((l) => (
              <NavigationMenuItem key={l.href}>
                <NavigationMenuLink asChild className={DARK_NAV_LINK}>
                  <a href={l.href}>{l.label}</a>
                </NavigationMenuLink>
              </NavigationMenuItem>
            ))}
          </NavigationMenuList>
        </NavigationMenu>

        <div className="hidden items-center gap-3 md:flex">
          {isAuthenticated ? (
            <Button
              asChild
              variant="accent"
              className="h-auto rounded-lg px-4 py-2 text-sm transition-opacity hover:opacity-90"
            >
              <Link href={continueHref}>الانتقال إلى عيادتي</Link>
            </Button>
          ) : (
            <>
              <Button
                asChild
                variant="accent"
                className="h-auto rounded-lg px-4 py-2 text-sm transition-opacity hover:opacity-90"
              >
                <a href="#request">أنشئ عيادتك</a>
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
              {LINKS.map((l) => (
                <SheetClose asChild key={l.href}>
                  <a
                    href={l.href}
                    className="rounded-lg px-3 py-2.5 font-sans text-sm text-white/80 transition-colors hover:bg-white/10 hover:text-accent"
                  >
                    {l.label}
                  </a>
                </SheetClose>
              ))}
              <div className="mt-4 flex flex-col gap-2 border-t border-white/10 pt-4">
                {isAuthenticated ? (
                  <Button asChild variant="accent" className="h-auto rounded-lg px-4 py-2 text-sm">
                    <Link href={continueHref}>الانتقال إلى عيادتي</Link>
                  </Button>
                ) : (
                  <>
                    <Button
                      asChild
                      variant="outline"
                      className="h-auto rounded-lg border-white/30 bg-transparent px-4 py-2 text-center text-sm text-white hover:bg-transparent"
                    >
                      <Link href="/login">تسجيل الدخول</Link>
                    </Button>
                    <SheetClose asChild>
                      <Button
                        asChild
                        variant="accent"
                        className="h-auto rounded-lg px-4 py-2 text-center text-sm"
                      >
                        <a href="#request">أنشئ عيادتك</a>
                      </Button>
                    </SheetClose>
                  </>
                )}
              </div>
            </nav>
          </SheetContent>
        </Sheet>
      </nav>
    </header>
  );
}
