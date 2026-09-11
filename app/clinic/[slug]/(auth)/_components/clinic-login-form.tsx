"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Mail, Lock, Loader2, Eye, EyeOff, ArrowLeft, UserPlus } from "lucide-react";
import { signInToClinic, joinClinic } from "@/server/actions/auth";

interface Props {
  slug: string;
  clinicName: string;
}

export function ClinicLoginForm({ slug, clinicName }: Props) {
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needsJoin, setNeedsJoin] = useState(false);
  // Held only to re-authenticate on "create account here" — the non-member
  // sign-in is logged out server-side, so joinClinic must sign in again.
  const [creds, setCreds] = useState<{ email: string; password: string } | null>(null);
  const [isPending, startTransition] = useTransition();
  const [isJoining, startJoin] = useTransition();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setNeedsJoin(false);
    const formData = new FormData(e.currentTarget);
    const email = String(formData.get("email") ?? "");
    const password = String(formData.get("password") ?? "");
    startTransition(async () => {
      const result = await signInToClinic(slug, formData);
      if (result?.error) setError(result.error);
      else if (result && "needsJoin" in result) {
        setCreds({ email, password });
        setNeedsJoin(true);
      }
    });
  }

  function handleJoin() {
    if (!creds) return;
    startJoin(async () => {
      const fd = new FormData();
      fd.set("email", creds.email);
      fd.set("password", creds.password);
      const res = await joinClinic(slug, fd);
      if (res?.error) setError(res.error);
    });
  }

  return (
    <div className="relative z-10 w-full max-w-md">
      <div className="mb-8">
        <h1 className="mb-2 font-heading text-3xl font-bold text-primary">تسجيل الدخول</h1>
        <p className="font-sans text-sm text-text/50">
          سجّل دخولك للوصول إلى حسابك في {clinicName}
        </p>
      </div>

      {error && (
        <div className="mb-6 flex items-start gap-3 rounded-2xl border border-red-100 bg-red-50 px-4 py-3 font-sans text-sm text-red-600">
          <span className="mt-0.5 flex-shrink-0">⚠</span>
          <span>{error}</span>
        </div>
      )}

      {needsJoin ? (
        // Account exists in the platform but isn't registered at THIS clinic yet.
        <div className="flex flex-col items-center gap-4 py-4 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-accent/10">
            <UserPlus className="h-7 w-7 text-accent" />
          </div>
          <div>
            <p className="font-heading text-lg font-bold text-text">
              حسابك غير مسجّل في {clinicName}
            </p>
            <p className="mt-1 font-sans text-sm text-text/50">
              لديك حساب على المنصة، لكنه غير مرتبط بهذه العيادة بعد. أنشئ حسابك في {clinicName}{" "}
              للمتابعة.
            </p>
          </div>
          <button
            onClick={handleJoin}
            disabled={isJoining}
            className="flex w-full items-center justify-center gap-2.5 rounded-2xl bg-primary px-4 py-3.5 font-sans text-sm font-semibold text-white shadow-lg shadow-primary/20 transition-all hover:bg-primary/90 disabled:opacity-60"
          >
            {isJoining ? (
              <Loader2 className="w-4.5 h-4.5 animate-spin" />
            ) : (
              <UserPlus className="w-4.5 h-4.5" />
            )}
            {isJoining ? "جارٍ إنشاء الحساب..." : `إنشاء حسابي في ${clinicName}`}
          </button>
          <button
            onClick={() => {
              setNeedsJoin(false);
              setError(null);
              setCreds(null);
            }}
            className="font-sans text-xs text-text/40 hover:text-text/60"
          >
            تسجيل الدخول بحساب آخر
          </button>
        </div>
      ) : (
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

          <div className="space-y-1.5">
            <label className="block font-sans text-sm font-medium text-text/70">كلمة المرور</label>
            <div className="relative">
              <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-4">
                <Lock className="h-4.5 w-4.5 text-text/30" />
              </div>
              <input
                name="password"
                type={showPassword ? "text" : "password"}
                required
                dir="ltr"
                className="block w-full rounded-2xl border border-text/10 bg-white py-3.5 pl-11 pr-11 font-sans text-sm transition-all placeholder:text-text/30 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/40"
                placeholder="••••••••"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute inset-y-0 left-0 flex items-center pl-4 text-text/30 transition-colors hover:text-primary"
              >
                {showPassword ? (
                  <EyeOff className="h-4.5 w-4.5" />
                ) : (
                  <Eye className="h-4.5 w-4.5" />
                )}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={isPending}
            className="mt-2 flex w-full items-center justify-center gap-2.5 rounded-2xl bg-primary px-4 py-3.5 font-sans text-sm font-semibold text-white shadow-lg shadow-primary/20 transition-all duration-200 hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 disabled:opacity-60"
          >
            {isPending ? (
              <Loader2 className="w-4.5 h-4.5 animate-spin" />
            ) : (
              <ArrowLeft className="w-4.5 h-4.5" />
            )}
            {isPending ? "جارٍ تسجيل الدخول..." : "تسجيل الدخول"}
          </button>
        </form>
      )}

      <div className="my-6 flex items-center gap-4">
        <div className="bg-text/8 h-px flex-1" />
        <span className="font-sans text-xs text-text/30">أو</span>
        <div className="bg-text/8 h-px flex-1" />
      </div>

      <p className="text-center font-sans text-sm text-text/50">
        ليس لديك حساب في {clinicName}؟{" "}
        <Link
          href={`/clinic/${slug}/register`}
          className="font-semibold text-accent transition-colors hover:text-accent/80"
        >
          أنشئ حساباً جديداً
        </Link>
      </p>

      <div className="mt-8 text-center">
        <Link
          href={`/clinic/${slug}`}
          className="inline-flex items-center gap-1.5 font-sans text-xs text-text/30 transition-colors hover:text-text/60"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          العودة إلى صفحة العيادة
        </Link>
      </div>
    </div>
  );
}
