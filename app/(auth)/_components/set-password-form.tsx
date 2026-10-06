"use client";

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Lock, ArrowLeft } from "lucide-react";
import { setNewPassword } from "@/server/actions/auth";
import { setPasswordSchema, type SetPasswordValues } from "@/lib/validations/auth";
import { toFormData } from "@/lib/form-data";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Alert } from "@/components/ui/alert";

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

  const form = useForm<SetPasswordValues>({
    resolver: zodResolver(setPasswordSchema),
    defaultValues: { password: "", confirmPassword: "" },
    mode: "onTouched",
  });

  const handleSubmit = form.handleSubmit((values) => {
    setError(null);
    startTransition(async () => {
      const result = await setNewPassword(toFormData(values));
      if (result?.error) setError(result.error);
    });
  });

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
        <Alert variant="destructive" className="mb-6 gap-3 rounded-2xl border-red-100 text-red-600">
          <span className="mt-0.5 flex-shrink-0">⚠</span>
          <span>{error}</span>
        </Alert>
      )}

      <form className="space-y-5" onSubmit={handleSubmit} noValidate>
        <FormField
          control={form.control}
          type="password"
          name="password"
          label="كلمة المرور الجديدة"
          labelClassName="text-text/70"
          required
          size="lg"
          startIcon={<Lock />}
          placeholder="••••••••"
        />

        <FormField
          control={form.control}
          type="password"
          name="confirmPassword"
          label="تأكيد كلمة المرور"
          labelClassName="text-text/70"
          required
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
