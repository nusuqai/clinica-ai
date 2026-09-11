"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { Loader2, ArrowLeft, ShieldCheck, RotateCw } from "lucide-react";
import { verifyClinicSignup, resendClinicSignupOtp } from "@/server/actions/auth";

interface Props {
  slug: string;
  clinicName: string;
  email: string;
  /** Seconds left on the resend cooldown, from the DB (0 = can resend now). */
  initialResendIn: number;
}

export function ClinicVerifyOtpForm({ slug, clinicName, email, initialResendIn }: Props) {
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  // Seeded from the server (the real remaining time based on last-sent), so a
  // refresh shows the correct countdown instead of restarting at 60.
  const [resendIn, setResendIn] = useState(initialResendIn);
  const [resending, setResending] = useState(false);
  const [isPending, startTransition] = useTransition();

  // Tick the resend cooldown down to zero.
  useEffect(() => {
    if (resendIn <= 0) return;
    const t = setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [resendIn]);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      const result = await verifyClinicSignup(slug, formData);
      if (result?.error) setError(result.error);
    });
  }

  async function handleResend() {
    if (resendIn > 0 || resending) return;
    setError(null);
    setInfo(null);
    setResending(true);
    const fd = new FormData();
    fd.set("email", email);
    const result = await resendClinicSignupOtp(slug, fd);
    setResending(false);
    if (result?.success) {
      setInfo("تم إرسال رمز جديد إلى بريدك.");
      setResendIn(result.retryAfter ?? 60);
    } else if (result?.error) {
      setError(result.error);
      if (result.retryAfter) setResendIn(result.retryAfter);
    }
  }

  return (
    <div className="relative z-10 w-full max-w-md">
      <div className="mb-6 flex justify-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-accent/10">
          <ShieldCheck className="h-8 w-8 text-accent" />
        </div>
      </div>

      <div className="mb-8 text-center">
        <h1 className="mb-2 font-heading text-3xl font-bold text-primary">
          تأكيد البريد الإلكتروني
        </h1>
        <p className="font-sans text-sm leading-relaxed text-text/50">
          أدخل الرمز المكوّن من 8 أرقام الذي أرسلناه إلى
          <br />
          <span dir="ltr" className="font-semibold text-text/70">
            {email}
          </span>
          <br />
          لإكمال تسجيلك في {clinicName}
        </p>
      </div>

      {error && (
        <div className="mb-6 flex items-start gap-3 rounded-2xl border border-red-100 bg-red-50 px-4 py-3 font-sans text-sm text-red-600">
          <span className="mt-0.5 flex-shrink-0">⚠</span>
          <span>{error}</span>
        </div>
      )}

      {info && (
        <div className="mb-6 flex items-start gap-3 rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-3 font-sans text-sm text-emerald-700">
          <span className="mt-0.5 flex-shrink-0">✓</span>
          <span>{info}</span>
        </div>
      )}

      <form className="space-y-5" onSubmit={handleSubmit}>
        <input type="hidden" name="email" value={email} />
        <div className="space-y-1.5">
          <label className="block text-center font-sans text-sm font-medium text-text/70">
            رمز التحقق
          </label>
          <input
            name="token"
            inputMode="numeric"
            autoComplete="one-time-code"
            required
            dir="ltr"
            maxLength={8}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
            className="block w-full rounded-2xl border border-text/10 bg-white py-4 text-center font-sans text-2xl font-bold tracking-[0.5em] text-primary transition-all placeholder:text-text/20 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/40"
            placeholder="••••••••"
          />
        </div>

        <button
          type="submit"
          disabled={isPending || code.length < 8}
          className="flex w-full items-center justify-center gap-2.5 rounded-2xl bg-primary px-4 py-3.5 font-sans text-sm font-semibold text-white shadow-lg shadow-primary/20 transition-all duration-200 hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isPending ? (
            <Loader2 className="w-4.5 h-4.5 animate-spin" />
          ) : (
            <ShieldCheck className="w-4.5 h-4.5" />
          )}
          {isPending ? "جارٍ التحقق..." : "تأكيد وإنشاء الحساب"}
        </button>
      </form>

      <div className="mt-6 text-center">
        <p className="mb-2 font-sans text-xs text-text/40">
          لم يصلك الرمز؟ تحقّق من مجلد الرسائل غير المرغوبة.
        </p>
        <button
          type="button"
          onClick={handleResend}
          disabled={resendIn > 0 || resending}
          className="inline-flex items-center gap-1.5 font-sans text-sm font-semibold text-accent transition-colors hover:text-accent/80 disabled:cursor-not-allowed disabled:text-text/30"
        >
          {resending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <RotateCw className="h-3.5 w-3.5" />
          )}
          {resendIn > 0 ? `إعادة إرسال الرمز خلال ${resendIn}ث` : "إعادة إرسال الرمز"}
        </button>
      </div>

      <div className="mt-8 text-center">
        <Link
          href={`/register`}
          className="inline-flex items-center gap-1.5 font-sans text-xs text-text/30 transition-colors hover:text-text/60"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          العودة إلى التسجيل
        </Link>
      </div>
    </div>
  );
}
