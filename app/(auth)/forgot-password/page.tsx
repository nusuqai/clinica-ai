"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Mail, Loader2, ArrowLeft, CheckCircle2 } from "lucide-react";
import { forgotPassword } from "@/server/actions/auth";

export default function ForgotPasswordPage() {
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [isPending, startTransition] = useTransition();

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      const result = await forgotPassword(formData);
      if (result?.error) setError(result.error);
      else setSent(true);
    });
  }

  if (sent) {
    return (
      <div className="relative z-10 w-full max-w-md text-center">
        <div className="mb-6 flex justify-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-accent/10">
            <CheckCircle2 className="h-8 w-8 text-accent" />
          </div>
        </div>
        <h1 className="mb-3 font-heading text-2xl font-bold text-primary">
          تحقّق من بريدك الإلكتروني
        </h1>
        <p className="mb-8 font-sans text-sm leading-relaxed text-text/50">
          إن كان هناك حساب مرتبط بهذا البريد، فقد أرسلنا إليه رابطاً لإعادة تعيين كلمة المرور. تحقّق
          من صندوق الوارد (ومجلد الرسائل غير المرغوبة).
        </p>
        <Link
          href="/login"
          className="inline-flex items-center gap-1.5 font-sans text-sm font-medium text-primary transition-colors hover:text-primary/70"
        >
          <ArrowLeft className="h-4 w-4" />
          العودة لتسجيل الدخول
        </Link>
      </div>
    );
  }

  return (
    <div className="relative z-10 w-full max-w-md">
      <div className="mb-8 flex justify-center lg:hidden">
        <img src="/logo.png" alt="Clinica AI" className="h-12 w-auto object-contain" />
      </div>

      <div className="mb-8">
        <h1 className="mb-2 font-heading text-3xl font-bold text-primary">نسيت كلمة المرور؟</h1>
        <p className="font-sans text-sm text-text/50">
          أدخل بريدك الإلكتروني وسنرسل لك رابطاً لإعادة التعيين
        </p>
      </div>

      {error && (
        <div className="mb-6 flex items-start gap-3 rounded-2xl border border-red-100 bg-red-50 px-4 py-3 font-sans text-sm text-red-600">
          <span className="mt-0.5 flex-shrink-0">⚠</span>
          <span>{error}</span>
        </div>
      )}

      <form className="space-y-5" onSubmit={handleSubmit}>
        <div className="space-y-1.5">
          <label className="block font-sans text-sm font-medium text-text/70">
            البريد الإلكتروني
          </label>
          <div className="relative">
            <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-4">
              <Mail className="h-4.5 w-4.5 text-text/30" />
            </div>
            <input
              name="email"
              type="email"
              required
              dir="ltr"
              className="block w-full rounded-2xl border border-text/10 bg-white py-3.5 pl-4 pr-11 text-right font-sans text-sm transition-all placeholder:text-text/30 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/40"
              placeholder="name@example.com"
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={isPending}
          className="mt-2 flex w-full items-center justify-center gap-2.5 rounded-2xl bg-primary px-4 py-3.5 font-sans text-sm font-semibold text-white shadow-lg shadow-primary/20 transition-all duration-200 hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isPending ? (
            <Loader2 className="w-4.5 h-4.5 animate-spin" />
          ) : (
            <Mail className="w-4.5 h-4.5" />
          )}
          {isPending ? "جارٍ الإرسال..." : "إرسال رابط إعادة التعيين"}
        </button>
      </form>

      <div className="mt-8 text-center">
        <Link
          href="/login"
          className="inline-flex items-center gap-1.5 font-sans text-xs text-text/30 transition-colors hover:text-text/60"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          العودة لتسجيل الدخول
        </Link>
      </div>
    </div>
  );
}
