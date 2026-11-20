"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowDown, ArrowUp, Check, Pencil, Plus, Trash2, X } from "lucide-react";
import Modal from "@/components/admin/modal";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { Hint } from "@/components/ui/tooltip";
import {
  createCategoryAction,
  deleteCategoryAction,
  renameCategoryAction,
  reorderCategoriesAction,
  setCategoryActiveAction,
} from "@/server/actions/catalog";
import { categorySchema, type CategoryValues } from "@/lib/validations/catalog";
import type { CategoryView } from "@/server/services/catalog";

type RunFn = (fn: () => Promise<{ error?: string } | void>, after?: () => void) => void;

/** The clinic's category pool — shared by services and packages. */
export default function CategoriesModal({
  open,
  onClose,
  categories,
}: {
  open: boolean;
  onClose: () => void;
  categories: CategoryView[];
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const addForm = useForm<CategoryValues>({
    resolver: zodResolver(categorySchema),
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
      () => createCategoryAction(name),
      () => addForm.reset()
    )
  );

  function move(index: number, by: -1 | 1) {
    const ids = categories.map((c) => c.id);
    const target = index + by;
    if (target < 0 || target >= ids.length) return;
    [ids[index], ids[target]] = [ids[target], ids[index]];
    run(() => reorderCategoriesAction(ids));
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="التصنيفات"
      description="قائمة واحدة تُصنَّف بها الخدمات والباقات (مثال: ليزر، حشو، تغذية)."
      width="max-w-xl"
    >
      {error && (
        <Alert variant="destructive" className="mb-4">
          {error}
        </Alert>
      )}

      <form onSubmit={handleAdd} noValidate className="mb-5 flex items-start gap-2">
        <FormField
          control={addForm.control}
          name="name"
          placeholder="اسم تصنيف جديد"
          className="flex-1"
        />
        <Button type="submit" disabled={isPending}>
          <Plus />
          إضافة
        </Button>
      </form>

      {categories.length === 0 ? (
        <p className="py-8 text-center font-sans text-sm text-muted-foreground">
          لا توجد تصنيفات بعد. أضف تصنيفاً لتبدأ بإضافة الخدمات.
        </p>
      ) : (
        <div className="divide-y divide-border rounded-xl border border-border">
          {categories.map((c, i) => {
            const inUse = c.serviceCount + c.packageCount > 0;
            return (
              <div key={c.id} className="flex items-center gap-2 px-3 py-2">
                {editingId === c.id ? (
                  <RenameRow
                    category={c}
                    isPending={isPending}
                    run={run}
                    onDone={() => setEditingId(null)}
                  />
                ) : (
                  <>
                    <div className="flex flex-col">
                      <button
                        type="button"
                        onClick={() => move(i, -1)}
                        disabled={isPending || i === 0}
                        aria-label="تحريك لأعلى"
                        className="text-muted-foreground hover:text-foreground disabled:opacity-30"
                      >
                        <ArrowUp className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => move(i, 1)}
                        disabled={isPending || i === categories.length - 1}
                        aria-label="تحريك لأسفل"
                        className="text-muted-foreground hover:text-foreground disabled:opacity-30"
                      >
                        <ArrowDown className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    <span className="min-w-0 flex-1 truncate font-sans font-medium text-foreground">
                      {c.name}
                    </span>
                    {!c.isActive && <Badge variant="neutral">معطّل</Badge>}
                    <Badge variant="muted">
                      {c.serviceCount} خدمة
                      {c.packageCount > 0 ? ` · ${c.packageCount} باقة` : ""}
                    </Badge>
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={isPending}
                      onClick={() => run(() => setCategoryActiveAction(c.id, !c.isActive))}
                    >
                      {c.isActive ? "تعطيل" : "تفعيل"}
                    </Button>
                    <Hint label="تعديل الاسم">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setEditingId(c.id)}
                        aria-label="تعديل الاسم"
                        className="hover:bg-primary/10 hover:text-primary"
                      >
                        <Pencil />
                      </Button>
                    </Hint>
                    <Hint label={inUse ? "تصنيف مستخدم — عطّله بدلاً من حذفه" : "حذف"}>
                      <span>
                        <Button
                          variant="ghost-destructive"
                          size="icon"
                          disabled={isPending || inUse}
                          aria-label="حذف"
                          onClick={async () => {
                            const deleted = await confirm({
                              title: "حذف التصنيف",
                              description: <>هل تريد حذف التصنيف «{c.name}»؟</>,
                              warning: "لا يمكن التراجع عن الحذف.",
                              onConfirm: () => deleteCategoryAction(c.id),
                            });
                            if (deleted) router.refresh();
                          }}
                        >
                          <Trash2 />
                        </Button>
                      </span>
                    </Hint>
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}
    </Modal>
  );
}

function RenameRow({
  category,
  isPending,
  run,
  onDone,
}: {
  category: CategoryView;
  isPending: boolean;
  run: RunFn;
  onDone: () => void;
}) {
  const form = useForm<CategoryValues>({
    resolver: zodResolver(categorySchema),
    defaultValues: { name: category.name },
  });
  const handleSave = form.handleSubmit(({ name }) =>
    run(() => renameCategoryAction(category.id, name), onDone)
  );

  return (
    <form onSubmit={handleSave} noValidate className="flex flex-1 items-start gap-2">
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
