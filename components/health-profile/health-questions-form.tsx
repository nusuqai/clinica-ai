"use client";

import { FormField } from "@/components/ui/form-field";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  formValuesToAnswers,
  isQuestionVisible,
  type HealthQuestionView,
} from "@/lib/health-profile";

const BOOLEAN_OPTIONS = [
  { value: "true", label: "نعم" },
  { value: "false", label: "لا" },
];

interface Props {
  /** Questions in display order (follow-ups right after their parent). */
  questions: HealthQuestionView[];
  /** Raw form values: questionId → string (see toFormValues). */
  values: Record<string, string>;
  onChange: (questionId: string, value: string) => void;
  /** Extra filter on top of follow-up visibility (e.g. "missing required only"). */
  include?: (q: HealthQuestionView) => boolean;
  /** Show the "staff only" badge (staff editing). */
  showAudience?: boolean;
  /** Visual flavour: the public landing (booking modal) or the dashboard. */
  tone?: "landing" | "dashboard";
  disabled?: boolean;
}

/**
 * Renders health-profile questions as inputs, one widget per type. Follow-up
 * questions appear/disappear live as their yes/no parent is answered.
 * Validation is server-side (lib/health-profile.ts parseAnswer).
 */
export default function HealthQuestionsForm({
  questions,
  values,
  onChange,
  include,
  showAudience,
  tone = "dashboard",
  disabled,
}: Props) {
  const answers = formValuesToAnswers(questions, values);
  const visible = questions.filter(
    (q) => isQuestionVisible(q, answers) && (!include || include(q))
  );
  const landing = tone === "landing";
  const labelCls = landing ? "text-text" : undefined;
  const controlCls = landing
    ? "bg-white text-text placeholder:text-text/30 focus-visible:border-accent focus-visible:ring-accent/20"
    : undefined;

  if (visible.length === 0) return null;

  return (
    <div className="flex flex-col gap-4">
      {visible.map((q) => {
        const label = (
          <span className="inline-flex flex-wrap items-center gap-1.5">
            {q.label}
            {q.required && q.audience === "PATIENT" && <span className="text-red-500">*</span>}
            {q.unit && <span className="font-normal text-muted-foreground">({q.unit})</span>}
            {showAudience && q.audience === "STAFF" && (
              <Badge variant="muted" className="text-[10px]">
                للفريق فقط
              </Badge>
            )}
          </span>
        );
        const common = {
          label,
          hint: q.helpText ?? undefined,
          labelClassName: labelCls,
          controlClassName: controlCls,
          disabled,
          className: cn(q.parentId && "border-s-2 border-accent/30 ps-3"),
        };
        const value = values[q.id] ?? "";
        const set = (v: string) => onChange(q.id, v);

        switch (q.type) {
          case "BOOLEAN":
            return (
              <FormField
                key={q.id}
                {...common}
                type="select"
                options={BOOLEAN_OPTIONS}
                placeholder="اختر"
                value={value}
                onValueChange={set}
              />
            );
          case "SELECT":
            return (
              <FormField
                key={q.id}
                {...common}
                type="select"
                options={q.options
                  .filter((o) => !o.archived || o.id === value)
                  .map((o) => ({ value: o.id, label: o.label }))}
                placeholder="اختر"
                value={value}
                onValueChange={set}
              />
            );
          case "NUMBER":
            return (
              <FormField
                key={q.id}
                {...common}
                type="text"
                inputMode="decimal"
                dir="ltr"
                placeholder={q.placeholder ?? undefined}
                value={value}
                onValueChange={set}
              />
            );
          default:
            return q.multiline ? (
              <FormField
                key={q.id}
                {...common}
                type="textarea"
                rows={2}
                placeholder={q.placeholder ?? undefined}
                value={value}
                onValueChange={set}
              />
            ) : (
              <FormField
                key={q.id}
                {...common}
                type="text"
                placeholder={q.placeholder ?? undefined}
                value={value}
                onValueChange={set}
              />
            );
        }
      })}
    </div>
  );
}
