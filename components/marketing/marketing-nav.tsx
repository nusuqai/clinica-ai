"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Stethoscope, Menu, X } from "lucide-react";
import { Button } from "@/components/ui/button";

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
  const [menuOpen, setMenuOpen] = useState(false);

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

        <div className="hidden items-center gap-8 md:flex">
          {LINKS.map((l) => (
            <a
              key={l.href}
              href={l.href}
              className="font-sans text-sm text-white/80 transition-colors hover:text-accent"
            >
              {l.label}
            </a>
          ))}
        </div>

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

        <Button
          variant="ghost"
          size="icon"
          className="text-white hover:bg-white/10 hover:text-white md:hidden [&_svg]:size-6"
          onClick={() => setMenuOpen((v) => !v)}
          aria-label="القائمة"
        >
          {menuOpen ? <X /> : <Menu />}
        </Button>
      </nav>

      {menuOpen && (
        <div className="border-t border-white/10 bg-primary px-6 py-4 md:hidden">
          <div className="flex flex-col gap-4">
            {LINKS.map((l) => (
              <a
                key={l.href}
                href={l.href}
                className="font-sans text-sm text-white/80 hover:text-accent"
                onClick={() => setMenuOpen(false)}
              >
                {l.label}
              </a>
            ))}
            {isAuthenticated ? (
              <Button
                asChild
                variant="accent"
                className="h-auto rounded-lg px-4 py-2 text-center text-sm"
              >
                <Link href={continueHref}>الانتقال إلى عيادتي</Link>
              </Button>
            ) : (
              <div className="flex flex-col gap-2">
                <Button
                  asChild
                  variant="outline"
                  className="h-auto rounded-lg border-white/30 bg-transparent px-4 py-2 text-center text-sm text-white hover:bg-transparent"
                >
                  <Link href="/login">تسجيل الدخول</Link>
                </Button>
                <Button
                  asChild
                  variant="accent"
                  className="h-auto rounded-lg px-4 py-2 text-center text-sm"
                >
                  <a
                    href="#request"

                    onClick={() => setMenuOpen(false)}
                  >
                    أنشئ عيادتك
                  </a>
                </Button>
              </div>
            )}
          </div>
        </div>
      )}
    </header>
  );
}
