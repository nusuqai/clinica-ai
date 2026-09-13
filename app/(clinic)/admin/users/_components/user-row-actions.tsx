"use client";

import { useState, useTransition } from "react";
import { Trash2 } from "lucide-react";
import { Role } from "@prisma/client";
import { updateUserRoleAction, deleteUserAction } from "@/server/actions/admin";

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
      <select
        value={role}
        disabled={isSelf || isPending}
        onChange={(e) => handleRoleChange(e.target.value as Role)}
        className="rounded-lg border border-border bg-background px-2 py-1 font-sans text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:opacity-50"
      >
        {roles.map((r) => (
          <option key={r.value} value={r.value}>
            {r.label}
          </option>
        ))}
      </select>
      <button
        onClick={handleDelete}
        disabled={isSelf || isPending}
        title="حذف المستخدم"
        className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-red-50 hover:text-red-500 disabled:opacity-40"
      >
        <Trash2 className="h-4 w-4" />
      </button>
      {error && <p className="font-sans text-xs text-red-500">{error}</p>}
    </div>
  );
}
