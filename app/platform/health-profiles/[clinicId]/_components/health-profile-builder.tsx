"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowDown,
  ArrowUp,
  CornerDownLeft,
  Pencil,
  Plus,
  RotateCcw,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import Modal from "@/components/admin/modal";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { FormField } from "@/components/ui/form-field";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { Hint } from "@/components/ui/tooltip";
import {
  AUDIENCE_LABEL,
  QUESTION_TYPE_LABEL,
  type HealthQuestionType,
  type HealthQuestionView,
  type HealthSectionView,
} from "@/lib/health-profile";
import {
  createHealthQuestionAction,
  createHealthSectionAction,
  moveHealthQuestionAction,
  moveHealthSectionAction,
  removeHealthQuestionAction,
  removeHealthSectionAction,
  restoreHealthQuestionAction,
  restoreHealthSectionAction,
  updateHealthQuestionAction,
  updateHealthSectionAction,
} from "@/server/actions/platformHealthProfile";

type ActionResult = { error: string } | { success: true; data?: unknown };

interface Props {
  clinicId: string;
  /** Includes archived sections/questions/options. */
  sections: HealthSectionView[];
  /** questionId → number of patients who answered it. */
  answerCounts: Record<string, number>;
}

type SectionEditor = { mode: "create" } | { mode: "edit"; section: HealthSectionView };
type QuestionEditor =
  | { mode: "create"; sectionId: string; parent: HealthQuestionView | null }
  | { mode: "edit"; question: HealthQuestionView; parent: HealthQuestionView | null };

/**
 * Platform-admin builder for one clinic's health-profile form: sections, typed
 * questions, dropdown options and yes/no follow-ups. Anything already answered
 * is archived rather than deleted (the server decides), and can be restored.
 */
