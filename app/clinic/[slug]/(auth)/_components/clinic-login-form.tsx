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
    <div className="w-full max-w-md relative z-10">
      <div className="mb-8">
        <h1 className="text-3xl font-heading font-bold text-primary mb-2">
          تسجيل الدخول
        </h1>
        <p className="text-text/50 font-sans text-sm">
          سجّل دخولك للوصول إلى حسابك في {clinicName}
        </p>
      </div>

      {error && (
        <div className="mb-6 flex items-start gap-3 bg-red-50 text-red-600 px-4 py-3 rounded-2xl text-sm font-sans border border-red-100">
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
              لديك حساب على المنصة، لكنه غير مرتبط بهذه العيادة بعد. أنشئ حسابك في {clinicName} للمتابعة.
            </p>
          </div>
          <button
            onClick={handleJoin}
            disabled={isJoining}
            className="w-full flex justify-center items-center gap-2.5 py-3.5 px-4 rounded-2xl text-sm font-semibold text-white bg-primary hover:bg-primary/90 transition-all disabled:opacity-60 font-sans shadow-lg shadow-primary/20"
          >
            {isJoining ? <Loader2 className="animate-spin w-4.5 h-4.5" /> : <UserPlus className="w-4.5 h-4.5" />}
            {isJoining ? "جارٍ إنشاء الحساب..." : `إنشاء حسابي في ${clinicName}`}
          </button>
          <button
            onClick={() => {
              setNeedsJoin(false);
              setError(null);
              setCreds(null);
            }}
            className="text-xs text-text/40 hover:text-text/60 font-sans"
          >
            تسجيل الدخول بحساب آخر
          </button>
        </div>
      ) : (
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

          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-text/70 font-sans">
              كلمة المرور
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 right-0 pr-4 flex items-center pointer-events-none">
                <Lock className="h-4.5 w-4.5 text-text/30" />
              </div>
              <input
                name="password"
                type={showPassword ? "text" : "password"}
                required
                dir="ltr"
                className="block w-full pr-11 pl-11 py-3.5 font-sans text-sm border border-text/10 rounded-2xl focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent bg-white placeholder:text-text/30 transition-all"
                placeholder="••••••••"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute inset-y-0 left-0 pl-4 flex items-center text-text/30 hover:text-primary transition-colors"
              >
                {showPassword ? <EyeOff className="h-4.5 w-4.5" /> : <Eye className="h-4.5 w-4.5" />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={isPending}
            className="w-full flex justify-center items-center gap-2.5 py-3.5 px-4 rounded-2xl text-sm font-semibold text-white bg-primary hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary transition-all duration-200 disabled:opacity-60 font-sans mt-2 shadow-lg shadow-primary/20"
          >
            {isPending ? <Loader2 className="animate-spin w-4.5 h-4.5" /> : <ArrowLeft className="w-4.5 h-4.5" />}
            {isPending ? "جارٍ تسجيل الدخول..." : "تسجيل الدخول"}
          </button>
        </form>
      )}

      <div className="my-6 flex items-center gap-4">
        <div className="flex-1 h-px bg-text/8" />
        <span className="text-xs text-text/30 font-sans">أو</span>
        <div className="flex-1 h-px bg-text/8" />
      </div>

      <p className="text-center text-sm font-sans text-text/50">
        ليس لديك حساب في {clinicName}؟{" "}
        <Link
          href={`/clinic/${slug}/register`}
          className="font-semibold text-accent hover:text-accent/80 transition-colors"
        >
          أنشئ حساباً جديداً
        </Link>
      </p>

      <div className="mt-8 text-center">
        <Link
          href={`/clinic/${slug}`}
          className="inline-flex items-center gap-1.5 text-xs text-text/30 hover:text-text/60 transition-colors font-sans"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          العودة إلى صفحة العيادة
        </Link>
      </div>
    </div>
  );
}
