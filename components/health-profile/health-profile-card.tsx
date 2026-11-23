import { ClipboardList, History, Archive } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  SOURCE_LABEL,
  flattenQuestions,
  formatAnswer,
  isQuestionVisible,
  missingRequired,
} from "@/lib/health-profile";
import type {
  AnswerRevisionView,
  PatientHealthProfileView,
} from "@/server/services/health-profile";

/**
 * Staff view of a patient's health profile ("ملف المريض"): every question by
 * section (staff-only ones badged), answers to since-archived questions from
 * their snapshot, and the edit history. Shown on the admin patient page (to
 * members with medical_records) and to the patient's doctors.
 */
export default function HealthProfileCard({
  profile,
  revisions,
  action,
}: {
  profile: PatientHealthProfileView;
  revisions: AnswerRevisionView[];
  /** Header control — the edit button. */
  action?: React.ReactNode;
}) {
  const { sections, answers, archivedAnswers, updatedAt } = profile;
  const hasForm = flattenQuestions(sections).length > 0;
  const missing = missingRequired(sections, answers).length;

  return (
    <Card className="p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 font-heading text-lg font-bold text-foreground">
          <ClipboardList className="h-5 w-5 text-primary" />
          ملف المريض
          {hasForm && missing > 0 && (
            <Badge variant="warning">{missing} سؤال مطلوب بدون إجابة</Badge>
          )}
        </h2>
        <div className="flex items-center gap-3">
          {updatedAt && (
            <span className="font-sans text-xs text-muted-foreground">
              آخر تحديث: {updatedAt.toLocaleDateString("ar-EG", { dateStyle: "medium" })}
            </span>
          )}
          {hasForm && action}
        </div>
      </div>

      {!hasForm ? (
        <p className="font-sans text-sm text-muted-foreground">
          لم تُضِف العيادة أسئلة لملف المريض بعد.
        </p>
      ) : (
        <div className="space-y-5">
          {sections
            .filter((s) => s.questions.length > 0)
            .map((s) => (
              <div key={s.id}>
                <h3 className="mb-2 font-heading text-sm font-semibold text-foreground">
                  {s.title}
                </h3>
                <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
                  {flattenQuestions([s])
                    .filter((q) => isQuestionVisible(q, answers))
                    .map((q) => (
                      <div
                        key={q.id}
                        className={q.type === "TEXT" && q.multiline ? "sm:col-span-2" : undefined}
                      >
                        <dt className="flex flex-wrap items-center gap-1.5 font-sans text-xs font-medium text-muted-foreground">
                          {q.label}
                          {q.audience === "STAFF" && (
                            <Badge variant="muted" className="text-[10px]">
                              للفريق فقط
                            </Badge>
                          )}
                        </dt>
                        <dd className="mt-0.5 whitespace-pre-line font-sans text-sm text-foreground">
                          {formatAnswer(q, answers[q.id])}
                        </dd>
                      </div>
                    ))}
                </dl>
              </div>
            ))}
        </div>
      )}

      {archivedAnswers.length > 0 && (
        <details className="mt-5 rounded-lg border border-border p-3">
          <summary className="flex cursor-pointer items-center gap-2 font-sans text-sm text-muted-foreground">
            <Archive className="h-4 w-4" />
            إجابات على أسئلة مؤرشفة ({archivedAnswers.length})
          </summary>
          <dl className="mt-3 grid gap-x-6 gap-y-3 sm:grid-cols-2">
            {archivedAnswers.map((a) => (
              <div key={a.questionId}>
                <dt className="font-sans text-xs font-medium text-muted-foreground">{a.label}</dt>
                <dd className="mt-0.5 whitespace-pre-line font-sans text-sm text-foreground">
                  {a.display}
                </dd>
              </div>
            ))}
          </dl>
        </details>
      )}

      {revisions.length > 0 && (
        <details className="mt-3 rounded-lg border border-border p-3">
          <summary className="flex cursor-pointer items-center gap-2 font-sans text-sm text-muted-foreground">
            <History className="h-4 w-4" />
            سجل التعديلات ({revisions.length})
          </summary>
          <ul className="mt-3 space-y-2">
            {revisions.map((r) => (
              <li key={r.id} className="font-sans text-xs text-muted-foreground">
                <span className="font-medium text-foreground">{r.questionLabel}</span>:{" "}
                <span className="line-through">{r.oldDisplay}</span> ←{" "}
                <span className="text-foreground">{r.newDisplay}</span>
                <span className="ms-2">
                  — {r.editedBy} ({SOURCE_LABEL[r.source]}) ·{" "}
                  {r.editedAt.toLocaleString("ar-EG", { dateStyle: "medium", timeStyle: "short" })}
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </Card>
  );
}
