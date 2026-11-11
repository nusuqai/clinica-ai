import { ClipboardList } from "lucide-react";
import type { PatientIntake } from "@prisma/client";
import { INTAKE_FIELDS } from "@/lib/patient-intake";
import { Card } from "@/components/ui/card";

/**
 * Read-only "ملف المريض" — the intake questionnaire the patient answered before
 * their first booking at this clinic. Shown to staff who may read medical
 * records (admin patient page) and to the patient's doctors.
 */
export default function PatientIntakeCard({
  intake,
  action,
}: {
  intake: PatientIntake | null;
  /** Optional header control — the admin's edit button. */
  action?: React.ReactNode;
}) {
  return (
    <Card className="p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 font-heading text-lg font-bold text-foreground">
          <ClipboardList className="h-5 w-5 text-primary" />
          ملف المريض
        </h2>
        <div className="flex items-center gap-3">
          {intake && (
            <span className="font-sans text-xs text-muted-foreground">
              آخر تحديث: {intake.updatedAt.toLocaleDateString("ar-EG", { dateStyle: "medium" })}
            </span>
          )}
          {action}
        </div>
      </div>

      {!intake ? (
        <p className="font-sans text-sm text-muted-foreground">
          لم يستكمل المريض ملفه بعد — يُطلب منه عند أول حجز.
        </p>
      ) : (
        <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
          {INTAKE_FIELDS.map((f) => (
            <div key={f.key} className={f.multiline ? "sm:col-span-2" : undefined}>
              <dt className="font-sans text-xs font-medium text-muted-foreground">{f.label}</dt>
              <dd className="mt-0.5 whitespace-pre-line font-sans text-sm text-foreground">
                {intake[f.key]?.trim() || "—"}
              </dd>
            </div>
          ))}
        </dl>
      )}
    </Card>
  );
}
