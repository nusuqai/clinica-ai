"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, Pencil, Trash2, Eye, EyeOff, FileText } from "lucide-react";
import Modal from "@/components/admin/modal";
import {
  createClinicKnowledgeDocAction,
  updateClinicKnowledgeDocAction,
  deleteClinicKnowledgeDocAction,
  toggleClinicKnowledgeDocActiveAction,
} from "@/server/actions/platformKnowledge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Card } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { Hint } from "@/components/ui/tooltip";
import { knowledgeDocSchema, type KnowledgeDocValues } from "@/lib/validations/platform";

export interface KnowledgeDocView {
  id: string;
  slug: string;
  title: string;
  summary: string;
  content: string;
  isActive: boolean;
  updatedAt: string;
}

const hintCls = "text-xs text-muted-foreground font-sans";

const emptyDoc: KnowledgeDocValues = {
  slug: "",
  title: "",
  summary: "",
  content: "",
  isActive: true,
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("ar-EG", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export default function KnowledgeManager({
  clinicId,
  docs,
}: {
  /** The clinic these documents belong to. Named explicitly because the console
      runs on the root domain, where there is no tenant to infer from the host. */
  clinicId: string;
  docs: KnowledgeDocView[];
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  /** The doc being edited: null = modal closed, "new" = creating. */
  const [editing, setEditing] = useState<string | "new" | null>(null);

  const form = useForm<KnowledgeDocValues>({
    resolver: zodResolver(knowledgeDocSchema),
    defaultValues: emptyDoc,
    mode: "onTouched",
  });
  const { control } = form;

  function openDoc(id: string | "new", values: KnowledgeDocValues) {
    setError(null);
    form.reset(values);
    setEditing(id);
  }

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

  const handleSave = form.handleSubmit((values) => {
    const payload = { clinicId, ...values };
    const id = editing;
    if (id && id !== "new") {
      run(
        () => updateClinicKnowledgeDocAction({ id, ...payload }),
        () => setEditing(null)
      );
    } else {
      run(
        () => createClinicKnowledgeDocAction(payload),
        () => setEditing(null)
      );
    }
  });

  return (
    <div className="max-w-3xl">
      {error && (
        <Alert variant="destructive" className="mb-4">
          {error}
        </Alert>
      )}

      <div className="mb-6 flex justify-end">
        <Button onClick={() => openDoc("new", emptyDoc)}>
          <Plus />
          مستند جديد
        </Button>
      </div>

      {docs.length === 0 ? (
        <Card className="py-16 text-center">
          <FileText className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
          <p className="font-sans text-muted-foreground">
            لا توجد مستندات بعد. أضف مستنداً (مثل سياسات التعامل مع الشركات أو قائمة الفحوصات)
            ليستعين به المساعد الذكي.
          </p>
        </Card>
      ) : (
        <div className="space-y-3">
          {docs.map((d) => (
            <Card key={d.id} className="px-5 py-4">
              <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-heading font-bold text-foreground">{d.title}</h3>
                    <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-muted-foreground">
                      {d.slug}
                    </code>
                    {!d.isActive && <Badge variant="muted">غير مفعّل</Badge>}
                  </div>
                  <p className="mt-1 line-clamp-2 font-sans text-sm text-muted-foreground">
                    {d.summary}
                  </p>
                  <p className={hintCls + " mt-2"}>آخر تعديل: {formatDate(d.updatedAt)}</p>
                </div>
                <div className="flex flex-shrink-0 items-center gap-1">
                  <Hint label={d.isActive ? "إخفاء عن المساعد" : "تفعيل"}>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() =>
                        run(() =>
                          toggleClinicKnowledgeDocActiveAction({
                            clinicId,
                            id: d.id,
                            isActive: !d.isActive,
                          })
                        )
                      }
                      disabled={isPending}
                      aria-label={d.isActive ? "إخفاء عن المساعد" : "تفعيل"}
                    >
                      {d.isActive ? <Eye /> : <EyeOff />}
                    </Button>
                  </Hint>
                  <Hint label="تعديل">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() =>
                        openDoc(d.id, {
                          slug: d.slug,
                          title: d.title,
                          summary: d.summary,
                          content: d.content,
                          isActive: d.isActive,
                        })
                      }
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
                          title: "حذف المستند",
                          description: `حذف المستند «${d.title}» نهائياً؟`,
                        });
                        if (ok) run(() => deleteClinicKnowledgeDocAction({ clinicId, id: d.id }));
                      }}
                      disabled={isPending}
                      aria-label="حذف"
                    >
                      <Trash2 />
                    </Button>
                  </Hint>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Modal
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing && editing !== "new" ? "تعديل المستند" : "مستند جديد"}
        width="max-w-2xl"
      >
        {editing !== null && (
          <form onSubmit={handleSave} noValidate className="space-y-4">
            <FormField
              control={control}
              name="title"
              label="العنوان"
              placeholder="مثال: تعليمات وشروط التعامل مع الجهات والشركات"
              autoFocus
            />

            <FormField
              control={control}
              name="slug"
              label="المعرّف (slug)"
              placeholder="company-terms"
              dir="ltr"
              controlClassName="text-start font-mono"
              hint="معرّف إنجليزي قصير وفريد يميّز المستند (أحرف صغيرة وأرقام وشرطات). يُستخدم داخلياً بواسطة المساعد."
            />

            <FormField
              control={control}
              name="summary"
              label="وصف مختصر"
              placeholder="جملة واحدة تصف محتوى المستند — يراها المساعد ليقرّر متى يفتحه."
            />

            <FormField
              control={control}
              name="content"
              type="textarea"
              label="المحتوى"
              placeholder="النص الكامل للمستند (يدعم تنسيق ماركداون، بما في ذلك الجداول والقوائم)."
              rows={14}
              controlClassName="resize-y font-mono leading-relaxed"
            />

            <FormField
              control={control}
              name="isActive"
              type="checkbox"
              label="مفعّل (يستعين به المساعد الذكي)"
            />

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setEditing(null)}>
                إلغاء
              </Button>
              <Button type="submit" loading={isPending}>
                {isPending ? "جارٍ الحفظ…" : "حفظ"}
              </Button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}
