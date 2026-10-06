"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
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

type Draft = {
  id: string | null;
  slug: string;
  title: string;
  summary: string;
  content: string;
  isActive: boolean;
};

const emptyDraft: Draft = {
  id: null,
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
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [draft, setDraft] = useState<Draft | null>(null);

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

  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!draft) return;
    const payload = {
      clinicId,
      slug: draft.slug.trim(),
      title: draft.title.trim(),
      summary: draft.summary.trim(),
      content: draft.content,
      isActive: draft.isActive,
    };
    if (draft.id) {
      run(
        () => updateClinicKnowledgeDocAction({ id: draft.id!, ...payload }),
        () => setDraft(null)
      );
    } else {
      run(
        () => createClinicKnowledgeDocAction(payload),
        () => setDraft(null)
      );
    }
  }

  return (
    <div className="max-w-3xl">
      {error && (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 font-sans text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="mb-6 flex justify-end">
        <Button
          onClick={() => {
            setError(null);
            setDraft({ ...emptyDraft });
          }}
        >
          <Plus />
          مستند جديد
        </Button>
      </div>

      {docs.length === 0 ? (
        <div className="rounded-2xl border border-border bg-card py-16 text-center">
          <FileText className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
          <p className="font-sans text-muted-foreground">
            لا توجد مستندات بعد. أضف مستنداً (مثل سياسات التعامل مع الشركات أو قائمة الفحوصات)
            ليستعين به المساعد الذكي.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {docs.map((d) => (
            <div key={d.id} className="rounded-2xl border border-border bg-card px-5 py-4">
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
                    title={d.isActive ? "إخفاء عن المساعد" : "تفعيل"}
                  >
                    {d.isActive ? <Eye /> : <EyeOff />}
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => {
                      setError(null);
                      setDraft({
                        id: d.id,
                        slug: d.slug,
                        title: d.title,
                        summary: d.summary,
                        content: d.content,
                        isActive: d.isActive,
                      });
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
                        if (!confirm(`حذف المستند «${d.title}» نهائياً؟`)) return Promise.resolve();
                        return deleteClinicKnowledgeDocAction({ clinicId, id: d.id });
                      })
                    }
                    disabled={isPending}
                    title="حذف"
                  >
                    <Trash2 />
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal
        open={draft !== null}
        onClose={() => setDraft(null)}
        title={draft?.id ? "تعديل المستند" : "مستند جديد"}
        width="max-w-2xl"
      >
        {draft && (
          <form onSubmit={handleSave} className="space-y-4">
            <FormField
              label="العنوان"
              value={draft.title}
              onValueChange={(v) => setDraft({ ...draft, title: v })}
              placeholder="مثال: تعليمات وشروط التعامل مع الجهات والشركات"
              autoFocus
            />

            <FormField
              label="المعرّف (slug)"
              value={draft.slug}
              onValueChange={(v) => setDraft({ ...draft, slug: v })}
              placeholder="company-terms"
              dir="ltr"
              controlClassName="text-start font-mono"
              hint="معرّف إنجليزي قصير وفريد يميّز المستند (أحرف صغيرة وأرقام وشرطات). يُستخدم داخلياً بواسطة المساعد."
            />

            <FormField
              label="وصف مختصر"
              value={draft.summary}
              onValueChange={(v) => setDraft({ ...draft, summary: v })}
              placeholder="جملة واحدة تصف محتوى المستند — يراها المساعد ليقرّر متى يفتحه."
            />

            <FormField
              type="textarea"
              label="المحتوى"
              value={draft.content}
              onValueChange={(v) => setDraft({ ...draft, content: v })}
              placeholder="النص الكامل للمستند (يدعم تنسيق ماركداون، بما في ذلك الجداول والقوائم)."
              rows={14}
              controlClassName="resize-y font-mono leading-relaxed"
            />

            <FormField
              type="checkbox"
              label="مفعّل (يستعين به المساعد الذكي)"
              checked={draft.isActive}
              onCheckedChange={(v) => setDraft({ ...draft, isActive: v })}
            />

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setDraft(null)}>
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
