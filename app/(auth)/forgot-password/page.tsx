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
      <div className="w-full max-w-md relative z-10 text-center">
        <div className="flex justify-center mb-6">
          <div className="w-16 h-16 rounded-2xl bg-accent/10 flex items-center justify-center">
            <CheckCircle2 className="w-8 h-8 text-accent" />
          </div>
        </div>
        <h1 className="text-2xl font-heading font-bold text-primary mb-3">
          تحقّق من بريدك الإلكتروني
        </h1>
        <p className="text-text/50 font-sans text-sm leading-relaxed mb-8">
          إن كان هناك حساب مرتبط بهذا البريد، فقد أرسلنا إليه رابطاً لإعادة تعيين
          كلمة المرور. تحقّق من صندوق الوارد (ومجلد الرسائل غير المرغوبة).
        </p>
        <Link
          href="/login"
          className="inline-flex items-center gap-1.5 text-sm text-primary hover:text-primary/70 transition-colors font-sans font-medium"
        >
          <ArrowLeft className="w-4 h-4" />
          العودة لتسجيل الدخول
        </Link>
      </div>
    );
  }

  return (
    <div className="w-full max-w-md relative z-10">
      <div className="flex justify-center mb-8 lg:hidden">
        <img src="/logo.png" alt="Clinica AI" className="h-12 w-auto object-contain" />
      </div>

      <div className="mb-8">
        <h1 className="text-3xl font-heading font-bold text-primary mb-2">
          نسيت كلمة المرور؟
        </h1>
        <p className="text-text/50 font-sans text-sm">
          أدخل بريدك الإلكتروني وسنرسل لك رابطاً لإعادة التعيين
        </p>
      </div>

      {error && (
        <div className="mb-6 flex items-start gap-3 bg-red-50 text-red-600 px-4 py-3 rounded-2xl text-sm font-sans border border-red-100">
          <span className="mt-0.5 flex-shrink-0">⚠</span>
          <span>{error}</span>
        </div>
      )}

      <form className="space-y-5" onSubmit={handleSubmit}>
        <div className="space-y-1.5">
          <label className="block text-sm font-medium text-text/70 font-sans">
            البريد الإلكتروني
          </label>
          <div className="relative">
            <div className="absolute inset-y-0 right-0 pr-4 flex items-center pointer-events-none">
              <Mail className="h-4.5 w-4.5 text-text/30" />
            </div>
            <input
              name="email"
              type="email"
              required
              dir="ltr"
              className="block w-full pr-11 pl-4 py-3.5 font-sans text-sm border border-text/10 rounded-2xl focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent bg-white text-right placeholder:text-text/30 transition-all"
              placeholder="name@example.com"
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={isPending}
          className="w-full flex justify-center items-center gap-2.5 py-3.5 px-4 rounded-2xl text-sm font-semibold text-white bg-primary hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary transition-all duration-200 disabled:opacity-60 disabled:cursor-not-allowed font-sans mt-2 shadow-lg shadow-primary/20"
        >
          {isPending ? (
            <Loader2 className="animate-spin w-4.5 h-4.5" />
          ) : (
            <Mail className="w-4.5 h-4.5" />
          )}
          {isPending ? "جارٍ الإرسال..." : "إرسال رابط إعادة التعيين"}
        </button>
      </form>

      <div className="mt-8 text-center">
        <Link
          href="/login"
          className="inline-flex items-center gap-1.5 text-xs text-text/30 hover:text-text/60 transition-colors font-sans"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          العودة لتسجيل الدخول
        </Link>
      </div>
    </div>
  );
}
