"use client";

import { useState, useTransition } from "react";
import { Trash2 } from "lucide-react";
import { setDoctorActiveAction, deleteDoctorAction } from "@/server/actions/admin";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { Hint } from "@/components/ui/tooltip";

interface DoctorRowActionsProps {
  doctorId: string;
  /** Named in the delete confirmation. */
  doctorName: string;
  isActive: boolean;
}

export default function DoctorRowActions({
  doctorId,
  doctorName,
  isActive,
}: DoctorRowActionsProps) {
  const [active, setActive] = useState(isActive);
  const [isPending, startTransition] = useTransition();
  const confirm = useConfirm();
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

  async function handleDelete() {
    setError(null);
    await confirm({
      title: "حذف الطبيب",
      description: <>هل تريد حذف الطبيب «د. {doctorName}»؟</>,
      warning: "سيتم حذف حسابه بالكامل وقواعد توفّره، ولا يمكن التراجع.",
      onConfirm: () => deleteDoctorAction(doctorId),
    });
  }

  return (
    <div className="flex items-center gap-2">
      <Hint label={active ? "إلغاء تفعيل" : "تفعيل"}>
        <Switch
          aria-label={active ? "إلغاء تفعيل" : "تفعيل"}
          checked={active}
          onCheckedChange={toggleActive}
          disabled={isPending}
          className="data-[state=checked]:bg-emerald-500"
        />
      </Hint>
      <Hint label="حذف الطبيب">
        <Button
          aria-label="حذف الطبيب"
          variant="ghost-destructive"
          size="icon"
          onClick={handleDelete}
          disabled={isPending}
        >
          <Trash2 />
        </Button>
      </Hint>
      {error && <p className="font-sans text-xs text-red-500">{error}</p>}
    </div>
  );
}
