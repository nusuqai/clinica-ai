"use client";

import { useState, useTransition } from "react";
import { AlertCircle, MessageCircle, Pencil } from "lucide-react";
import { setConnectionPhoneAction } from "@/server/actions/patient";
import { PHONE_EXAMPLE } from "@/lib/phone";

// Add/change a relative's WhatsApp number, shown as its own block inside a
// connection row on the patient's own profile. With no number yet it is a
// prominent call to action, since until then the relative's messages go to
// the patient.

export default function ConnectionPhoneForm({
  dependentId,
  currentPhone,
}: {
  dependentId: string;
  currentPhone: string | null;
}) {
  const [editing, setEditing] = useState(false);
  const [phone, setPhone] = useState(currentPhone ?? "");
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  function save(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    startTransition(async () => {
      const res = await setConnectionPhoneAction(dependentId, phone);
      if (res.ok) setEditing(false);
      else setError(res.error ?? "حدث خطأ غير متوقع");
    });
  }

  if (editing) {
    return (
      <form onSubmit={save} className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-4">
        <label className="mb-2 flex items-center gap-1.5 text-sm font-medium text-foreground">
          <MessageCircle className="h-4 w-4 text-emerald-600" />
          رقم واتساب هذا الشخص
        </label>
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder={PHONE_EXAMPLE}
            dir="ltr"
            autoFocus
            className="min-w-0 flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
          />
          <button
            type="submit"
            disabled={isPending || !phone.trim()}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-700 disabled:opacity-60"
          >
            {isPending ? "جارٍ الحفظ…" : "حفظ"}
          </button>
          <button
            type="button"
            onClick={() => {
              setEditing(false);
              setError("");
              setPhone(currentPhone ?? "");
            }}
            className="rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-muted"
          >
            إلغاء
          </button>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          بالصيغة الدولية بدون + أو أصفار في البداية، مثل {PHONE_EXAMPLE}
        </p>
        {error && (
          <p className="mt-2 flex items-center gap-1.5 text-xs text-red-600">
            <AlertCircle className="h-3.5 w-3.5" />
            {error}
          </p>
        )}
      </form>
    );
  }

  if (!currentPhone) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50/70 p-4">
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground">لا يوجد رقم واتساب لهذا الشخص</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            تصل رسائل ومواعيد التذكير الخاصة به إليك. أضف رقمه ليتواصل مع العيادة مباشرة.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="inline-flex flex-shrink-0 items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-emerald-700"
        >
          <MessageCircle className="h-4 w-4" />
          إضافة رقم واتساب
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card p-4">
      <div className="flex items-center gap-2.5">
        <MessageCircle className="h-5 w-5 text-emerald-600" />
        <div>
          <p className="text-xs text-muted-foreground">رقم واتساب</p>
          <p className="text-sm font-medium text-foreground" dir="ltr">
            {currentPhone}
          </p>
        </div>
      </div>
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-muted"
      >
        <Pencil className="h-3.5 w-3.5" />
        تغيير الرقم
      </button>
    </div>
  );
}
