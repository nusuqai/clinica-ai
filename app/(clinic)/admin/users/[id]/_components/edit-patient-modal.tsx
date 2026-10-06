"use client";

import { useState, useTransition } from "react";
import { Pencil } from "lucide-react";
import Modal from "@/components/admin/modal";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { updatePatientProfileAction, changePatientEmailAction } from "@/server/actions/admin";
import { Alert } from "@/components/ui/alert";

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

  function handleProfile(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setInfo(null);
    const formData = new FormData(e.currentTarget);
    startProfile(async () => {
      const res = await updatePatientProfileAction(userId, formData);
      if (res?.error) setError(res.error);
      else setInfo("تم حفظ البيانات.");
    });
  }

  function handleEmail(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setInfo(null);
    const formData = new FormData(e.currentTarget);
    startEmail(async () => {
      const res = await changePatientEmailAction(userId, formData);
      if (res?.error) setError(res.error);
      else
        setInfo(
          "تم إرسال رابط التأكيد إلى البريد الجديد. لن يتغيّر البريد حتى يضغط المريض الرابط."
        );
    });
  }

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
        <form onSubmit={handleProfile} className="space-y-4">
          <FormField name="fullName" label="الاسم الكامل" defaultValue={fullName} required />
          <FormField
            type="tel"
            name="phone"
            label="رقم الهاتف"
            defaultValue={phone ?? ""}
            inputMode="numeric"
            placeholder="201014443991"
            controlClassName="text-start"
          />
          <Button type="submit" loading={savingProfile} className="font-semibold">
            حفظ البيانات
          </Button>
        </form>

        <hr className="my-6 border-border" />

        {/* Email change (with verification) */}
        <form onSubmit={handleEmail} className="space-y-4">
          <FormField
            type="email"
            name="email"
            label="البريد الإلكتروني"
            defaultValue={claimed ? email : ""}
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
