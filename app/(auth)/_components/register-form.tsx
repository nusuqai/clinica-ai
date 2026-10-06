"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Mail, Lock, User, Phone, ArrowLeft } from "lucide-react";
import { startClinicSignup } from "@/server/actions/auth";
import { PHONE_EXAMPLE, normalizePhone, isValidPhone } from "@/lib/phone";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";

interface Props {
  clinicName: string;
  /** Prefilled from the ?phone= URL param (e.g. a WhatsApp deep link). */
  initialPhone?: string;
}

export function RegisterForm({ clinicName, initialPhone = "" }: Props) {
  const [error, setError] = useState<string | null>(null);
  const [needsLogin, setNeedsLogin] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setNeedsLogin(false);
    const formData = new FormData(e.currentTarget);

    const phone = normalizePhone((formData.get("phone") as string) ?? "");
    if (!isValidPhone(phone)) {
      setError(
        `أدخل رقم الهاتف بالصيغة الدولية بدون علامة (+) وبدون صفر في البداية: بادئة الدولة ثم الرقم، مثال: ${PHONE_EXAMPLE}`
      );
      return;
    }
    // Store the normalized number so it matches the WhatsApp number exactly.
    formData.set("phone", phone);

    const password = formData.get("password") as string;
    const confirm = formData.get("confirmPassword") as string;
    if (password !== confirm) {
      setError("كلمتا المرور غير متطابقتين.");
      return;
    }

    startTransition(async () => {
      const result = await startClinicSignup(formData);
      if (result?.error) setError(result.error);
      if (result?.needsLogin) setNeedsLogin(true);
    });
  }

  return (
    <div className="relative z-10 w-full max-w-md">
      <div className="mb-8">
        <h1 className="mb-2 font-heading text-3xl font-bold text-primary">إنشاء حساب جديد</h1>
        <p className="font-sans text-sm text-text/50">أنشئ حسابك في {clinicName} لحجز مواعيدك</p>
      </div>

      {error && (
        <div className="mb-6 flex flex-col gap-2 rounded-2xl border border-red-100 bg-red-50 px-4 py-3 font-sans text-sm text-red-600">
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
        </div>
      )}

      <form className="space-y-4" onSubmit={handleSubmit}>
        <FormField
          name="fullName"
          label="الاسم الكامل"
          labelClassName="text-text/70"
          required
          size="lg"
          startIcon={<User />}
          placeholder="أحمد الرشيد"
        />

        <FormField
          type="tel"
          name="phone"
          label="رقم الهاتف"
          labelClassName="text-text/70"
          inputMode="numeric"
          autoComplete="tel"
          required
          size="lg"
          startIcon={<Phone />}
          defaultValue={normalizePhone(initialPhone)}
          placeholder={PHONE_EXAMPLE}
          hint={
            <>
              بادئة الدولة ثم الرقم بدون (+) وبدون صفر — مثال:{" "}
              <span dir="ltr">{PHONE_EXAMPLE}</span>
            </>
          }
        />

        <FormField
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
            type="password"
            name="password"
            label="كلمة المرور"
            labelClassName="text-text/70"
            required
            minLength={6}
            size="lg"
            startIcon={<Lock />}
            placeholder="••••••••"
          />
          <FormField
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
        <div className="bg-text/8 h-px flex-1" />
        <span className="font-sans text-xs text-text/30">أو</span>
        <div className="bg-text/8 h-px flex-1" />
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
