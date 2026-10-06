"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Pencil, Trash2, Check, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import {
  createSpecialtyAction,
  renameSpecialtyAction,
  deleteSpecialtyAction,
} from "@/server/actions/admin";

export interface SpecialtyView {
  id: string;
  name: string;
  doctorCount: number;
}

export default function SpecialtiesManager({ specialties }: { specialties: SpecialtyView[] }) {
  const router = useRouter();
  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function run(fn: () => Promise<{ error?: string } | void>, after?: () => void) {
    setError(null);
    startTransition(async () => {
      const res = await fn();
      if (res && "error" in res && res.error) setError(res.error);
      else {
        after?.();
        router.refresh();
      }
    });
  }

  function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    run(
      () => createSpecialtyAction(newName.trim()),
      () => setNewName("")
    );
  }

  return (
    <div className="max-w-2xl">
      {error && (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 font-sans text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Add */}
      <form onSubmit={handleAdd} className="mb-6 flex gap-2">
        <FormField
          value={newName}
          onValueChange={setNewName}
          placeholder="اسم تخصص جديد (مثال: طب الأطفال)"
          className="flex-1"
        />
        <Button type="submit" disabled={isPending || !newName.trim()}>
          <Plus />
          إضافة
        </Button>
      </form>

      {specialties.length === 0 ? (
        <div className="rounded-2xl border border-border bg-card py-16 text-center">
          <p className="font-sans text-muted-foreground">
            لا توجد تخصصات بعد. أضف تخصصاً ليظهر في نموذج إضافة الأطباء.
          </p>
        </div>
      ) : (
        <div className="divide-y divide-border rounded-2xl border border-border bg-card">
          {specialties.map((s) => (
            <div key={s.id} className="flex items-center gap-3 px-5 py-3">
              {editingId === s.id ? (
                <>
                  <FormField
                    value={editName}
                    onValueChange={setEditName}
                    className="flex-1"
                    autoFocus
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() =>
                      run(
                        () => renameSpecialtyAction(s.id, editName.trim()),
                        () => setEditingId(null)
                      )
                    }
                    disabled={isPending || !editName.trim()}
                    title="حفظ"
                    className="text-emerald-600 hover:bg-emerald-50 hover:text-emerald-600"
                  >
                    <Check />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setEditingId(null)}
                    title="إلغاء"
                  >
                    <X />
                  </Button>
                </>
              ) : (
                <>
                  <span className="flex-1 font-sans font-medium text-foreground">{s.name}</span>
                  <Badge variant="muted">{s.doctorCount} طبيب</Badge>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => {
                      setEditingId(s.id);
                      setEditName(s.name);
                    }}
                    title="تعديل"
                    className="hover:bg-primary/10 hover:text-primary"
                  >
                    <Pencil />
                  </Button>
                  <Button
                    variant="ghost-destructive"
                    size="icon"
                    onClick={() =>
                      run(() => {
                        if (
                          !confirm(
                            s.doctorCount > 0
                              ? `هذا التخصص مرتبط بـ ${s.doctorCount} طبيب. سيُزال تخصصهم عند الحذف. متابعة؟`
                              : "حذف هذا التخصص؟"
                          )
                        )
                          return Promise.resolve();
                        return deleteSpecialtyAction(s.id);
                      })
                    }
                    disabled={isPending}
                    title="حذف"
                  >
                    <Trash2 />
                  </Button>
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
