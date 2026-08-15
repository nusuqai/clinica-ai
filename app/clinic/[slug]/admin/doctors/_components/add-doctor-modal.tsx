"use client";

import { useState, useTransition, useRef } from "react";
import { UserPlus } from "lucide-react";
import Modal from "@/components/admin/modal";
import { createDoctorAction } from "@/server/actions/admin";
import SpecialtySelect, { type SpecialtyOption } from "./specialty-select";

export interface BranchOption {
  id: string;
  name: string;
}

export default function AddDoctorModal({
  branches,
  specialties,
}: {
  branches: BranchOption[];
  specialties: SpecialtyOption[];
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [withAccount, setWithAccount] = useState(false);
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

            {/* Create login account toggle — doctors can exist without one */}
            <label className="sm:col-span-2 flex items-center gap-2 text-sm font-medium text-foreground font-sans">
              <input
                type="checkbox"
                checked={withAccount}
                onChange={(e) => setWithAccount(e.target.checked)}
              />
              إنشاء حساب دخول للطبيب (اختياري — يمكن ربطه لاحقاً)
            </label>

            {withAccount && (
              <>
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
              </>
            )}

            {/* Specialty */}
            <div>
              <SpecialtySelect specialties={specialties} required />
            </div>

            {/* Years of experience */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground font-sans">سنوات الخبرة (اختياري)</label>
              <input
                name="yearsOfExperience"
                type="number"
                min={0}
                dir="ltr"
                placeholder="10"
                className="w-full border border-border rounded-xl px-3 py-2 text-sm bg-background text-foreground font-sans focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>

            {/* Examination fee */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground font-sans">سعر الكشف (اختياري)</label>
              <input
                name="examinationFee"
                type="number"
                min={0}
                step="0.01"
                dir="ltr"
                placeholder="200.00"
                className="w-full border border-border rounded-xl px-3 py-2 text-sm bg-background text-foreground font-sans focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>

            {/* Consultation (follow-up) fee */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground font-sans">سعر الاستشارة (اختياري)</label>
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

          {/* Flags */}
          <div className="flex flex-wrap gap-4">
            <label className="flex items-center gap-2 text-sm font-medium text-foreground font-sans">
              <input type="checkbox" name="requiresAdvanceBooking" defaultChecked />
              يحتاج حجزاً مسبقاً
            </label>
            <label className="flex items-center gap-2 text-sm font-medium text-foreground font-sans">
              <input type="checkbox" name="acceptsChildren" />
              يكشف على الأطفال
            </label>
          </div>

          {/* Branches */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground font-sans">فروع العمل</label>
            {branches.length === 0 ? (
              <p className="text-xs text-muted-foreground font-sans">
                لا توجد فروع. أضف فرعاً من صفحة الفروع أولاً.
              </p>
            ) : (
              <div className="flex flex-wrap gap-3">
                {branches.map((b) => (
                  <label
                    key={b.id}
                    className="flex items-center gap-2 text-sm font-sans border border-border rounded-xl px-3 py-2 cursor-pointer hover:bg-muted"
                  >
                    <input type="checkbox" name="branchIds" value={b.id} />
                    {b.name}
                  </label>
                ))}
              </div>
            )}
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
              {isPending ? "جارٍ الحفظ..." : "إضافة الطبيب"}
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
