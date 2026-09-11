"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Pencil, Trash2, Check, X } from "lucide-react";
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

const inputCls =
  "border border-border rounded-xl px-3 py-2 text-sm bg-background text-foreground font-sans focus:outline-none focus:ring-2 focus:ring-primary/30";

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
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="اسم تخصص جديد (مثال: طب الأطفال)"
          className={inputCls + " flex-1"}
        />
        <button
          type="submit"
          disabled={isPending || !newName.trim()}
          className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 font-sans text-sm font-medium text-white transition-colors hover:bg-primary/90 disabled:opacity-50"
        >
          <Plus className="h-4 w-4" />
          إضافة
        </button>
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
                  <input
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className={inputCls + " flex-1"}
                    autoFocus
                  />
                  <button
                    onClick={() =>
                      run(
                        () => renameSpecialtyAction(s.id, editName.trim()),
                        () => setEditingId(null)
                      )
                    }
                    disabled={isPending || !editName.trim()}
                    title="حفظ"
                    className="rounded-lg p-1.5 text-emerald-600 hover:bg-emerald-50 disabled:opacity-50"
                  >
                    <Check className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => setEditingId(null)}
                    title="إلغاء"
                    className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </>
              ) : (
                <>
                  <span className="flex-1 font-sans font-medium text-foreground">{s.name}</span>
                  <span className="rounded-full bg-muted px-2 py-0.5 font-sans text-xs text-muted-foreground">
                    {s.doctorCount} طبيب
                  </span>
                  <button
                    onClick={() => {
                      setEditingId(s.id);
                      setEditName(s.name);
                    }}
                    title="تعديل"
                    className="rounded-lg p-1.5 text-muted-foreground hover:bg-primary/10 hover:text-primary"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button
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
                    className="rounded-lg p-1.5 text-muted-foreground hover:bg-red-50 hover:text-red-500 disabled:opacity-40"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
