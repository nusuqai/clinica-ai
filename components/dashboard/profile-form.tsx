"use client";

import { useState, useTransition } from "react";
import { CheckCircle, AlertCircle, Save } from "lucide-react";
import { updateProfileAction } from "@/server/actions/patient";

interface Props {
  email: string;
  defaultFullName: string;
  defaultPhone: string | null;
}

export function ProfileForm({ email, defaultFullName, defaultPhone }: Props) {
  const [fullName, setFullName] = useState(defaultFullName);
  const [phone, setPhone] = useState(defaultPhone ?? "");
  const [isPending, startTransition] = useTransition();
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!fullName.trim()) {
      setError("الاسم الكامل مطلوب");
      return;
    }
    setError("");
    setSuccess(false);
    startTransition(async () => {
      const res = await updateProfileAction(fullName, phone || null);
      if (res.ok) setSuccess(true);
      else setError(res.error ?? "حدث خطأ غير متوقع");
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      {/* Email (read-only) */}
      <div>
        <label className="mb-1.5 block text-sm font-medium text-foreground font-sans">
          البريد الإلكتروني
        </label>
        <input
          type="email"
          value={email}
          readOnly
          className="w-full rounded-xl border border-border bg-muted px-4 py-3 text-sm text-muted-foreground font-sans cursor-not-allowed"
        />
        <p className="mt-1 text-xs text-muted-foreground font-sans">لا يمكن تغيير البريد الإلكتروني</p>
      </div>

      {/* Full name */}
      <div>
        <label className="mb-1.5 block text-sm font-medium text-foreground font-sans">
          الاسم الكامل <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          required
          placeholder="أدخل اسمك الكامل"
          className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm text-foreground font-sans placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
        />
      </div>

      {/* Phone */}
      <div>
        <label className="mb-1.5 block text-sm font-medium text-foreground font-sans">
          رقم الهاتف <span className="text-muted-foreground font-normal">(اختياري)</span>
        </label>
        <input
          type="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="01xxxxxxxxx"
          dir="ltr"
          className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm text-foreground font-sans placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
        />
      </div>

      {/* Feedback */}
      {success && (
        <div className="flex items-center gap-2 rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700 font-sans">
          <CheckCircle className="h-4 w-4 shrink-0" />
          تم تحديث الملف الشخصي بنجاح
        </div>
      )}
      {error && (
        <div className="flex items-center gap-2 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600 font-sans">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={isPending}
        className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-6 py-3 text-sm font-medium text-white transition-opacity disabled:opacity-60 hover:opacity-90 font-sans self-start"
      >
        <Save className="h-4 w-4" />
        {isPending ? "جارٍ الحفظ..." : "حفظ التغييرات"}
      </button>
    </form>
  );
}
