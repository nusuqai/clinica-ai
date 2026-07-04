import { Stethoscope } from "lucide-react";
import Link from "next/link";

export function FooterSection() {
  return (
    <footer className="bg-primary">
      <div className="mx-auto max-w-7xl px-6 py-12">
        <div className="flex flex-col items-center gap-6 text-center">
          {/* Logo */}
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent">
              <Stethoscope className="h-5 w-5 text-white" />
            </div>
            <span className="font-heading text-xl font-bold text-white">
              ClinicaAI
            </span>
          </div>

          {/* Tagline */}
          <p className="max-w-sm font-sans text-sm leading-relaxed text-white/50">
            منصة العيادة الذكية — احجز مواعيدك مع أفضل الأطباء بسهولة وأمان
          </p>

          {/* Links */}
          <div className="flex flex-wrap justify-center gap-6">
            <Link
              href="/login"
              className="font-sans text-sm text-white/50 transition-colors hover:text-accent"
            >
              تسجيل الدخول
            </Link>
            <Link
              href="/register"
              className="font-sans text-sm text-white/50 transition-colors hover:text-accent"
            >
              إنشاء حساب
            </Link>
            <a
              href="#doctors"
              className="font-sans text-sm text-white/50 transition-colors hover:text-accent"
            >
              الأطباء
            </a>
          </div>

          {/* Divider */}
          <div className="h-px w-full max-w-xs bg-white/10" />

          {/* Copyright */}
          <p className="font-sans text-xs text-white/30">
            © {new Date().getFullYear()} ClinicaAI — جميع الحقوق محفوظة
          </p>
        </div>
      </div>
    </footer>
  );
}
