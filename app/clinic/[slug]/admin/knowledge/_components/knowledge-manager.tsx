"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Pencil, Trash2, Eye, EyeOff, FileText } from "lucide-react";
import Modal from "@/components/admin/modal";
import {
  createKnowledgeDocAction,
  updateKnowledgeDocAction,
  deleteKnowledgeDocAction,
  toggleKnowledgeDocActiveAction,
} from "@/server/actions/admin";

export interface KnowledgeDocView {
  id: string;
  slug: string;
  title: string;
  summary: string;
  content: string;
  isActive: boolean;
  updatedAt: string;
}

const inputCls =
  "w-full border border-border rounded-xl px-3 py-2 text-sm bg-background text-foreground font-sans focus:outline-none focus:ring-2 focus:ring-primary/30";
const labelCls = "text-sm font-medium text-foreground font-sans";
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

export default function KnowledgeManager({ docs }: { docs: KnowledgeDocView[] }) {
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
      slug: draft.slug.trim(),
      title: draft.title.trim(),
      summary: draft.summary.trim(),
      content: draft.content,
      isActive: draft.isActive,
    };
    if (draft.id) {
      run(
        () => updateKnowledgeDocAction({ id: draft.id!, ...payload }),
        () => setDraft(null)
      );
    } else {
      run(
        () => createKnowledgeDocAction(payload),
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
        <button
          onClick={() => {
            setError(null);
            setDraft({ ...emptyDraft });
          }}
          className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 font-sans text-sm font-medium text-white transition-colors hover:bg-primary/90"
        >
          <Plus className="h-4 w-4" />
          مستند جديد
        </button>
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
                    {!d.isActive && (
                      <span className="rounded-full bg-muted px-2 py-0.5 font-sans text-xs text-muted-foreground">
                        غير مفعّل
                      </span>
                    )}
                  </div>
                  <p className="mt-1 line-clamp-2 font-sans text-sm text-muted-foreground">
                    {d.summary}
                  </p>
                  <p className={hintCls + " mt-2"}>آخر تعديل: {formatDate(d.updatedAt)}</p>
                </div>
                <div className="flex flex-shrink-0 items-center gap-1">
                  <button
                    onClick={() => run(() => toggleKnowledgeDocActiveAction(d.id, !d.isActive))}
                    disabled={isPending}
                    title={d.isActive ? "إخفاء عن المساعد" : "تفعيل"}
                    className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted disabled:opacity-40"
                  >
                    {d.isActive ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                  </button>
                  <button
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
                    className="rounded-lg p-1.5 text-muted-foreground hover:bg-primary/10 hover:text-primary"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() =>
                      run(() => {
                        if (!confirm(`حذف المستند «${d.title}» نهائياً؟`)) return Promise.resolve();
                        return deleteKnowledgeDocAction(d.id);
                      })
                    }
                    disabled={isPending}
                    title="حذف"
                    className="rounded-lg p-1.5 text-muted-foreground hover:bg-red-50 hover:text-red-500 disabled:opacity-40"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
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
            <div className="space-y-1.5">
              <label className={labelCls}>العنوان</label>
              <input
                value={draft.title}
                onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                placeholder="مثال: تعليمات وشروط التعامل مع الجهات والشركات"
                className={inputCls}
                autoFocus
              />
            </div>

            <div className="space-y-1.5">
              <label className={labelCls}>المعرّف (slug)</label>
              <input
                value={draft.slug}
                onChange={(e) => setDraft({ ...draft, slug: e.target.value })}
                placeholder="company-terms"
                dir="ltr"
                className={inputCls + " text-start font-mono"}
              />
              <p className={hintCls}>
                معرّف إنجليزي قصير وفريد يميّز المستند (أحرف صغيرة وأرقام وشرطات). يُستخدم داخلياً
                بواسطة المساعد.
              </p>
            </div>

            <div className="space-y-1.5">
              <label className={labelCls}>وصف مختصر</label>
              <input
                value={draft.summary}
                onChange={(e) => setDraft({ ...draft, summary: e.target.value })}
                placeholder="جملة واحدة تصف محتوى المستند — يراها المساعد ليقرّر متى يفتحه."
                className={inputCls}
              />
            </div>

            <div className="space-y-1.5">
              <label className={labelCls}>المحتوى</label>
              <textarea
                value={draft.content}
                onChange={(e) => setDraft({ ...draft, content: e.target.value })}
                placeholder="النص الكامل للمستند (يدعم تنسيق ماركداون، بما في ذلك الجداول والقوائم)."
                rows={14}
                className={inputCls + " resize-y font-mono leading-relaxed"}
              />
            </div>

            <label className="flex items-center gap-2 font-sans text-sm text-foreground">
              <input
                type="checkbox"
                checked={draft.isActive}
                onChange={(e) => setDraft({ ...draft, isActive: e.target.checked })}
                className="h-4 w-4 rounded border-border"
              />
              مفعّل (يستعين به المساعد الذكي)
            </label>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setDraft(null)}
                className="rounded-xl border border-border px-4 py-2 font-sans text-sm text-foreground hover:bg-muted"
              >
                إلغاء
              </button>
              <button
                type="submit"
                disabled={isPending}
                className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 font-sans text-sm font-medium text-white transition-colors hover:bg-primary/90 disabled:opacity-50"
              >
                {isPending ? "جارٍ الحفظ…" : "حفظ"}
              </button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}
