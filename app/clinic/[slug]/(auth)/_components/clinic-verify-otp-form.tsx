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

export function ClinicVerifyOtpForm({
  slug,
  clinicName,
  email,
  initialResendIn,
}: Props) {
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
    <div className="w-full max-w-md relative z-10">
      <div className="flex justify-center mb-6">
        <div className="w-16 h-16 rounded-2xl bg-accent/10 flex items-center justify-center">
          <ShieldCheck className="w-8 h-8 text-accent" />
        </div>
      </div>

      <div className="mb-8 text-center">
        <h1 className="text-3xl font-heading font-bold text-primary mb-2">
          تأكيد البريد الإلكتروني
        </h1>
        <p className="text-text/50 font-sans text-sm leading-relaxed">
          أدخل الرمز المكوّن من 6 أرقام الذي أرسلناه إلى
          <br />
          <span dir="ltr" className="font-semibold text-text/70">
            {email}
          </span>
          <br />
          لإكمال تسجيلك في {clinicName}
        </p>
      </div>

      {error && (
        <div className="mb-6 flex items-start gap-3 bg-red-50 text-red-600 px-4 py-3 rounded-2xl text-sm font-sans border border-red-100">
          <span className="mt-0.5 flex-shrink-0">⚠</span>
          <span>{error}</span>
        </div>
      )}

      {info && (
        <div className="mb-6 flex items-start gap-3 bg-emerald-50 text-emerald-700 px-4 py-3 rounded-2xl text-sm font-sans border border-emerald-100">
          <span className="mt-0.5 flex-shrink-0">✓</span>
          <span>{info}</span>
        </div>
      )}

      <form className="space-y-5" onSubmit={handleSubmit}>
        <input type="hidden" name="email" value={email} />
        <div className="space-y-1.5">
          <label className="block text-sm font-medium text-text/70 font-sans text-center">
            رمز التحقق
          </label>
          <input
            name="token"
            inputMode="numeric"
            autoComplete="one-time-code"
            required
            dir="ltr"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
            className="block w-full py-4 font-sans text-2xl tracking-[0.5em] text-center font-bold border border-text/10 rounded-2xl focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent bg-white text-primary placeholder:text-text/20 transition-all"
            placeholder="••••••"
          />
        </div>

        <button
          type="submit"
          disabled={isPending || code.length < 6}
          className="w-full flex justify-center items-center gap-2.5 py-3.5 px-4 rounded-2xl text-sm font-semibold text-white bg-primary hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary transition-all duration-200 disabled:opacity-60 disabled:cursor-not-allowed font-sans shadow-lg shadow-primary/20"
        >
          {isPending ? (
            <Loader2 className="animate-spin w-4.5 h-4.5" />
          ) : (
            <ShieldCheck className="w-4.5 h-4.5" />
          )}
          {isPending ? "جارٍ التحقق..." : "تأكيد وإنشاء الحساب"}
        </button>
      </form>

      <div className="mt-6 text-center">
        <p className="text-xs text-text/40 font-sans mb-2">
          لم يصلك الرمز؟ تحقّق من مجلد الرسائل غير المرغوبة.
        </p>
        <button
          type="button"
          onClick={handleResend}
          disabled={resendIn > 0 || resending}
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-accent hover:text-accent/80 transition-colors disabled:text-text/30 disabled:cursor-not-allowed font-sans"
        >
          {resending ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <RotateCw className="w-3.5 h-3.5" />
          )}
          {resendIn > 0
            ? `إعادة إرسال الرمز خلال ${resendIn}ث`
            : "إعادة إرسال الرمز"}
        </button>
      </div>

      <div className="mt-8 text-center">
        <Link
          href={`/clinic/${slug}/register`}
          className="inline-flex items-center gap-1.5 text-xs text-text/30 hover:text-text/60 transition-colors font-sans"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          العودة إلى التسجيل
        </Link>
      </div>
    </div>
  );
}
