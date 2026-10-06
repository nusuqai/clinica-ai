"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, Pencil, Trash2, Check, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import {
  createSpecialtyAction,
  renameSpecialtyAction,
  deleteSpecialtyAction,
} from "@/server/actions/admin";
import { Card } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { Hint } from "@/components/ui/tooltip";
import { specialtySchema, type SpecialtyValues } from "@/lib/validations/admin";

type RunFn = (fn: () => Promise<{ error?: string } | void>, after?: () => void) => void;

export interface SpecialtyView {
  id: string;
  name: string;
  doctorCount: number;
}

export default function SpecialtiesManager({ specialties }: { specialties: SpecialtyView[] }) {
  const router = useRouter();
  const confirm = useConfirm();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const addForm = useForm<SpecialtyValues>({
    resolver: zodResolver(specialtySchema),
    defaultValues: { name: "" },
  });

  const run: RunFn = (fn, after) => {
    setError(null);
    startTransition(async () => {
      const res = await fn();
      if (res && "error" in res && res.error) setError(res.error);
      else {
        after?.();
        router.refresh();
      }
    });
  };

  const handleAdd = addForm.handleSubmit(({ name }) =>
    run(
      () => createSpecialtyAction(name),
      () => addForm.reset()
    )
  );

  return (
    <div className="max-w-2xl">
      {error && (
        <Alert variant="destructive" className="mb-4">
          {error}
        </Alert>
      )}

      {/* Add */}
      <form onSubmit={handleAdd} noValidate className="mb-6 flex items-start gap-2">
        <FormField
          control={addForm.control}
          name="name"
          placeholder="اسم تخصص جديد (مثال: طب الأطفال)"
          className="flex-1"
        />
        <Button type="submit" disabled={isPending}>
          <Plus />
          إضافة
        </Button>
      </form>

      {specialties.length === 0 ? (
        <Card className="py-16 text-center">
          <p className="font-sans text-muted-foreground">
            لا توجد تخصصات بعد. أضف تخصصاً ليظهر في نموذج إضافة الأطباء.
          </p>
        </Card>
      ) : (
        <Card className="divide-y divide-border">
          {specialties.map((s) => (
            <div key={s.id} className="flex items-center gap-3 px-5 py-3">
              {editingId === s.id ? (
                <RenameRow
                  specialty={s}
                  isPending={isPending}
                  run={run}
                  onDone={() => setEditingId(null)}
                />
              ) : (
                <>
                  <span className="flex-1 font-sans font-medium text-foreground">{s.name}</span>
                  <Badge variant="muted">{s.doctorCount} طبيب</Badge>
                  <Hint label="تعديل">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setEditingId(s.id)}
                      aria-label="تعديل"
                      className="hover:bg-primary/10 hover:text-primary"
                    >
                      <Pencil />
                    </Button>
                  </Hint>
                  <Hint label="حذف">
                    <Button
                      variant="ghost-destructive"
                      size="icon"
                      onClick={async () => {
                        const ok = await confirm({
                          title: "حذف التخصص",
                          description:
                            s.doctorCount > 0
                              ? `هذا التخصص مرتبط بـ ${s.doctorCount} طبيب. سيُزال تخصصهم عند الحذف. متابعة؟`
                              : "حذف هذا التخصص؟",
                        });
                        if (ok) run(() => deleteSpecialtyAction(s.id));
                      }}
                      disabled={isPending}
                      aria-label="حذف"
                    >
                      <Trash2 />
                    </Button>
                  </Hint>
                </>
              )}
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}

/** Inline rename: its own small form, so typing re-renders just this row. */
function RenameRow({
  specialty,
  isPending,
  run,
  onDone,
}: {
  specialty: SpecialtyView;
  isPending: boolean;
  run: RunFn;
  onDone: () => void;
}) {
  const form = useForm<SpecialtyValues>({
    resolver: zodResolver(specialtySchema),
    defaultValues: { name: specialty.name },
  });

  const handleSave = form.handleSubmit(({ name }) =>
    run(() => renameSpecialtyAction(specialty.id, name), onDone)
  );

  return (
    <form onSubmit={handleSave} noValidate className="flex flex-1 items-start gap-3">
      <FormField control={form.control} name="name" className="flex-1" autoFocus />
      <Hint label="حفظ">
        <Button
          type="submit"
          variant="ghost"
          size="icon"
          disabled={isPending}
          aria-label="حفظ"
          className="text-emerald-600 hover:bg-emerald-50 hover:text-emerald-600"
        >
          <Check />
        </Button>
      </Hint>
      <Hint label="إلغاء">
        <Button type="button" variant="ghost" size="icon" onClick={onDone} aria-label="إلغاء">
          <X />
        </Button>
      </Hint>
    </form>
  );
}
