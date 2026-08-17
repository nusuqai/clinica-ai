"use client";

import { useState, useTransition } from "react";
import { Pencil, Loader2 } from "lucide-react";
import Modal from "@/components/admin/modal";
import {
  updatePatientProfileAction,
  changePatientEmailAction,
} from "@/server/actions/admin";

interface Props {
  userId: string;
  fullName: string;
  phone: string | null;
  email: string;
  /** True once the email is real (not a WhatsApp placeholder). */
  claimed: boolean;
}

export default function EditPatientModal({
  userId,
  fullName,
  phone,
  email,
  claimed,
}: Props) {
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
      else setInfo("تم إرسال رابط التأكيد إلى البريد الجديد. لن يتغيّر البريد حتى يضغط المريض الرابط.");
    });
  }

  const field =
    "block w-full px-4 py-2.5 font-sans text-sm border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent bg-card transition-all";
  const label = "block text-sm font-medium text-muted-foreground font-sans mb-1.5";

  return (
    <>
      <button
        onClick={() => {
          setError(null);
          setInfo(null);
          setOpen(true);
        }}
        className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium font-sans bg-primary text-white hover:bg-primary/90 transition-colors"
      >
        <Pencil className="w-4 h-4" />
        تعديل
      </button>

      <Modal open={open} onClose={() => setOpen(false)} title="تعديل بيانات المريض">
        {error && (
          <div className="mb-4 bg-red-50 border border-red-100 text-red-600 rounded-xl px-4 py-3 text-sm font-sans">
            {error}
          </div>
        )}
        {info && (
          <div className="mb-4 bg-emerald-50 border border-emerald-100 text-emerald-700 rounded-xl px-4 py-3 text-sm font-sans">
            {info}
          </div>
        )}

        {/* Profile (name + phone) */}
        <form onSubmit={handleProfile} className="space-y-4">
          <div>
            <label className={label}>الاسم الكامل</label>
            <input name="fullName" defaultValue={fullName} required className={field} />
          </div>
          <div>
            <label className={label}>رقم الهاتف</label>
            <input
              name="phone"
              defaultValue={phone ?? ""}
              dir="ltr"
              inputMode="numeric"
              placeholder="201014443991"
              className={`${field} text-start`}
            />
          </div>
          <button
            type="submit"
            disabled={savingProfile}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold font-sans bg-primary text-white hover:bg-primary/90 transition-colors disabled:opacity-60"
          >
            {savingProfile && <Loader2 className="w-4 h-4 animate-spin" />}
            حفظ البيانات
          </button>
        </form>

        <hr className="my-6 border-border" />

        {/* Email change (with verification) */}
        <form onSubmit={handleEmail} className="space-y-4">
          <div>
            <label className={label}>البريد الإلكتروني</label>
            <input
              name="email"
              type="email"
              defaultValue={claimed ? email : ""}
              dir="ltr"
              required
              placeholder="name@example.com"
              className={`${field} text-start`}
            />
            <p className="text-xs text-muted-foreground font-sans mt-1.5">
              {claimed
                ? "سيُرسل رابط تأكيد إلى البريد الجديد، ولن يتغيّر قبل الضغط عليه."
                : "هذا الحساب لم يُفعّل بريدَه بعد (مُسجّل عبر واتساب). أدخل بريداً لإرسال رابط التأكيد."}
            </p>
          </div>
          <button
            type="submit"
            disabled={savingEmail}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold font-sans border border-border text-foreground hover:bg-muted transition-colors disabled:opacity-60"
          >
            {savingEmail && <Loader2 className="w-4 h-4 animate-spin" />}
            تغيير البريد (بتأكيد)
          </button>
        </form>
      </Modal>
    </>
  );
}
