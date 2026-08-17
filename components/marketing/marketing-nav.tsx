"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Stethoscope, Menu, X } from "lucide-react";

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
          <span className="font-heading text-xl font-bold text-white">
            ClinicaAI
          </span>
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
            <Link
              href={continueHref}
              className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90"
            >
              الانتقال إلى عيادتي
            </Link>
          ) : (
            <>
              <a
                href="#request"
                className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90"
              >
                أنشئ عيادتك
              </a>
            </>
          )}
        </div>

        <button
          className="text-white md:hidden"
          onClick={() => setMenuOpen((v) => !v)}
          aria-label="القائمة"
        >
          {menuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
        </button>
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
              <Link
                href={continueHref}
                className="rounded-lg bg-accent px-4 py-2 text-center text-sm font-medium text-white"
              >
                الانتقال إلى عيادتي
              </Link>
            ) : (
              <div className="flex flex-col gap-2">
                <Link
                  href="/login"
                  className="rounded-lg border border-white/30 px-4 py-2 text-center text-sm font-medium text-white"
                >
                  تسجيل الدخول
                </Link>
                <a
                  href="#request"
                  className="rounded-lg bg-accent px-4 py-2 text-center text-sm font-medium text-white"
                  onClick={() => setMenuOpen(false)}
                >
                  أنشئ عيادتك
                </a>
              </div>
            )}
          </div>
        </div>
      )}
    </header>
  );
}
