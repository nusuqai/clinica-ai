"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Mail, Lock, User, Phone, ArrowLeft } from "lucide-react";
import { startClinicSignup } from "@/server/actions/auth";
import { PHONE_EXAMPLE, normalizePhone } from "@/lib/phone";
import { registerSchema } from "@/lib/validations/auth";
import { toFormData } from "@/lib/form-data";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Alert } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";

interface Props {
  clinicName: string;
  /** Prefilled from the ?phone= URL param (e.g. a WhatsApp deep link). */
  initialPhone?: string;
}

export function RegisterForm({ clinicName, initialPhone = "" }: Props) {
  const [error, setError] = useState<string | null>(null);
  const [needsLogin, setNeedsLogin] = useState(false);
  const [isPending, startTransition] = useTransition();

  const form = useForm({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      fullName: "",
      phone: normalizePhone(initialPhone),
      email: "",
      password: "",
      confirmPassword: "",
    },
    mode: "onTouched",
  });

  // `values.phone` is already normalized by the schema, so it matches the WhatsApp number exactly.
  const handleSubmit = form.handleSubmit((values) => {
    setError(null);
    setNeedsLogin(false);
    startTransition(async () => {
      const result = await startClinicSignup(toFormData(values));
      if (result?.error) setError(result.error);
      if (result?.needsLogin) setNeedsLogin(true);
    });
  });

  return (
    <div className="relative z-10 w-full max-w-md">
      <div className="mb-8">
        <h1 className="mb-2 font-heading text-3xl font-bold text-primary">إنشاء حساب جديد</h1>
        <p className="font-sans text-sm text-text/50">أنشئ حسابك في {clinicName} لحجز مواعيدك</p>
      </div>

      {error && (
        <Alert
          variant="destructive"
          className="mb-6 flex-col rounded-2xl border-red-100 text-red-600"
        >
          <div className="flex items-start gap-3">
            <span className="mt-0.5 flex-shrink-0">⚠</span>
            <span>{error}</span>
          </div>
          {needsLogin && (
            <Link
              href="/login"
              className="self-start font-semibold text-accent transition-colors hover:text-accent/80"
            >
              الذهاب إلى تسجيل الدخول ←
            </Link>
          )}
        </Alert>
      )}

      <form className="space-y-4" onSubmit={handleSubmit} noValidate>
        <FormField
          control={form.control}
          name="fullName"
          label="الاسم الكامل"
          labelClassName="text-text/70"
          required
          size="lg"
          startIcon={<User />}
          placeholder="أحمد الرشيد"
        />

        <FormField
          control={form.control}
          type="tel"
          name="phone"
          label="رقم الهاتف"
          labelClassName="text-text/70"
          inputMode="numeric"
          autoComplete="tel"
          required
          size="lg"
          startIcon={<Phone />}
          placeholder={PHONE_EXAMPLE}
          hint={
            <>
              بادئة الدولة ثم الرقم بدون (+) وبدون صفر — مثال:{" "}
              <span dir="ltr">{PHONE_EXAMPLE}</span>
            </>
          }
        />

        <FormField
          control={form.control}
          type="email"
          name="email"
          label="البريد الإلكتروني"
          labelClassName="text-text/70"
          required
          size="lg"
          startIcon={<Mail />}
          placeholder="name@example.com"
        />

        <div className="grid grid-cols-2 gap-3">
          <FormField
            control={form.control}
            type="password"
            name="password"
            label="كلمة المرور"
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
            label="تأكيد المرور"
            labelClassName="text-text/70"
            required
            size="lg"
            startIcon={<Lock />}
            placeholder="••••••••"
          />
        </div>

        <Button
          type="submit"
          size="lg"
          loading={isPending}
          className="w-full rounded-2xl font-semibold shadow-lg shadow-primary/20"
        >
          {!isPending && <ArrowLeft />}
          {isPending ? "جارٍ إنشاء الحساب..." : "إنشاء الحساب"}
        </Button>
      </form>

      <div className="my-6 flex items-center gap-4">
        <Separator className="bg-text/8 flex-1" />
        <span className="font-sans text-xs text-text/30">أو</span>
        <Separator className="bg-text/8 flex-1" />
      </div>

      <p className="text-center font-sans text-sm text-text/50">
        لديك حساب بالفعل؟{" "}
        <Link
          href="/login"
          className="font-semibold text-accent transition-colors hover:text-accent/80"
        >
          سجل دخولك
        </Link>
      </p>

      <div className="mt-8 text-center">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 font-sans text-xs text-text/30 transition-colors hover:text-text/60"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          العودة إلى صفحة العيادة
        </Link>
      </div>
    </div>
  );
}
