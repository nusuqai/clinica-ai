"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ClipboardList, Pencil } from "lucide-react";
import Modal from "@/components/admin/modal";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Alert } from "@/components/ui/alert";
import { updatePatientIntakeAction } from "@/server/actions/admin";
import {
  EMPTY_INTAKE,
  INTAKE_FIELDS,
  staffIntakeSchema,
  type IntakeValues,
} from "@/lib/patient-intake";

interface Props {
  patientId: string;
  /** Current answers; null when the patient has no file yet. */
  initial: Partial<Record<keyof IntakeValues, string | null>> | null;
  /** Pre-fills the name when creating a new file. */
  patientName: string;
}

/** Admin: create or edit a patient's intake file ("ملف المريض"). */
export default function EditIntakeModal({ patientId, initial, patientName }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, start] = useTransition();

  const toValues = (): IntakeValues =>
    initial
      ? (Object.fromEntries(
          INTAKE_FIELDS.map((f) => [f.key, initial[f.key] ?? ""])
        ) as IntakeValues)
      : { ...EMPTY_INTAKE, fullName: patientName };

  const form = useForm<IntakeValues>({
    resolver: zodResolver(staffIntakeSchema),
    defaultValues: toValues(),
    mode: "onTouched",
  });

  const handleSave = form.handleSubmit((values) => {
    setError(null);
    start(async () => {
      const res = await updatePatientIntakeAction(patientId, values);
      if (res?.error) setError(res.error);
      else {
        setOpen(false);
        router.refresh();
      }
    });
  });

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => {
          setError(null);
          form.reset(toValues());
          setOpen(true);
        }}
      >
        {initial ? <Pencil /> : <ClipboardList />}
        {initial ? "تعديل الملف" : "إضافة ملف المريض"}
      </Button>

      <Modal open={open} onClose={() => setOpen(false)} title="ملف المريض">
        {error && (
          <Alert variant="destructive" className="mb-4 border-red-100 text-red-600">
            {error}
          </Alert>
        )}
        <form onSubmit={handleSave} noValidate className="space-y-4">
          {INTAKE_FIELDS.map((f) => (
            <FormField
              key={f.key}
              type={f.multiline ? "textarea" : "text"}
              {...(f.multiline ? { rows: 2 } : {})}
              label={f.label}
              control={form.control}
              name={f.key}
            />
          ))}
          <p className="text-xs text-muted-foreground">
            يمكن ترك أي حقل فارغاً إن لم تكن المعلومة متاحة.
          </p>
          <Button type="submit" loading={saving} className="font-semibold">
            حفظ الملف
          </Button>
        </form>
      </Modal>
    </>
  );
}
