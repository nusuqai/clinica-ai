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

export default function SpecialtiesManager({
  specialties,
}: {
  specialties: SpecialtyView[];
}) {
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
    run(() => createSpecialtyAction(newName.trim()), () => setNewName(""));
  }

  return (
    <div className="max-w-2xl">
      {error && (
        <div className="mb-4 bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm font-sans">
          {error}
        </div>
      )}

      {/* Add */}
      <form onSubmit={handleAdd} className="flex gap-2 mb-6">
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="اسم تخصص جديد (مثال: طب الأطفال)"
          className={inputCls + " flex-1"}
        />
        <button
          type="submit"
          disabled={isPending || !newName.trim()}
          className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-xl text-sm font-medium font-sans hover:bg-primary/90 transition-colors disabled:opacity-50"
        >
          <Plus className="w-4 h-4" />
          إضافة
        </button>
      </form>

      {specialties.length === 0 ? (
        <div className="bg-card border border-border rounded-2xl py-16 text-center">
          <p className="text-muted-foreground font-sans">
            لا توجد تخصصات بعد. أضف تخصصاً ليظهر في نموذج إضافة الأطباء.
          </p>
        </div>
      ) : (
        <div className="bg-card border border-border rounded-2xl divide-y divide-border">
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
                        () => setEditingId(null),
                      )
                    }
                    disabled={isPending || !editName.trim()}
                    title="حفظ"
                    className="p-1.5 rounded-lg text-emerald-600 hover:bg-emerald-50 disabled:opacity-50"
                  >
                    <Check className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setEditingId(null)}
                    title="إلغاء"
                    className="p-1.5 rounded-lg text-muted-foreground hover:bg-muted"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </>
              ) : (
                <>
                  <span className="flex-1 font-medium text-foreground font-sans">
                    {s.name}
                  </span>
                  <span className="text-xs text-muted-foreground font-sans bg-muted px-2 py-0.5 rounded-full">
                    {s.doctorCount} طبيب
                  </span>
                  <button
                    onClick={() => {
                      setEditingId(s.id);
                      setEditName(s.name);
                    }}
                    title="تعديل"
                    className="p-1.5 rounded-lg text-muted-foreground hover:text-primary hover:bg-primary/10"
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() =>
                      run(() => {
                        if (
                          !confirm(
                            s.doctorCount > 0
                              ? `هذا التخصص مرتبط بـ ${s.doctorCount} طبيب. سيُزال تخصصهم عند الحذف. متابعة؟`
                              : "حذف هذا التخصص؟",
                          )
                        )
                          return Promise.resolve();
                        return deleteSpecialtyAction(s.id);
                      })
                    }
                    disabled={isPending}
                    title="حذف"
                    className="p-1.5 rounded-lg text-muted-foreground hover:text-red-500 hover:bg-red-50 disabled:opacity-40"
                  >
                    <Trash2 className="w-4 h-4" />
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
