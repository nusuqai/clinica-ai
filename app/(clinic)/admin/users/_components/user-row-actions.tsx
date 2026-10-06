"use client";

import { useState, useTransition } from "react";
import { Trash2 } from "lucide-react";
import { Role } from "@prisma/client";
import { updateUserRoleAction, deleteUserAction } from "@/server/actions/admin";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";

const roles: { value: Role; label: string }[] = [
  { value: Role.PATIENT, label: "مريض" },
  { value: Role.DOCTOR, label: "طبيب" },
  { value: Role.ADMIN, label: "مسؤول" },
];

interface UserRowActionsProps {
  userId: string;
  currentRole: Role;
  isSelf: boolean;
}

export default function UserRowActions({ userId, currentRole, isSelf }: UserRowActionsProps) {
  const [role, setRole] = useState(currentRole);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleRoleChange(newRole: Role) {
    setRole(newRole);
    setError(null);
    startTransition(async () => {
      const res = await updateUserRoleAction(userId, newRole);
      if (res?.error) {
        setError(res.error);
        setRole(currentRole);
      }
    });
  }

  function handleDelete() {
    if (!confirm("هل أنت متأكد من حذف هذا المستخدم؟ لا يمكن التراجع.")) return;
    startTransition(async () => {
      const res = await deleteUserAction(userId);
      if (res?.error) setError(res.error);
    });
  }

  return (
    <div className="flex items-center gap-2">
      <FormField
        type="select"
        value={role}
        disabled={isSelf || isPending}
        onValueChange={(v) => handleRoleChange(v as Role)}
        options={roles}
        className="w-28"
        controlClassName="h-8 rounded-lg"
      />
      <Button
        variant="ghost-destructive"
        size="icon"
        onClick={handleDelete}
        disabled={isSelf || isPending}
        title="حذف المستخدم"
      >
        <Trash2 />
      </Button>
      {error && <p className="font-sans text-xs text-red-500">{error}</p>}
    </div>
  );
}
