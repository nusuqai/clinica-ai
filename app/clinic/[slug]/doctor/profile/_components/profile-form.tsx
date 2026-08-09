"use client";

import { useState, useTransition } from "react";
import { updateMyProfileAction } from "@/server/actions/doctor";

interface ProfileFormProps {
  fullName: string;
  phone: string | null;
  specialty: string;
  bio: string | null;
  consultationFee: string | null;
}

export default function ProfileForm({
  fullName,
  phone,
  specialty,
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
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm font-sans">
          {error}
        </div>
      )}
      {success && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-xl px-4 py-3 text-sm font-sans">
          تم تحديث الملف الشخصي بنجاح
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-foreground font-sans">
            الاسم الكامل *
          </label>
          <input
            name="fullName"
            type="text"
            required
            defaultValue={fullName}
            placeholder="د. محمد أحمد"
            className="w-full border border-border rounded-xl px-3 py-2.5 text-sm bg-background text-foreground font-sans focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-sm font-medium text-foreground font-sans">
            رقم الهاتف
          </label>
          <input
            name="phone"
            type="tel"
            defaultValue={phone ?? ""}
            placeholder="+966 5XXXXXXXX"
            dir="ltr"
            className="w-full border border-border rounded-xl px-3 py-2.5 text-sm bg-background text-foreground font-sans focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-sm font-medium text-foreground font-sans">
            التخصص *
          </label>
          <input
            name="specialty"
            type="text"
            required
            defaultValue={specialty}
            placeholder="طب عام، قلب، أسنان..."
            className="w-full border border-border rounded-xl px-3 py-2.5 text-sm bg-background text-foreground font-sans focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-sm font-medium text-foreground font-sans">
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
            className="w-full border border-border rounded-xl px-3 py-2.5 text-sm bg-background text-foreground font-sans focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
        </div>

        <div className="space-y-1.5 sm:col-span-2">
          <label className="text-sm font-medium text-foreground font-sans">
            نبذة عنك
          </label>
          <textarea
            name="bio"
            rows={4}
            defaultValue={bio ?? ""}
            placeholder="اكتب نبذة مختصرة عن خبرتك وتخصصك..."
            className="w-full border border-border rounded-xl px-3 py-2.5 text-sm bg-background text-foreground font-sans focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none"
          />
        </div>
      </div>

      <div className="flex items-center gap-4 pt-2">
        <button
          type="submit"
          disabled={isPending}
          className="px-6 py-2.5 bg-primary text-white rounded-xl text-sm font-medium font-sans hover:bg-primary/90 transition-colors disabled:opacity-60"
        >
          {isPending ? "جارٍ الحفظ..." : "حفظ التغييرات"}
        </button>
      </div>
    </form>
  );
}
