"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { ArrowLeft, ShieldCheck, RotateCw } from "lucide-react";
import { verifyClinicSignup, resendClinicSignupOtp } from "@/server/actions/auth";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Alert } from "@/components/ui/alert";

interface Props {
  clinicName: string;
  email: string;
  /** Seconds left on the resend cooldown, from the DB (0 = can resend now). */
  initialResendIn: number;
}

export function VerifyOtpForm({ clinicName, email, initialResendIn }: Props) {
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
      const result = await verifyClinicSignup(formData);
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
    const result = await resendClinicSignupOtp(fd);
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
        <Alert variant="destructive" className="mb-6 gap-3 rounded-2xl border-red-100 text-red-600">
          <span className="mt-0.5 flex-shrink-0">⚠</span>
          <span>{error}</span>
        </Alert>
      )}

      {info && (
        <Alert variant="success" className="mb-6 gap-3 rounded-2xl border-emerald-100">
          <span className="mt-0.5 flex-shrink-0">✓</span>
          <span>{info}</span>
        </Alert>
      )}

      <form className="space-y-5" onSubmit={handleSubmit}>
        <input type="hidden" name="email" value={email} />
        <FormField
          type="otp"
          length={8}
          name="token"
          label="رمز التحقق"
          labelClassName="block text-center text-text/70"
          required
          value={code}
          onValueChange={setCode}
        />

        <Button
          type="submit"
          size="lg"
          loading={isPending}
          disabled={code.length < 8}
          className="w-full rounded-2xl font-semibold shadow-lg shadow-primary/20"
        >
          {!isPending && <ShieldCheck />}
          {isPending ? "جارٍ التحقق..." : "تأكيد وإنشاء الحساب"}
        </Button>
      </form>

      <div className="mt-6 text-center">
        <p className="mb-2 font-sans text-xs text-text/40">
          لم يصلك الرمز؟ تحقّق من مجلد الرسائل غير المرغوبة.
        </p>
        <Button
          type="button"
          variant="link"
          onClick={handleResend}
          loading={resending}
          disabled={resendIn > 0}
          className="h-auto p-0 font-semibold text-accent hover:text-accent/80 hover:no-underline disabled:text-text/30 [&_svg]:size-3.5"
        >
          {!resending && <RotateCw />}
          {resendIn > 0 ? `إعادة إرسال الرمز خلال ${resendIn}ث` : "إعادة إرسال الرمز"}
        </Button>
      </div>

      <div className="mt-8 text-center">
        <Link
          href="/register"
          className="inline-flex items-center gap-1.5 font-sans text-xs text-text/30 transition-colors hover:text-text/60"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          العودة إلى التسجيل
        </Link>
      </div>
    </div>
  );
}
