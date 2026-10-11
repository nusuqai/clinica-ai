"use client";

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Pencil } from "lucide-react";
import Modal from "@/components/admin/modal";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { updatePatientProfileAction, changePatientEmailAction } from "@/server/actions/admin";
import { Alert } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import { toFormData } from "@/lib/form-data";
import {
  patientEmailSchema,
  patientProfileSchema,
  type PatientEmailValues,
  type PatientProfileInput,
} from "@/lib/validations/admin";

interface Props {
  userId: string;
  fullName: string;
  phone: string | null;
  email: string;
  /** True once the email is real (not a WhatsApp placeholder). */
  claimed: boolean;
}

export default function EditPatientModal({ userId, fullName, phone, email, claimed }: Props) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [savingProfile, startProfile] = useTransition();
  const [savingEmail, startEmail] = useTransition();

  const profileForm = useForm({
    resolver: zodResolver(patientProfileSchema),
    defaultValues: { fullName, phone: phone ?? "" } satisfies PatientProfileInput,
    mode: "onTouched",
  });
  const emailForm = useForm<PatientEmailValues>({
    resolver: zodResolver(patientEmailSchema),
    defaultValues: { email: claimed ? email : "" },
    mode: "onTouched",
  });

  const handleProfile = profileForm.handleSubmit((values) => {
    setError(null);
    setInfo(null);
    startProfile(async () => {
      // An empty phone clears it (the server treats "" as null).
      const res = await updatePatientProfileAction(userId, toFormData(values));
      if (res?.error) setError(res.error);
      else setInfo("تم حفظ البيانات.");
    });
  });

  const handleEmail = emailForm.handleSubmit((values) => {
    setError(null);
    setInfo(null);
    startEmail(async () => {
      const res = await changePatientEmailAction(userId, toFormData(values));
      if (res?.error) setError(res.error);
      else
        setInfo(
          "تم إرسال رابط التأكيد إلى البريد الجديد. لن يتغيّر البريد حتى يضغط المريض الرابط."
        );
    });
  });

  return (
    <>
      <Button
        onClick={() => {
          setError(null);
          setInfo(null);
          setOpen(true);
        }}
      >
        <Pencil />
        تعديل
      </Button>

      <Modal open={open} onClose={() => setOpen(false)} title="تعديل بيانات المريض">
        {error && (
          <Alert variant="destructive" className="mb-4 border-red-100 text-red-600">
            {error}
          </Alert>
        )}
        {info && (
          <Alert variant="success" className="mb-4 border-emerald-100">
            {info}
          </Alert>
        )}

        {/* Profile (name + phone) */}
        <form onSubmit={handleProfile} noValidate className="space-y-4">
          <FormField control={profileForm.control} name="fullName" label="الاسم الكامل" required />
          <FormField
            control={profileForm.control}
            type="tel"
            name="phone"
            label="رقم الهاتف"
            inputMode="numeric"
            placeholder="201014443991"
            controlClassName="text-start"
          />
          <Button type="submit" loading={savingProfile} className="font-semibold">
            حفظ البيانات
          </Button>
        </form>

        <Separator className="my-6" />

        {/* Email change (with verification) */}
        <form onSubmit={handleEmail} noValidate className="space-y-4">
          <FormField
            control={emailForm.control}
            type="email"
            name="email"
            label="البريد الإلكتروني"
            required
            placeholder="name@example.com"
            controlClassName="text-start"
            hint={
              claimed
                ? "سيُرسل رابط تأكيد إلى البريد الجديد، ولن يتغيّر قبل الضغط عليه."
                : "هذا الحساب لم يُفعّل بريدَه بعد (مُسجّل عبر واتساب). أدخل بريداً لإرسال رابط التأكيد."
            }
          />
          <Button type="submit" variant="outline" loading={savingEmail} className="font-semibold">
            تغيير البريد (بتأكيد)
          </Button>
        </form>
      </Modal>
    </>
  );
}
