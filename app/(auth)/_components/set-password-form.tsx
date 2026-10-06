"use client";

import { useState, useTransition } from "react";
import { Lock, ArrowLeft } from "lucide-react";
import { setNewPassword } from "@/server/actions/auth";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";

export default function SetPasswordForm({
  title,
  subtitle,
  submitLabel,
}: {
  title: string;
  subtitle: string;
  submitLabel: string;
}) {
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
        <FormField
          type="password"
          name="password"
          label="كلمة المرور الجديدة"
          labelClassName="text-text/70"
          required
          minLength={8}
          size="lg"
          startIcon={<Lock />}
          placeholder="••••••••"
        />

        <FormField
          type="password"
          name="confirmPassword"
          label="تأكيد كلمة المرور"
          labelClassName="text-text/70"
          required
          minLength={8}
          size="lg"
          startIcon={<Lock />}
          placeholder="••••••••"
        />

        <Button
          type="submit"
          size="lg"
          loading={isPending}
          className="mt-2 w-full rounded-2xl font-semibold shadow-lg shadow-primary/20"
        >
          {!isPending && <ArrowLeft />}
          {isPending ? "جارٍ الحفظ..." : submitLabel}
        </Button>
      </form>
    </div>
  );
}
