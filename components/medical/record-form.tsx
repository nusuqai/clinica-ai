"use client";

import { useState, useTransition } from "react";
import { useFieldArray, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, Trash2 } from "lucide-react";
import { ProcedureKind } from "@prisma/client";
import { PROCEDURE_KIND_LABELS } from "@/lib/labels";
import type { TreatmentRecordPayload } from "@/server/actions/treatments";
import type { TreatmentRecordView } from "@/server/services/treatments";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Label } from "@/components/ui/label";
import { Alert } from "@/components/ui/alert";
import { Hint } from "@/components/ui/tooltip";
import { recordFormSchema, type RecordFormValues } from "@/lib/validations/treatment";

// The clinical record form body — dates, narrative fields, procedure and
// prescription lines. Shared by the doctor's modal (per appointment) and the
// admin's modal (per patient); each wrapper decides where the record comes from
// and which action saves it. The form is seeded from `initial` once, so a wrapper
// that swaps records must remount it (pass a `key`).

type ProcedureRow = RecordFormValues["procedures"][number];
type PrescriptionRow = RecordFormValues["prescriptions"][number];

const emptyProcedure = (): ProcedureRow => ({
  kind: ProcedureKind.EXAMINATION,
  name: "",
  cost: "",
  note: "",
});
const emptyPrescription = (): PrescriptionRow => ({
  drugName: "",
  dose: "",
  frequency: "",
  durationDays: "",
  instructions: "",
});

/** Seed values: the stored record, or a blank one dated `defaultVisitDate` (today if absent). */
function formFromRecord(
  initial: TreatmentRecordView | null,
  defaultVisitDate: Date | string | null | undefined
): RecordFormValues {
  return {
    visitDate: toDateInput(initial?.visitDate ?? defaultVisitDate) || toDateInput(new Date()),
    followUpDate: toDateInput(initial?.followUpDate),
    chiefComplaint: initial?.chiefComplaint ?? "",
    diagnosis: initial?.diagnosis ?? "",
    clinicalNotes: initial?.clinicalNotes ?? "",
    procedures: initial?.procedures.length
      ? initial.procedures.map((p) => ({
          kind: p.kind,
          name: p.name,
          cost: p.cost ?? "",
          note: p.note ?? "",
        }))
      : [emptyProcedure()],
    prescriptions: initial?.prescriptions.length
      ? initial.prescriptions.map((p) => ({
          drugName: p.drugName,
          dose: p.dose ?? "",
          frequency: p.frequency ?? "",
          durationDays: p.durationDays?.toString() ?? "",
          instructions: p.instructions ?? "",
        }))
      : [emptyPrescription()],
  };
}

/** Empty optional strings go to the server as undefined, like the old form sent them. */
const opt = (v: string) => v || undefined;

function toPayload(v: RecordFormValues): TreatmentRecordPayload {
  return {
    visitDate: v.visitDate,
    chiefComplaint: v.chiefComplaint,
    diagnosis: v.diagnosis,
    clinicalNotes: v.clinicalNotes,
    followUpDate: v.followUpDate || null,
    procedures: v.procedures.map((p) => ({
      kind: p.kind,
      name: p.name,
      cost: opt(p.cost),
      note: opt(p.note),
    })),
    prescriptions: v.prescriptions.map((p) => ({
      drugName: p.drugName,
      dose: opt(p.dose),
      frequency: opt(p.frequency),
      durationDays: opt(p.durationDays),
      instructions: opt(p.instructions),
    })),
  };
}

/** A Date (or ISO string) as the "YYYY-MM-DD" an <input type="date"> wants. */
export function toDateInput(value: Date | string | null | undefined): string {
  if (!value) return "";
  return new Date(value).toISOString().slice(0, 10);
}

const PROCEDURE_KIND_OPTIONS = Object.entries(PROCEDURE_KIND_LABELS).map(([value, label]) => ({
  value,
  label,
}));

interface RecordFormProps {
  /** The stored record when editing; null when creating. */
  initial: TreatmentRecordView | null;
  /** Visit date pre-filled on a new record. Defaults to today. */
  defaultVisitDate?: Date | string | null;
  /** Rendered above the dates — e.g. the admin's doctor/appointment pickers. */
  header?: React.ReactNode;
  onSubmit: (payload: TreatmentRecordPayload) => Promise<{ error?: string } | undefined>;
  onCancel: () => void;
}