export default function HealthProfileBuilder({ clinicId, sections, answerCounts }: Props) {
  const router = useRouter();
  const confirm = useConfirm();
  const [busy, start] = useTransition();
  const [sectionEditor, setSectionEditor] = useState<SectionEditor | null>(null);
  const [questionEditor, setQuestionEditor] = useState<QuestionEditor | null>(null);

  const active = sections.filter((s) => !s.archived);
  const archived = sections.filter((s) => s.archived);

  const act = (fn: () => Promise<ActionResult>, success?: string) =>
    start(async () => {
      const res = await fn();
      if ("error" in res) toast.error(res.error);
      else {
        if (success) toast.success(success);
        router.refresh();
      }
    });

  const sectionAnswers = (s: HealthSectionView) =>
    s.questions.reduce((n, q) => n + (answerCounts[q.id] ?? 0), 0);

  const removeSection = (s: HealthSectionView) => {
    const answered = sectionAnswers(s) > 0;
    void confirm({
      title: answered ? "أرشفة القسم" : "حذف القسم",
      description: (
        <>
          {answered ? "أرشفة" : "حذف"} قسم «{s.title}» بكل أسئلته؟
        </>
      ),
      warning: answered
        ? "أُجيب على بعض أسئلته، لذا سيُؤرشف: يختفي من النموذج وتبقى الإجابات محفوظة، ويمكن استعادته."
        : "لا توجد إجابات عليه، لذا سيُحذف نهائياً.",
      onConfirm: async () => {
        const res = await removeHealthSectionAction(clinicId, s.id);
        if (!("error" in res)) router.refresh();
        return res;
      },
    });
  };

  const removeQuestion = (q: HealthQuestionView, followUps: HealthQuestionView[]) => {
    const answered =
      (answerCounts[q.id] ?? 0) + followUps.reduce((n, f) => n + (answerCounts[f.id] ?? 0), 0) > 0;
    void confirm({
      title: answered ? "أرشفة السؤال" : "حذف السؤال",
      description: (
        <>
          {answered ? "أرشفة" : "حذف"} السؤال «{q.label}»؟
        </>
      ),
      warning: answered
        ? "أجاب عليه مرضى، لذا سيُؤرشف (مع أسئلة المتابعة التابعة له): يختفي من النموذج وتبقى إجاباتهم محفوظة."
        : followUps.length > 0
          ? "سيُحذف نهائياً مع أسئلة المتابعة التابعة له."
          : "لا توجد إجابات عليه، لذا سيُحذف نهائياً.",
      onConfirm: async () => {
        const res = await removeHealthQuestionAction(clinicId, q.id);
        if (!("error" in res)) router.refresh();
        return res;
      },
    });
  };

  return (
    <div className="space-y-4">
      {active.length === 0 && (
        <Card className="p-6 text-center font-sans text-sm text-muted-foreground">
          لا توجد أقسام بعد. أضف قسماً (مثل «البيانات الأساسية» أو «التاريخ المرضي») ثم أضف أسئلته.
        </Card>
      )}

      {active.map((s, si) => {
        const live = s.questions.filter((q) => !q.archived);
        const top = live.filter((q) => !q.parentId);
        const gone = s.questions.filter((q) => q.archived);
        return (
          <Card key={s.id} className="p-5">
            <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="font-heading text-lg font-bold text-foreground">{s.title}</h2>
                {s.description && (
                  <p className="mt-0.5 font-sans text-sm text-muted-foreground">{s.description}</p>
                )}
              </div>
              <div className="flex items-center gap-1">
                <IconBtn
                  label="تحريك لأعلى"
                  disabled={busy || si === 0}
                  onClick={() => act(() => moveHealthSectionAction(clinicId, s.id, "up"))}
                >
                  <ArrowUp />
                </IconBtn>
                <IconBtn
                  label="تحريك لأسفل"
                  disabled={busy || si === active.length - 1}
                  onClick={() => act(() => moveHealthSectionAction(clinicId, s.id, "down"))}
                >
                  <ArrowDown />
                </IconBtn>
                <IconBtn
                  label="تعديل القسم"
                  onClick={() => setSectionEditor({ mode: "edit", section: s })}
                >
                  <Pencil />
                </IconBtn>
                <IconBtn label="حذف / أرشفة القسم" onClick={() => removeSection(s)}>
                  <Trash2 />
                </IconBtn>
              </div>
            </div>

            <div className="space-y-2">
              {top.map((q, qi) => {
                const followUps = live.filter((f) => f.parentId === q.id);
                return (
                  <div key={q.id} className="space-y-2">
                    <QuestionRow
                      q={q}
                      answers={answerCounts[q.id] ?? 0}
                      busy={busy}
                      first={qi === 0}
                      last={qi === top.length - 1}
                      onMove={(dir) => act(() => moveHealthQuestionAction(clinicId, q.id, dir))}
                      onEdit={() => setQuestionEditor({ mode: "edit", question: q, parent: null })}
                      onRemove={() => removeQuestion(q, followUps)}
                      onAddFollowUp={
                        q.type === "BOOLEAN"
                          ? () => setQuestionEditor({ mode: "create", sectionId: s.id, parent: q })
                          : undefined
                      }
                    />
                    {followUps.map((f, fi) => (
                      <div key={f.id} className="ms-6 flex items-start gap-2">
                        <CornerDownLeft className="mt-3 h-4 w-4 shrink-0 text-muted-foreground" />
                        <div className="min-w-0 flex-1">
                          <QuestionRow
                            q={f}
                            parentLabel={f.showWhen ? "يظهر عند «نعم»" : "يظهر عند «لا»"}
                            answers={answerCounts[f.id] ?? 0}
                            busy={busy}
                            first={fi === 0}
                            last={fi === followUps.length - 1}
                            onMove={(dir) =>
                              act(() => moveHealthQuestionAction(clinicId, f.id, dir))
                            }
                            onEdit={() =>
                              setQuestionEditor({ mode: "edit", question: f, parent: q })
                            }
                            onRemove={() => removeQuestion(f, [])}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })}
              {top.length === 0 && (
                <p className="font-sans text-sm text-muted-foreground">
                  لا توجد أسئلة في هذا القسم.
                </p>
              )}
            </div>

            <Button
              variant="outline"
              size="sm"
              className="mt-4"
              onClick={() => setQuestionEditor({ mode: "create", sectionId: s.id, parent: null })}
            >
              <Plus />
              إضافة سؤال
            </Button>

            {gone.length > 0 && (
              <details className="mt-4 rounded-lg border border-dashed border-border p-3">
                <summary className="cursor-pointer font-sans text-sm text-muted-foreground">
                  أسئلة مؤرشفة ({gone.length})
                </summary>
                <ul className="mt-3 space-y-2">
                  {gone.map((q) => (
                    <li
                      key={q.id}
                      className="flex items-center justify-between gap-2 font-sans text-sm"
                    >
                      <span className="text-muted-foreground">
                        {q.label} <span className="text-xs">({answerCounts[q.id] ?? 0} إجابة)</span>
                      </span>
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={busy}
                        onClick={() =>
                          act(
                            () => restoreHealthQuestionAction(clinicId, q.id),
                            "تمت استعادة السؤال"
                          )
                        }
                      >
                        <RotateCcw />
                        استعادة
                      </Button>
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </Card>
        );
      })}

      <Button onClick={() => setSectionEditor({ mode: "create" })}>
        <Plus />
        إضافة قسم
      </Button>

      {archived.length > 0 && (
        <details className="rounded-lg border border-dashed border-border p-4">
          <summary className="cursor-pointer font-sans text-sm text-muted-foreground">
            أقسام مؤرشفة ({archived.length})
          </summary>
          <ul className="mt-3 space-y-2">
            {archived.map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-2 font-sans text-sm">
                <span className="text-muted-foreground">
                  {s.title} <span className="text-xs">({sectionAnswers(s)} إجابة)</span>
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={busy}
                  onClick={() =>
                    act(() => restoreHealthSectionAction(clinicId, s.id), "تمت استعادة القسم")
                  }
                >
                  <RotateCcw />
                  استعادة
                </Button>
              </li>
            ))}
          </ul>
        </details>
      )}

      {sectionEditor && (
        <SectionModal
          clinicId={clinicId}
          editor={sectionEditor}
          onClose={() => setSectionEditor(null)}
          onSaved={() => {
            setSectionEditor(null);
            router.refresh();
          }}
        />
      )}
      {questionEditor && (
        <QuestionModal
          clinicId={clinicId}
          editor={questionEditor}
          answered={
            questionEditor.mode === "edit" ? (answerCounts[questionEditor.question.id] ?? 0) : 0
          }
          onClose={() => setQuestionEditor(null)}
          onSaved={() => {
            setQuestionEditor(null);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

// ─── Pieces ──────────────────────────────────────────────────────────────────

function IconBtn({
  label,
  children,
  ...props
}: { label: string; children: React.ReactNode } & React.ComponentProps<typeof Button>) {
  return (
    <Hint label={label}>
      <Button variant="ghost" size="icon" aria-label={label} {...props}>
        {children}
      </Button>
    </Hint>
  );
}

function QuestionRow({
  q,
  parentLabel,
  answers,
  busy,
  first,
  last,
  onMove,
  onEdit,
  onRemove,
  onAddFollowUp,
}: {
  q: HealthQuestionView;
  parentLabel?: string;
  answers: number;
  busy: boolean;
  first: boolean;
  last: boolean;
  onMove: (dir: "up" | "down") => void;
  onEdit: () => void;
  onRemove: () => void;
  onAddFollowUp?: () => void;
}) {
  const options = q.options.filter((o) => !o.archived);
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2">
      <div className="min-w-0 flex-1">
        <p className="font-sans text-sm font-medium text-foreground">
          {q.label}
          {q.required && <span className="ms-1 text-red-500">*</span>}
        </p>
        <div className="mt-1 flex flex-wrap items-center gap-1.5">
          <Badge variant="outline" className="text-[11px]">
            {QUESTION_TYPE_LABEL[q.type]}
          </Badge>
          {q.audience === "STAFF" && (
            <Badge variant="muted" className="text-[11px]">
              للفريق فقط
            </Badge>
          )}
          {parentLabel && (
            <Badge variant="outline" className="text-[11px]">
              {parentLabel}
            </Badge>
          )}
          {q.type === "SELECT" && (
            <span className="font-sans text-xs text-muted-foreground">
              {options.map((o) => o.label).join(" · ")}
            </span>
          )}
          {q.type === "NUMBER" && (q.unit || q.minValue !== null || q.maxValue !== null) && (
            <span className="font-sans text-xs text-muted-foreground" dir="ltr">
              {[q.minValue ?? "", q.maxValue ?? ""].join(" – ")} {q.unit ?? ""}
            </span>
          )}
          {answers > 0 && (
            <span className="font-sans text-xs text-muted-foreground">· {answers} إجابة</span>
          )}
        </div>
      </div>
      <div className="flex items-center gap-1">
        {onAddFollowUp && (
          <Button variant="ghost" size="sm" onClick={onAddFollowUp}>
            <Plus />
            سؤال متابعة
          </Button>
        )}
        <IconBtn label="تحريك لأعلى" disabled={busy || first} onClick={() => onMove("up")}>
          <ArrowUp />
        </IconBtn>
        <IconBtn label="تحريك لأسفل" disabled={busy || last} onClick={() => onMove("down")}>
          <ArrowDown />
        </IconBtn>
        <IconBtn label="تعديل السؤال" onClick={onEdit}>
          <Pencil />
        </IconBtn>
        <IconBtn label="حذف / أرشفة السؤال" onClick={onRemove}>
          <Trash2 />
        </IconBtn>
      </div>
    </div>
  );
}

function SectionModal({
  clinicId,
  editor,
  onClose,
  onSaved,
}: {
  clinicId: string;
  editor: SectionEditor;
  onClose: () => void;
  onSaved: () => void;
}) {
  const initial = editor.mode === "edit" ? editor.section : null;
  const [title, setTitle] = useState(initial?.title ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saving, start] = useTransition();

  const save = () =>
    start(async () => {
      setError(null);
      const input = { title, description };
      const res =
        editor.mode === "edit"
          ? await updateHealthSectionAction(clinicId, editor.section.id, input)
          : await createHealthSectionAction(clinicId, input);
      if ("error" in res) setError(res.error);
      else onSaved();
    });

  return (
    <Modal open onClose={onClose} title={initial ? "تعديل القسم" : "قسم جديد"}>
      <div className="space-y-4">
        {error && (
          <Alert variant="destructive" className="border-red-100 text-red-600">
            {error}
          </Alert>
        )}
        <FormField type="text" label="عنوان القسم" value={title} onValueChange={setTitle} />
        <FormField
          type="textarea"
          rows={2}
          label="وصف (اختياري)"
          value={description}
          onValueChange={setDescription}
        />
        <Button onClick={save} loading={saving} className="font-semibold">
          حفظ
        </Button>
      </div>
    </Modal>
  );
}

const TYPE_OPTIONS = (Object.keys(QUESTION_TYPE_LABEL) as HealthQuestionType[]).map((t) => ({
  value: t,
  label: QUESTION_TYPE_LABEL[t],
}));
const AUDIENCE_OPTIONS = (["PATIENT", "STAFF"] as const).map((a) => ({
  value: a,
  label: AUDIENCE_LABEL[a],
}));

function QuestionModal({
  clinicId,
  editor,
  answered,
  onClose,
  onSaved,
}: {
  clinicId: string;
  editor: QuestionEditor;
  /** Answers on the edited question — locks its type. */
  answered: number;
  onClose: () => void;
  onSaved: () => void;
}) {
  const q = editor.mode === "edit" ? editor.question : null;
  const parent = editor.parent;
  const sectionId = q?.sectionId ?? (editor.mode === "create" ? editor.sectionId : "");

  const [label, setLabel] = useState(q?.label ?? "");
  const [helpText, setHelpText] = useState(q?.helpText ?? "");
  const [type, setType] = useState<HealthQuestionType>(q?.type ?? "TEXT");
  const [audience, setAudience] = useState<"PATIENT" | "STAFF">(q?.audience ?? "PATIENT");
  const [required, setRequired] = useState(q?.required ?? false);
  const [showWhen, setShowWhen] = useState<string>(q?.showWhen === false ? "false" : "true");
  const [minValue, setMinValue] = useState(q?.minValue?.toString() ?? "");
  const [maxValue, setMaxValue] = useState(q?.maxValue?.toString() ?? "");
  const [unit, setUnit] = useState(q?.unit ?? "");
  const [multiline, setMultiline] = useState(q?.multiline ?? false);
  const [placeholder, setPlaceholder] = useState(q?.placeholder ?? "");
  const [options, setOptions] = useState<{ id: string | null; label: string }[]>(
    q?.options.filter((o) => !o.archived).map((o) => ({ id: o.id, label: o.label })) ?? [
      { id: null, label: "" },
      { id: null, label: "" },
    ]
  );
  const [error, setError] = useState<string | null>(null);
  const [saving, start] = useTransition();
  const typeLocked = answered > 0;

  const save = () =>
    start(async () => {
      setError(null);
      const input = {
        sectionId,
        parentId: parent?.id ?? null,
        showWhen: parent ? showWhen === "true" : null,
        label,
        helpText,
        type,
        audience,
        required,
        minValue,
        maxValue,
        unit,
        multiline,
        placeholder,
        options: type === "SELECT" ? options.filter((o) => o.label.trim() || o.id) : [],
      };
      const res = q
        ? await updateHealthQuestionAction(clinicId, q.id, input)
        : await createHealthQuestionAction(clinicId, input);
      if ("error" in res) setError(res.error);
      else onSaved();
    });

  const title = q ? "تعديل السؤال" : parent ? "سؤال متابعة جديد" : "سؤال جديد";

  return (
    <Modal open onClose={onClose} title={title} width="max-w-xl">
      <div className="space-y-4">
        {error && (
          <Alert variant="destructive" className="border-red-100 text-red-600">
            {error}
          </Alert>
        )}
        {parent && (
          <div className="rounded-lg bg-muted/50 p-3 font-sans text-sm">
            <p className="text-muted-foreground">تابع للسؤال:</p>
            <p className="font-medium text-foreground">{parent.label}</p>
            <FormField
              className="mt-3"
              type="select"
              label="يظهر عندما تكون الإجابة"
              options={[
                { value: "true", label: "نعم" },
                { value: "false", label: "لا" },
              ]}
              value={showWhen}
              onValueChange={setShowWhen}
            />
          </div>
        )}
        <FormField type="text" label="نص السؤال" value={label} onValueChange={setLabel} />
        <FormField
          type="text"
          label="توضيح (اختياري)"
          hint="يظهر أسفل السؤال للمريض"
          value={helpText}
          onValueChange={setHelpText}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            type="select"
            label="نوع الإجابة"
            options={TYPE_OPTIONS}
            value={type}
            onValueChange={(v) => setType(v as HealthQuestionType)}
            disabled={typeLocked}
            hint={typeLocked ? "لا يمكن تغيير النوع بعد وجود إجابات." : undefined}
          />
          <FormField
            type="select"
            label="لمن السؤال"
            options={AUDIENCE_OPTIONS}
            value={audience}
            onValueChange={(v) => setAudience(v as "PATIENT" | "STAFF")}
            hint={
              audience === "STAFF"
                ? "يملؤه الفريق فقط؛ لا يراه المريض ولا يسأله المساعد."
                : "يُسأل للمريض ويراه الفريق."
            }
          />
        </div>
        <FormField
          type="switch"
          label="إجابة مطلوبة"
          hint={
            audience === "STAFF"
              ? "أسئلة الفريق لا تمنع الحجز أبداً."
              : "يجب الإجابة عليه قبل أول حجز للمريض (المرضى الحاليون لا يُمنعون)."
          }
          checked={required}
          onCheckedChange={setRequired}
        />

        {type === "NUMBER" && (
          <div className="grid gap-4 sm:grid-cols-3">
            <FormField
              type="text"
              inputMode="decimal"
              dir="ltr"
              label="أقل قيمة"
              value={minValue}
              onValueChange={setMinValue}
            />
            <FormField
              type="text"
              inputMode="decimal"
              dir="ltr"
              label="أكبر قيمة"
              value={maxValue}
              onValueChange={setMaxValue}
            />
            <FormField
              type="text"
              label="الوحدة"
              placeholder="كجم"
              value={unit}
              onValueChange={setUnit}
            />
          </div>
        )}
        {(type === "TEXT" || type === "NUMBER") && (
          <FormField
            type="text"
            label="نص إرشادي داخل الحقل (اختياري)"
            value={placeholder}
            onValueChange={setPlaceholder}
          />
        )}
        {type === "TEXT" && (
          <FormField
            type="switch"
            label="إجابة طويلة (عدة أسطر)"
            checked={multiline}
            onCheckedChange={setMultiline}
          />
        )}
        {type === "SELECT" && (
          <div className="space-y-2">
            <p className="font-sans text-sm font-medium text-foreground">الخيارات</p>
            {options.map((o, i) => (
              <div key={o.id ?? `new-${i}`} className="flex items-center gap-2">
                <FormField
                  className="flex-1"
                  type="text"
                  value={o.label}
                  placeholder={`الخيار ${i + 1}`}
                  onValueChange={(v) =>
                    setOptions((list) => list.map((x, j) => (j === i ? { ...x, label: v } : x)))
                  }
                />
                <IconBtn
                  label="إزالة الخيار"
                  onClick={() => setOptions((list) => list.filter((_, j) => j !== i))}
                >
                  <X />
                </IconBtn>
              </div>
            ))}
            <Button
              variant="outline"
              size="sm"
              onClick={() => setOptions((list) => [...list, { id: null, label: "" }])}
            >
              <Plus />
              إضافة خيار
            </Button>
            {q && (
              <p className="font-sans text-xs text-muted-foreground">
                تعديل نص خيار يحافظ على إجابات المرضى. إزالة خيار اختاره مرضى تؤرشفه فقط.
              </p>
            )}
          </div>
        )}

        <Button onClick={save} loading={saving} className="font-semibold">
          حفظ السؤال
        </Button>
      </div>
    </Modal>
  );
}
