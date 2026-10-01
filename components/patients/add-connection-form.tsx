"use client";

import { useState, useTransition } from "react";
import { AlertCircle, Plus, UserPlus } from "lucide-react";
import { ConnectionRelation } from "@prisma/client";
import { addConnectionAction } from "@/server/actions/patient";
import { CONNECTION_RELATION_LABELS } from "@/lib/labels";
import { PHONE_EXAMPLE } from "@/lib/phone";

// Lets a patient add a relative they book for. Collapsed to a single button until
// opened; the relative's account is created server-side (see addDependent).

const inputClass =
  "w-full rounded-xl border border-border bg-background px-4 py-2.5 font-sans text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20";

export default function AddConnectionForm() {
  const [open, setOpen] = useState(false);
  const [fullName, setFullName] = useState("");
  const [relation, setRelation] = useState<ConnectionRelation>(ConnectionRelation.CHILD);
  const [phone, setPhone] = useState("");
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 rounded-xl border border-dashed border-primary/40 px-4 py-2.5 font-sans text-sm font-medium text-primary transition-colors hover:bg-primary/5"
      >
        <UserPlus className="h-4 w-4" />
        إضافة شخص تحجز له
      </button>
    );
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!fullName.trim()) {
      setError("الاسم مطلوب");
      return;
    }
    setError("");
    startTransition(async () => {
      const res = await addConnectionAction({ fullName, relation, phone: phone || null });
      if (!res.ok) {
        setError(res.error ?? "حدث خطأ غير متوقع");
        return;
      }
      setFullName("");
      setPhone("");
      setOpen(false);
    });
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="grid gap-4 rounded-2xl border border-border bg-muted/20 p-5 sm:grid-cols-3"
    >
      <div>
        <label className="mb-1.5 block font-sans text-xs font-medium text-foreground">
          الاسم الكامل <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          placeholder="اسم الشخص"
          className={inputClass}
        />
      </div>
      <div>
        <label className="mb-1.5 block font-sans text-xs font-medium text-foreground">
          صلته بك
        </label>
        <select
          value={relation}
          onChange={(e) => setRelation(e.target.value as ConnectionRelation)}
          className={inputClass}
        >
          {Object.values(ConnectionRelation).map((r) => (
            <option key={r} value={r}>
              {CONNECTION_RELATION_LABELS[r]}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="mb-1.5 block font-sans text-xs font-medium text-foreground">
          رقم واتساب <span className="font-normal text-muted-foreground">(اختياري)</span>
        </label>
        <input
          type="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder={PHONE_EXAMPLE}
          dir="ltr"
          className={inputClass}
        />
      </div>

      {error && (
        <p className="flex items-center gap-1.5 font-sans text-sm text-red-600 sm:col-span-3">
          <AlertCircle className="h-4 w-4" />
          {error}
        </p>
      )}

      <div className="flex gap-2 sm:col-span-3">
        <button
          type="submit"
          disabled={isPending}
          className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 font-sans text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          <Plus className="h-4 w-4" />
          {isPending ? "جارٍ الإضافة…" : "إضافة"}
        </button>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setError("");
          }}
          className="rounded-xl px-4 py-2.5 font-sans text-sm text-muted-foreground hover:bg-muted"
        >
          إلغاء
        </button>
      </div>
    </form>
  );
}
