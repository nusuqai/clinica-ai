"use client";

import { useState, useTransition } from "react";
import { Lock, Loader2, Eye, EyeOff, ArrowLeft } from "lucide-react";
import { setNewPassword } from "@/server/actions/auth";

export default function SetPasswordForm({
  title,
  subtitle,
  submitLabel,
}: {
  title: string;
  subtitle: string;
  submitLabel: string;
}) {
  const [show, setShow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      const result = await setNewPassword(formData);
      if (result?.error) setError(result.error);
    });
  }

  return (
    <div className="relative z-10 w-full max-w-md">
      <div className="mb-8 flex justify-center lg:hidden">
        <img src="/logo.png" alt="Clinica AI" className="h-12 w-auto object-contain" />
      </div>

      <div className="mb-8">
        <h1 className="mb-2 font-heading text-3xl font-bold text-primary">{title}</h1>
        <p className="font-sans text-sm text-text/50">{subtitle}</p>
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
            كلمة المرور الجديدة
          </label>
          <div className="relative">
            <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-4">
              <Lock className="h-4.5 w-4.5 text-text/30" />
            </div>
            <input
              name="password"
              type={show ? "text" : "password"}
              required
              minLength={8}
              dir="ltr"
              className="block w-full rounded-2xl border border-text/10 bg-white py-3.5 pl-11 pr-11 font-sans text-sm transition-all placeholder:text-text/30 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/40"
              placeholder="••••••••"
            />
            <button
              type="button"
              onClick={() => setShow((v) => !v)}
              className="absolute inset-y-0 left-0 flex items-center pl-4 text-text/30 transition-colors hover:text-primary"
            >
              {show ? <EyeOff className="h-4.5 w-4.5" /> : <Eye className="h-4.5 w-4.5" />}
            </button>
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="block font-sans text-sm font-medium text-text/70">
            تأكيد كلمة المرور
          </label>
          <div className="relative">
            <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-4">
              <Lock className="h-4.5 w-4.5 text-text/30" />
            </div>
            <input
              name="confirmPassword"
              type={show ? "text" : "password"}
              required
              minLength={8}
              dir="ltr"
              className="block w-full rounded-2xl border border-text/10 bg-white py-3.5 pl-4 pr-11 font-sans text-sm transition-all placeholder:text-text/30 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/40"
              placeholder="••••••••"
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
            <ArrowLeft className="w-4.5 h-4.5" />
          )}
          {isPending ? "جارٍ الحفظ..." : submitLabel}
        </button>
      </form>
    </div>
  );
}
