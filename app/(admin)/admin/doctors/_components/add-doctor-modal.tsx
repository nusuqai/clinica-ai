"use client";

import { useState, useTransition, useRef } from "react";
import { UserPlus } from "lucide-react";
import Modal from "@/components/admin/modal";
import { createDoctorAction } from "@/server/actions/admin";

export default function AddDoctorModal() {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      const res = await createDoctorAction(formData);
      if (res?.error) {
        setError(res.error);
      } else {
        setOpen(false);
        formRef.current?.reset();
      }
    });
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-xl text-sm font-medium font-sans hover:bg-primary/90 transition-colors"
      >
        <UserPlus className="w-4 h-4" />
        إضافة طبيب
      </button>

      <Modal open={open} onClose={() => setOpen(false)} title="إضافة طبيب جديد" width="max-w-2xl">
        <form ref={formRef} onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm font-sans">
              {error}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Full name */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground font-sans">الاسم الكامل *</label>
              <input
                name="fullName"
                required
                placeholder="د. أحمد محمد"
                className="w-full border border-border rounded-xl px-3 py-2 text-sm bg-background text-foreground font-sans focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>

            {/* Phone */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground font-sans">رقم الهاتف (اختياري)</label>
              <input
                name="phone"
                type="tel"
                dir="ltr"
                placeholder="+966512345678"
                className="w-full border border-border rounded-xl px-3 py-2 text-sm bg-background text-foreground font-sans focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>

            {/* Email */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground font-sans">البريد الإلكتروني *</label>
              <input
                name="email"
                required
                type="email"
                dir="ltr"
                placeholder="doctor@example.com"
                className="w-full border border-border rounded-xl px-3 py-2 text-sm bg-background text-foreground font-sans focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>

            {/* Password */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground font-sans">كلمة المرور *</label>
              <input
                name="password"
                required
                type="password"
                minLength={8}
                placeholder="8 أحرف على الأقل"
                className="w-full border border-border rounded-xl px-3 py-2 text-sm bg-background text-foreground font-sans focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>

            {/* Specialty */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground font-sans">التخصص *</label>
              <input
                name="specialty"
                required
                placeholder="طب الأسرة"
                className="w-full border border-border rounded-xl px-3 py-2 text-sm bg-background text-foreground font-sans focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>

            {/* Consultation fee */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground font-sans">رسوم الاستشارة (اختياري)</label>
              <input
                name="consultationFee"
                type="number"
                min={0}
                step="0.01"
                dir="ltr"
                placeholder="150.00"
                className="w-full border border-border rounded-xl px-3 py-2 text-sm bg-background text-foreground font-sans focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
          </div>

          {/* Bio */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground font-sans">نبذة تعريفية (اختياري)</label>
            <textarea
              name="bio"
              rows={3}
              placeholder="خبرة في..."
              className="w-full border border-border rounded-xl px-3 py-2 text-sm bg-background text-foreground font-sans resize-none focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="submit"
              disabled={isPending}
              className="flex-1 bg-primary text-white rounded-xl py-2.5 text-sm font-medium font-sans hover:bg-primary/90 transition-colors disabled:opacity-60"
            >
              {isPending ? "جارٍ الإنشاء..." : "إنشاء حساب الطبيب"}
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="px-4 border border-border rounded-xl text-sm font-medium font-sans text-foreground hover:bg-muted transition-colors"
            >
              إلغاء
            </button>
          </div>
        </form>
      </Modal>
    </>
  );
}
