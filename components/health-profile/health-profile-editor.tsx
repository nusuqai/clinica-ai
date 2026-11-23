"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import HealthQuestionsForm from "@/components/health-profile/health-questions-form";
import {
  flattenQuestions,
  formValuesToAnswers,
  isQuestionVisible,
  toFormValues,
  type AnswersMap,
  type HealthSectionView,
} from "@/lib/health-profile";
import { saveMyHealthAnswersAction } from "@/server/actions/patient";
import { saveStaffHealthAnswersAction } from "@/server/actions/health-profile";

interface Props {
  sections: HealthSectionView[];
  answers: AnswersMap;
  /** "patient" = the signed-in patient; otherwise staff editing this patient. */
  mode: "patient" | { patientId: string };
  onSaved?: () => void;
}

/**
 * The whole health profile as an editable form, grouped by section. Saves
 * every visible answer; a follow-up hidden by its parent's answer is cleared
 * (e.g. "Chronic disease? → no" drops the old description). Required marks
 * are informational here — only booking enforces them.
 */
export default function HealthProfileEditor({ sections, answers, mode, onSaved }: Props) {
  const router = useRouter();
  const [values, setValues] = useState<Record<string, string>>(() => toFormValues(answers));
  const [error, setError] = useState<string | null>(null);
  const [saving, start] = useTransition();
  const staff = mode !== "patient";
  const all = flattenQuestions(sections);

  const handleSave = () => {
    setError(null);
    const current = formValuesToAnswers(all, values);
    const payload = Object.fromEntries(
      all.map((q) => [q.id, isQuestionVisible(q, current) ? (values[q.id] ?? null) : null])
    );
    start(async () => {
      const res =
        mode === "patient"
          ? await saveMyHealthAnswersAction(payload)
          : await saveStaffHealthAnswersAction(mode.patientId, payload);
      const message = "error" in res ? res.error : null;
      if (message) {
        setError(message);
        return;
      }
      toast.success("تم حفظ ملف المريض");
      router.refresh();
      onSaved?.();
    });
  };

  if (all.length === 0)
    return (
      <p className="font-sans text-sm text-muted-foreground">
        لم تُضِف العيادة أسئلة لملف المريض بعد.
      </p>
    );

  return (
    <div className="space-y-6">
      {error && (
        <Alert variant="destructive" className="border-red-100 text-red-600">
          {error}
        </Alert>
      )}
      {sections
        .filter((s) => !s.archived && s.questions.some((q) => !q.archived))
        .map((s) => (
          <fieldset key={s.id} className="space-y-3">
            <legend className="font-heading text-sm font-bold text-foreground">{s.title}</legend>
            {s.description && (
              <p className="font-sans text-xs text-muted-foreground">{s.description}</p>
            )}
            <HealthQuestionsForm
              questions={flattenQuestions([s])}
              values={values}
              onChange={(id, v) => setValues((m) => ({ ...m, [id]: v }))}
              showAudience={staff}
              disabled={saving}
            />
          </fieldset>
        ))}
      <Button type="button" onClick={handleSave} loading={saving} className="font-semibold">
        حفظ الملف
      </Button>
    </div>
  );
}
