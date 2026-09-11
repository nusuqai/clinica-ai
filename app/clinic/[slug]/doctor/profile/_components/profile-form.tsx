"use client";

import { useState, useTransition } from "react";
import { updateMyProfileAction } from "@/server/actions/doctor";
import SpecialtySelect, {
  type SpecialtyOption,
} from "@/app/clinic/[slug]/admin/doctors/_components/specialty-select";

interface ProfileFormProps {
  fullName: string;
  phone: string | null;
  specialtyId: string | null;
  specialties: SpecialtyOption[];
  bio: string | null;
  consultationFee: string | null;
}

export default function ProfileForm({
  fullName,
  phone,
  specialtyId,
  specialties,
  bio,
  consultationFee,
}: ProfileFormProps) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSuccess(false);
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      const res = await updateMyProfileAction(formData);
      if (res?.error) {
        setError(res.error);
        return;
      }
      setSuccess(true);
      setTimeout(() => setSuccess(false), 4000);
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 font-sans text-sm text-red-700">
          {error}
        </div>
      )}
      {success && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 font-sans text-sm text-emerald-700">
          تم تحديث الملف الشخصي بنجاح
        </div>
      )}

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <div className="space-y-1.5">
          <label className="font-sans text-sm font-medium text-foreground">الاسم الكامل *</label>
          <input
            name="fullName"
            type="text"
            required
            defaultValue={fullName}
            placeholder="د. محمد أحمد"
            className="w-full rounded-xl border border-border bg-background px-3 py-2.5 font-sans text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
        </div>

        <div className="space-y-1.5">
          <label className="font-sans text-sm font-medium text-foreground">رقم الهاتف</label>
          <input
            name="phone"
            type="tel"
            defaultValue={phone ?? ""}
            placeholder="+966 5XXXXXXXX"
            dir="ltr"
            className="w-full rounded-xl border border-border bg-background px-3 py-2.5 font-sans text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
        </div>

        <div>
          <SpecialtySelect specialties={specialties} defaultSpecialtyId={specialtyId} />
        </div>

        <div className="space-y-1.5">
          <label className="font-sans text-sm font-medium text-foreground">
            رسوم الاستشارة (ر.س)
          </label>
          <input
            name="consultationFee"
            type="number"
            min="0"
            step="0.01"
            defaultValue={consultationFee ?? ""}
            placeholder="150"
            dir="ltr"
            className="w-full rounded-xl border border-border bg-background px-3 py-2.5 font-sans text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
        </div>

        <div className="space-y-1.5 sm:col-span-2">
          <label className="font-sans text-sm font-medium text-foreground">نبذة عنك</label>
          <textarea
            name="bio"
            rows={4}
            defaultValue={bio ?? ""}
            placeholder="اكتب نبذة مختصرة عن خبرتك وتخصصك..."
            className="w-full resize-none rounded-xl border border-border bg-background px-3 py-2.5 font-sans text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
        </div>
      </div>

      <div className="flex items-center gap-4 pt-2">
        <button
          type="submit"
          disabled={isPending}
          className="rounded-xl bg-primary px-6 py-2.5 font-sans text-sm font-medium text-white transition-colors hover:bg-primary/90 disabled:opacity-60"
        >
          {isPending ? "جارٍ الحفظ..." : "حفظ التغييرات"}
        </button>
      </div>
    </form>
  );
}
