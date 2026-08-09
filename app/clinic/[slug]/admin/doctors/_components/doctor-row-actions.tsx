"use client";

import { useState, useTransition } from "react";
import { Trash2 } from "lucide-react";
import { setDoctorActiveAction, deleteDoctorAction } from "@/server/actions/admin";

interface DoctorRowActionsProps {
  doctorId: string;
  isActive: boolean;
}

export default function DoctorRowActions({ doctorId, isActive }: DoctorRowActionsProps) {
  const [active, setActive] = useState(isActive);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function toggleActive() {
    setActive((v) => !v);
    startTransition(async () => {
      const res = await setDoctorActiveAction(doctorId, !active);
      if (res?.error) { setError(res.error); setActive(active); }
    });
  }

  function handleDelete() {
    if (!confirm("هل أنت متأكد من حذف هذا الطبيب وحسابه كاملاً؟")) return;
    startTransition(async () => {
      const res = await deleteDoctorAction(doctorId);
      if (res?.error) setError(res.error);
    });
  }

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={toggleActive}
        disabled={isPending}
        className={[
          "relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none disabled:opacity-50",
          active ? "bg-emerald-500" : "bg-muted-foreground/30",
        ].join(" ")}
        title={active ? "إلغاء تفعيل" : "تفعيل"}
      >
        <span
          className={[
            "inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform",
            active ? "-translate-x-4" : "-translate-x-1",
          ].join(" ")}
        />
      </button>
      <button
        onClick={handleDelete}
        disabled={isPending}
        title="حذف الطبيب"
        className="p-1.5 rounded-lg text-muted-foreground hover:text-red-500 hover:bg-red-50 transition-colors disabled:opacity-40"
      >
        <Trash2 className="w-4 h-4" />
      </button>
      {error && <p className="text-xs text-red-500 font-sans">{error}</p>}
    </div>
  );
}
