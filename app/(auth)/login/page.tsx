"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Mail, Lock, Loader2, Eye, EyeOff, ArrowLeft } from "lucide-react";
import { signIn } from "@/server/actions/auth";

export default function LoginPage() {
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      const result = await signIn(formData);
      if (result?.error) setError(result.error);
    });
  }

  return (
    <div className="w-full max-w-md relative z-10">
      {/* Mobile logo */}
      <div className="flex justify-center mb-8 lg:hidden">
        <img
          src="/logo.png"
          alt="Clinica AI"
          className="h-12 w-auto object-contain"
        />
      </div>

      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-heading font-bold text-primary mb-2">
          مرحباً بعودتك 👋
        </h1>
        <p className="text-text/50 font-sans text-sm">
          أدخل بياناتك للوصول إلى حسابك
        </p>
      </div>

      {/* Error */}
      {error && (
        <div className="mb-6 flex items-start gap-3 bg-red-50 text-red-600 px-4 py-3 rounded-2xl text-sm font-sans border border-red-100">
          <span className="mt-0.5 flex-shrink-0">⚠</span>
          <span>{error}</span>
        </div>
      )}

      {/* Form */}
      <form className="space-y-5" onSubmit={handleSubmit}>
        {/* Email */}
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

        {/* Password */}
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
              {showPassword ? (
                <EyeOff className="h-4.5 w-4.5" />
              ) : (
                <Eye className="h-4.5 w-4.5" />
              )}
            </button>
          </div>
        </div>

        {/* Submit */}
        <button
          type="submit"
          disabled={isPending}
          className="w-full flex justify-center items-center gap-2.5 py-3.5 px-4 rounded-2xl text-sm font-semibold text-white bg-primary hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary transition-all duration-200 disabled:opacity-60 disabled:cursor-not-allowed font-sans mt-2 shadow-lg shadow-primary/20"
        >
          {isPending ? (
            <Loader2 className="animate-spin w-4.5 h-4.5" />
          ) : (
            <ArrowLeft className="w-4.5 h-4.5" />
          )}
          {isPending ? "جارٍ تسجيل الدخول..." : "تسجيل الدخول"}
        </button>
      </form>

      {/* Divider */}
      <div className="my-6 flex items-center gap-4">
        <div className="flex-1 h-px bg-text/8" />
        <span className="text-xs text-text/30 font-sans">أو</span>
        <div className="flex-1 h-px bg-text/8" />
      </div>

      {/* Register link */}
      <p className="text-center text-sm font-sans text-text/50">
        ليس لديك حساب؟{" "}
        <Link
          href="/register"
          className="font-semibold text-accent hover:text-accent/80 transition-colors"
        >
          أنشئ حساباً جديداً
        </Link>
      </p>

      {/* Back to home */}
      <div className="mt-8 text-center">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-xs text-text/30 hover:text-text/60 transition-colors font-sans"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          العودة للرئيسية
        </Link>
      </div>
    </div>
  );
}
