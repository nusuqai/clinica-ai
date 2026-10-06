"use client";

import { useState, useTransition } from "react";
import { Trash2 } from "lucide-react";
import { setDoctorActiveAction, deleteDoctorAction } from "@/server/actions/admin";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";

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
      if (res?.error) {
        setError(res.error);
        setActive(active);
      }
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
      <Switch
        checked={active}
        onCheckedChange={toggleActive}
        disabled={isPending}
        title={active ? "إلغاء تفعيل" : "تفعيل"}
        className="data-[state=checked]:bg-emerald-500"
      />
      <Button
        variant="ghost-destructive"
        size="icon"
        onClick={handleDelete}
        disabled={isPending}
        title="حذف الطبيب"
      >
        <Trash2 />
      </Button>
      {error && <p className="font-sans text-xs text-red-500">{error}</p>}
    </div>
  );
}
