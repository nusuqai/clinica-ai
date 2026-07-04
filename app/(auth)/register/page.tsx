"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import {
  Mail,
  Lock,
  Loader2,
  Eye,
  EyeOff,
  User,
  Phone,
  ArrowLeft,
} from "lucide-react";
import { signUp } from "@/server/actions/auth";

export default function RegisterPage() {
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const formData = new FormData(e.currentTarget);

    const password = formData.get("password") as string;
    const confirm = formData.get("confirmPassword") as string;
    if (password !== confirm) {
      setError("كلمتا المرور غير متطابقتين.");
      return;
    }

    startTransition(async () => {
      const result = await signUp(formData);
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
          إنشاء حساب جديد ✨
        </h1>
        <p className="text-text/50 font-sans text-sm">
          انضم إلى آلاف المرضى الذين يثقون بـ Clinica AI
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
      <form className="space-y-4" onSubmit={handleSubmit}>
        {/* Full Name */}
        <div className="space-y-1.5">
          <label className="block text-sm font-medium text-text/70 font-sans">
            الاسم الكامل
          </label>
          <div className="relative">
            <div className="absolute inset-y-0 right-0 pr-4 flex items-center pointer-events-none">
              <User className="h-4.5 w-4.5 text-text/30" />
            </div>
            <input
              name="fullName"
              type="text"
              required
              className="block w-full pr-11 pl-4 py-3.5 font-sans text-sm border border-text/10 rounded-2xl focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent bg-white placeholder:text-text/30 transition-all"
              placeholder="أحمد الرشيد"
            />
          </div>
        </div>

        {/* Phone */}
        <div className="space-y-1.5">
          <label className="block text-sm font-medium text-text/70 font-sans">
            رقم الهاتف
          </label>
          <div className="relative">
            <div className="absolute inset-y-0 right-0 pr-4 flex items-center pointer-events-none">
              <Phone className="h-4.5 w-4.5 text-text/30" />
            </div>
            <input
              name="phone"
              type="tel"
              required
              dir="ltr"
              className="block w-full pr-11 pl-4 py-3.5 font-sans text-sm border border-text/10 rounded-2xl focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent bg-white text-right placeholder:text-text/30 transition-all"
              placeholder="+20 100 000 0000"
            />
          </div>
        </div>

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

        {/* Password row */}
        <div className="grid grid-cols-2 gap-3">
          {/* Password */}
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-text/70 font-sans">
              كلمة المرور
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 right-0 pr-3.5 flex items-center pointer-events-none">
                <Lock className="h-4 w-4 text-text/30" />
              </div>
              <input
                name="password"
                type={showPassword ? "text" : "password"}
                required
                minLength={6}
                dir="ltr"
                className="block w-full pr-10 pl-9 py-3.5 font-sans text-sm border border-text/10 rounded-2xl focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent bg-white placeholder:text-text/30 transition-all"
                placeholder="••••••••"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute inset-y-0 left-0 pl-3 flex items-center text-text/30 hover:text-primary transition-colors"
              >
                {showPassword ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </button>
            </div>
          </div>

          {/* Confirm Password */}
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-text/70 font-sans">
              تأكيد المرور
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 right-0 pr-3.5 flex items-center pointer-events-none">
                <Lock className="h-4 w-4 text-text/30" />
              </div>
              <input
                name="confirmPassword"
                type={showConfirm ? "text" : "password"}
                required
                dir="ltr"
                className="block w-full pr-10 pl-9 py-3.5 font-sans text-sm border border-text/10 rounded-2xl focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent bg-white placeholder:text-text/30 transition-all"
                placeholder="••••••••"
              />
              <button
                type="button"
                onClick={() => setShowConfirm((v) => !v)}
                className="absolute inset-y-0 left-0 pl-3 flex items-center text-text/30 hover:text-primary transition-colors"
              >
                {showConfirm ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Terms note */}
        <p className="text-xs text-text/40 font-sans text-center px-2">
          بالتسجيل، أنت توافق على{" "}
          <span className="text-accent">شروط الاستخدام</span> و{" "}
          <span className="text-accent">سياسة الخصوصية</span>
        </p>

        {/* Submit */}
        <button
          type="submit"
          disabled={isPending}
          className="w-full flex justify-center items-center gap-2.5 py-3.5 px-4 rounded-2xl text-sm font-semibold text-white bg-primary hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary transition-all duration-200 disabled:opacity-60 disabled:cursor-not-allowed font-sans shadow-lg shadow-primary/20"
        >
          {isPending ? (
            <Loader2 className="animate-spin w-4.5 h-4.5" />
          ) : (
            <ArrowLeft className="w-4.5 h-4.5" />
          )}
          {isPending ? "جارٍ إنشاء الحساب..." : "إنشاء الحساب"}
        </button>
      </form>

      {/* Divider */}
      <div className="my-6 flex items-center gap-4">
        <div className="flex-1 h-px bg-text/8" />
        <span className="text-xs text-text/30 font-sans">أو</span>
        <div className="flex-1 h-px bg-text/8" />
      </div>

      {/* Login link */}
      <p className="text-center text-sm font-sans text-text/50">
        لديك حساب بالفعل؟{" "}
        <Link
          href="/login"
          className="font-semibold text-accent hover:text-accent/80 transition-colors"
        >
          سجل دخولك
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
