"use client";

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { CheckCircle, AlertCircle, Save } from "lucide-react";
import { updateProfileAction } from "@/server/actions/patient";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Alert } from "@/components/ui/alert";
import { patientProfileSelfSchema, type PatientProfileSelfValues } from "@/lib/validations/public";

interface Props {
  email: string;
  defaultFullName: string;
  defaultPhone: string | null;
}

export function ProfileForm({ email, defaultFullName, defaultPhone }: Props) {
  const [isPending, startTransition] = useTransition();
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");

  const form = useForm<PatientProfileSelfValues>({
    resolver: zodResolver(patientProfileSelfSchema),
    defaultValues: { fullName: defaultFullName, phone: defaultPhone ?? "" },
    mode: "onTouched",
  });

  const handleSubmit = form.handleSubmit(({ fullName, phone }) => {
    setError("");
    setSuccess(false);
    startTransition(async () => {
      const res = await updateProfileAction(fullName, phone || null);
      if (res.ok) setSuccess(true);
      else setError(res.error ?? "حدث خطأ غير متوقع");
    });
  });

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-5">
      {/* Email (read-only) */}
      <FormField
        type="email"
        label="البريد الإلكتروني"
        value={email}
        readOnly
        hint="لا يمكن تغيير البريد الإلكتروني"
        controlClassName="h-12 cursor-not-allowed bg-muted px-4 text-muted-foreground"
      />

      {/* Full name */}
      <FormField
        label={
          <>
            الاسم الكامل <span className="text-red-500">*</span>
          </>
        }
        control={form.control}
        name="fullName"
        required
        placeholder="أدخل اسمك الكامل"
        controlClassName="h-12 px-4"
      />

      {/* Phone */}
      <FormField
        type="tel"
        label={
          <>
            رقم الهاتف <span className="font-normal text-muted-foreground">(اختياري)</span>
          </>
        }
        control={form.control}
        name="phone"
        placeholder="01xxxxxxxxx"
        controlClassName="h-12 px-4"
      />

      {/* Feedback */}
      {success && (
        <Alert variant="success" className="items-center border-transparent">
          <CheckCircle className="h-4 w-4 shrink-0" />
          تم تحديث الملف الشخصي بنجاح
        </Alert>
      )}
      {error && (
        <Alert variant="destructive" className="items-center border-transparent text-red-600">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </Alert>
      )}

      <Button type="submit" disabled={isPending} className="h-11 self-start px-6">
        <Save />
        {isPending ? "جارٍ الحفظ..." : "حفظ التغييرات"}
      </Button>
    </form>
  );
}