export default function RecordForm({
  initial,
  defaultVisitDate,
  header,
  onSubmit,
  onCancel,
}: RecordFormProps) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const form = useForm<RecordFormValues>({
    resolver: zodResolver(recordFormSchema),
    defaultValues: formFromRecord(initial, defaultVisitDate),
    mode: "onTouched",
  });
  const { control } = form;
  const procedures = useFieldArray({ control, name: "procedures" });
  const prescriptions = useFieldArray({ control, name: "prescriptions" });

  const handleSave = form.handleSubmit((values) => {
    setError(null);
    startTransition(async () => {
      const res = await onSubmit(toPayload(values));
      if (res?.error) setError(res.error);
    });
  });

  return (
    <form onSubmit={handleSave} noValidate className="space-y-6">
      {initial && (
        <Alert
          variant="warning"
          className="block border-transparent px-3 py-2 text-xs text-amber-800"
        >
          أنت تعدّل سجلاً محفوظاً. سيتم حفظ نسخة من القيم السابقة في سجل التعديلات.
        </Alert>
      )}

      {header}

      {/* Dates */}
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField control={control} name="visitDate" type="date" label="تاريخ الزيارة" />
        <FormField
          control={control}
          name="followUpDate"
          type="date"
          label="موعد المتابعة (اختياري)"
        />
      </div>

      <FormField
        control={control}
        name="chiefComplaint"
        type="textarea"
        label="شكوى المريض"
        rows={2}
        placeholder="ما الذي يشكو منه المريض؟"
      />
      <FormField
        control={control}
        name="diagnosis"
        type="textarea"
        label="التشخيص"
        rows={2}
        placeholder="التشخيص المبدئي أو النهائي..."
      />
      <FormField
        control={control}
        name="clinicalNotes"
        type="textarea"
        label="ملاحظات الطبيب"
        rows={4}
        placeholder="نتائج الفحص، الخطة العلاجية..."
      />

      {/* Procedures */}
      <RowSection title="الإجراءات المُنفَّذة" onAdd={() => procedures.append(emptyProcedure())}>
        {procedures.fields.map((field, i) => (
          <div key={field.id} className="rounded-xl border border-border p-3">
            <div className="flex items-start gap-2">
              <FormField
                control={control}
                name={`procedures.${i}.kind`}
                type="select"
                options={PROCEDURE_KIND_OPTIONS}
                className="w-36 shrink-0"
              />
              <FormField
                control={control}
                name={`procedures.${i}.name`}
                placeholder="اسم الإجراء"
                className="min-w-0 flex-1"
              />
              <FormField
                control={control}
                name={`procedures.${i}.cost`}
                inputMode="decimal"
                placeholder="التكلفة"
                dir="ltr"
                className="w-24 shrink-0"
              />
              <RemoveButton onClick={() => procedures.remove(i)} />
            </div>
            <FormField
              control={control}
              name={`procedures.${i}.note`}
              placeholder="ملاحظة (اختياري)"
              className="mt-2"
            />
          </div>
        ))}
      </RowSection>

      {/* Prescriptions */}
      <RowSection title="الروشتة" onAdd={() => prescriptions.append(emptyPrescription())}>
        {prescriptions.fields.map((field, i) => (
          <div key={field.id} className="rounded-xl border border-border p-3">
            <div className="flex items-start gap-2">
              <FormField
                control={control}
                name={`prescriptions.${i}.drugName`}
                placeholder="اسم الدواء"
                className="min-w-0 flex-1"
              />
              <RemoveButton onClick={() => prescriptions.remove(i)} />
            </div>
            <div className="mt-2 grid gap-2 sm:grid-cols-3">
              <FormField
                control={control}
                name={`prescriptions.${i}.dose`}
                placeholder="الجرعة (500 مجم)"
              />
              <FormField
                control={control}
                name={`prescriptions.${i}.frequency`}
                placeholder="التكرار (مرتين يومياً)"
              />
              <FormField
                control={control}
                name={`prescriptions.${i}.durationDays`}
                inputMode="numeric"
                placeholder="المدة (أيام)"
              />
            </div>
            <FormField
              control={control}
              name={`prescriptions.${i}.instructions`}
              placeholder="تعليمات (بعد الأكل...)"
              className="mt-2"
            />
          </div>
        ))}
      </RowSection>

      {error && <p className="font-sans text-sm text-red-600">{error}</p>}

      <div className="flex gap-3">
        <Button type="submit" loading={isPending} className="flex-1">
          {isPending ? "جارٍ الحفظ..." : initial ? "حفظ التعديلات" : "حفظ السجل"}
        </Button>
        <Button type="button" variant="outline" onClick={onCancel}>
          إلغاء
        </Button>
      </div>
    </form>
  );
}

// ─── Primitives ───────────────────────────────────────────────────────────────

export function Labeled({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="font-sans text-sm font-medium text-foreground">{label}</Label>
      {children}
    </div>
  );
}

function RowSection({
  title,
  onAdd,
  children,
}: {
  title: string;
  onAdd: () => void;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="font-sans text-sm font-medium text-foreground">{title}</h3>
        <Button type="button" variant="outline" size="sm" onClick={onAdd}>
          <Plus />
          إضافة
        </Button>
      </div>
      <div className="space-y-2">{children}</div>
    </section>
  );
}

function RemoveButton({ onClick }: { onClick: () => void }) {
  return (
    <Hint label="حذف">
      <Button
        aria-label="حذف"
        type="button"
        variant="ghost-destructive"
        size="icon"
        onClick={onClick}
        className="h-10 shrink-0 border border-border hover:border-red-200"
      >
        <Trash2 />
      </Button>
    </Hint>
  );
}
