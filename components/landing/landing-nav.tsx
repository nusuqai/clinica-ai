"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Stethoscope, Menu, X, UserRound } from "lucide-react";

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
    <Link
      href="/profile"
      title="الملف الشخصي"
      aria-label="الملف الشخصي"
      className="flex h-9 w-9 items-center justify-center rounded-full border-2 border-white/30 bg-white/10 font-heading text-sm font-bold text-white transition-colors hover:border-accent hover:bg-accent"
    >
      {initials ?? <UserRound className="h-4 w-4" />}
    </Link>
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
        {/* Logo */}
        <Link href={homeHref} className="flex items-center gap-2">
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoUrl} alt={brandName} className="h-9 w-9 rounded-xl object-cover" />
          ) : (
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent">
              <Stethoscope className="h-5 w-5 text-white" />
            </div>
          )}
          <span className="font-heading text-xl font-bold text-white">{brandName}</span>
        </Link>

        {/* Desktop links */}
        <div className="hidden items-center gap-8 md:flex">
          {isAuthenticated && isPatient && (
            <a
              href="#my-appointments"
              className="font-sans text-sm text-white/80 transition-colors hover:text-accent"
            >
              مواعيدي
            </a>
          )}
          <a
            href="#doctors"
            className="font-sans text-sm text-white/80 transition-colors hover:text-accent"
          >
            الأطباء
          </a>
          <a
            href="#book"
            className="font-sans text-sm text-white/80 transition-colors hover:text-accent"
          >
            احجز موعد
          </a>
        </div>

        {/* Auth buttons */}
        <div className="hidden items-center gap-3 md:flex">
          {isAuthenticated && isPatient ? (
            <>
              <Link
                href={dashboardHref}
                className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90"
              >
                لوحة تحكمي
              </Link>
              <ProfileAvatar name={userName} />
            </>
          ) : isAuthenticated ? (
            <Link
              href={dashboardHref}
              className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90"
            >
              لوحة التحكم
            </Link>
          ) : (
            <>
              <Link
                href={loginHref}
                className="rounded-lg border border-white/30 px-4 py-2 text-sm font-medium text-white transition-colors hover:border-accent hover:text-accent"
              >
                تسجيل الدخول
              </Link>
              <Link
                href={registerHref}
                className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90"
              >
                إنشاء حساب
              </Link>
            </>
          )}
        </div>

        {/* Mobile menu button */}
        <button
          className="text-white md:hidden"
          onClick={() => setMenuOpen((v) => !v)}
          aria-label="القائمة"
        >
          {menuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
        </button>
      </nav>

      {/* Mobile menu */}
      {menuOpen && (
        <div className="border-t border-white/10 bg-primary px-6 py-4 md:hidden">
          <div className="flex flex-col gap-4">
            {isAuthenticated && isPatient && (
              <a
                href="#my-appointments"
                className="font-sans text-sm font-medium text-accent"
                onClick={() => setMenuOpen(false)}
              >
                مواعيدي
              </a>
            )}
            <a
              href="#doctors"
              className="font-sans text-sm text-white/80 hover:text-accent"
              onClick={() => setMenuOpen(false)}
            >
              الأطباء
            </a>
            <a
              href="#book"
              className="font-sans text-sm text-white/80 hover:text-accent"
              onClick={() => setMenuOpen(false)}
            >
              احجز موعد
            </a>
            {isAuthenticated && isPatient ? (
              <>
                <Link
                  href="/profile"
                  className="flex items-center gap-2 font-sans text-sm text-white/80 hover:text-accent"
                >
                  <UserRound className="h-4 w-4" />
                  الملف الشخصي
                </Link>
                <Link
                  href={dashboardHref}
                  className="rounded-lg bg-accent px-4 py-2 text-center text-sm font-medium text-white"
                >
                  لوحة تحكمي
                </Link>
              </>
            ) : !isAuthenticated ? (
              <div className="flex flex-col gap-2">
                <Link
                  href={loginHref}
                  className="rounded-lg border border-white/30 px-4 py-2 text-center text-sm font-medium text-white"
                >
                  تسجيل الدخول
                </Link>
                <Link
                  href={registerHref}
                  className="rounded-lg bg-accent px-4 py-2 text-center text-sm font-medium text-white"
                >
                  إنشاء حساب
                </Link>
              </div>
            ) : null}
          </div>
        </div>
      )}
    </header>
  );
}
