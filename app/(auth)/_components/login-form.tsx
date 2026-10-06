"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Mail, Lock, ArrowLeft, UserPlus } from "lucide-react";
import { signIn, joinClinic } from "@/server/actions/auth";
import { loginSchema, type LoginValues } from "@/lib/validations/auth";
import { toFormData } from "@/lib/form-data";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Alert } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";

interface Props {
  /** The clinic this host belongs to, or null on the platform's own login. */
  clinicName: string | null;
}

export function LoginForm({ clinicName }: Props) {
  const [error, setError] = useState<string | null>(null);
  const [needsJoin, setNeedsJoin] = useState(false);
  // Held only to re-authenticate on "create account here" — the non-member
  // sign-in is logged out server-side, so joinClinic must sign in again.
  const [creds, setCreds] = useState<LoginValues | null>(null);
  const [isPending, startTransition] = useTransition();
  const [isJoining, startJoin] = useTransition();

  const form = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
    mode: "onTouched",
  });

  const handleSubmit = form.handleSubmit((values) => {
    setError(null);
    setNeedsJoin(false);
    startTransition(async () => {
      const result = await signIn(toFormData(values));
      if (result && "error" in result) setError(result.error);
      else if (result && "needsJoin" in result) {
        // Known account, but not a member of this clinic yet.
        setCreds(values);
        setNeedsJoin(true);
      }
    });
  });

  function handleJoin() {
    if (!creds) return;
    startJoin(async () => {
      const res = await joinClinic(toFormData(creds));
      if (res?.error) setError(res.error);
    });
  }

  return (
    <div className="relative z-10 w-full max-w-md">
      {/* Mobile logo — the platform mark; a clinic shows its own name instead. */}
      {!clinicName && (
        <div className="mb-8 flex justify-center lg:hidden">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="Clinica AI" className="h-12 w-auto object-contain" />
        </div>
      )}

      <div className="mb-8">
        <h1 className="mb-2 font-heading text-3xl font-bold text-primary">
          {clinicName ? "تسجيل الدخول" : "مرحباً بعودتك 👋"}
        </h1>
        <p className="font-sans text-sm text-text/50">
          {clinicName
            ? `سجّل دخولك للوصول إلى حسابك في ${clinicName}`
            : "أدخل بياناتك للوصول إلى حسابك"}
        </p>
      </div>

      {error && (
        <Alert variant="destructive" className="mb-6 gap-3 rounded-2xl border-red-100 text-red-600">
          <span className="mt-0.5 flex-shrink-0">⚠</span>
          <span>{error}</span>
        </Alert>
      )}

      {needsJoin ? (
        // Account exists on the platform but isn't registered at THIS clinic yet.
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
          <Button
            size="lg"
            onClick={handleJoin}
            loading={isJoining}
            className="w-full rounded-2xl font-semibold shadow-lg shadow-primary/20"
          >
            {!isJoining && <UserPlus />}
            {isJoining ? "جارٍ إنشاء الحساب..." : `إنشاء حسابي في ${clinicName}`}
          </Button>
          <Button
            variant="link"
            size="sm"
            onClick={() => {
              setNeedsJoin(false);
              setError(null);
              setCreds(null);
            }}
            className="text-text/40 hover:text-text/60 hover:no-underline"
          >
            تسجيل الدخول بحساب آخر
          </Button>
        </div>
      ) : (
        <form className="space-y-5" onSubmit={handleSubmit} noValidate>
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

          <FormField
            control={form.control}
            type="password"
            name="password"
            label="كلمة المرور"
            labelClassName="text-text/70"
            labelAction={
              <Link
                href="/forgot-password"
                className="font-sans text-xs text-accent transition-colors hover:text-accent/70"
              >
                نسيت كلمة المرور؟
              </Link>
            }
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
            {isPending ? "جارٍ تسجيل الدخول..." : "تسجيل الدخول"}
          </Button>
        </form>
      )}

      {/* Self sign-up exists only inside a clinic. */}
      {clinicName && (
        <>
          <div className="my-6 flex items-center gap-4">
            <Separator className="bg-text/8 flex-1" />
            <span className="font-sans text-xs text-text/30">أو</span>
            <Separator className="bg-text/8 flex-1" />
          </div>

          <p className="text-center font-sans text-sm text-text/50">
            ليس لديك حساب في {clinicName}؟{" "}
            <Link
              href="/register"
              className="font-semibold text-accent transition-colors hover:text-accent/80"
            >
              أنشئ حساباً جديداً
            </Link>
          </p>
        </>
      )}

      <div className="mt-8 text-center">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 font-sans text-xs text-text/30 transition-colors hover:text-text/60"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          {clinicName ? "العودة إلى صفحة العيادة" : "العودة للرئيسية"}
        </Link>
      </div>
    </div>
  );
}
