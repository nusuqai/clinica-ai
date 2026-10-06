"use client";

import { useMemo, useState, useTransition } from "react";
import { useController, useForm, useWatch, type Control } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { UserPlus } from "lucide-react";
import Modal from "@/components/admin/modal";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { createDoctorAction } from "@/server/actions/admin";
import {
  addDoctorSchema,
  doctorToFormData,
  EMPTY_DOCTOR_FORM,
  type DoctorFormValues,
} from "@/lib/validations/doctor";
import { type SpecialtyOption } from "./specialty-select";
import AvailabilityRulesEditor, { type EditorBranch } from "./availability-rules-editor";
import { DoctorFormFields } from "./doctor-form-fields";

export type BranchOption = EditorBranch;

export default function AddDoctorModal({
  branches,
  specialties,
}: {
  branches: BranchOption[];
  specialties: SpecialtyOption[];
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const form = useForm<DoctorFormValues>({
    resolver: zodResolver(addDoctorSchema),
    defaultValues: EMPTY_DOCTOR_FORM,
    mode: "onTouched",
  });

  const handleSubmit = form.handleSubmit((values) => {
    setError(null);
    startTransition(async () => {
      const res = await createDoctorAction(doctorToFormData(values));
      if (res?.error) {
        setError(res.error);
      } else {
        setOpen(false);
        form.reset(EMPTY_DOCTOR_FORM);
      }
    });
  });

  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <UserPlus />
        إضافة طبيب
      </Button>

      <Modal open={open} onClose={() => setOpen(false)} title="إضافة طبيب جديد" width="max-w-2xl">
        <form onSubmit={handleSubmit} noValidate className="space-y-4">
          {error && <Alert variant="destructive">{error}</Alert>}

          <DoctorFormFields
            control={form.control}
            branches={branches}
            specialties={specialties}
            optionalHints
            afterBranches={<DraftRules control={form.control} branches={branches} />}
          />

          <div className="flex gap-3 pt-2">
            <Button type="submit" loading={isPending} className="flex-1">
              {isPending ? "جارٍ الحفظ..." : "إضافة الطبيب"}
            </Button>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              إلغاء
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}

/**
 * Availability rules drafted with the doctor and created right after it. Only
 * branches picked above are offered — so this watches `branchIds`, keeping the
 * re-render to this section when a branch is ticked.
 */
function DraftRules({
  control,
  branches,
}: {
  control: Control<DoctorFormValues>;
  branches: BranchOption[];
}) {
  const branchIds = useWatch({ control, name: "branchIds" });
  const selected = useMemo(
    () => branches.filter((b) => branchIds.includes(b.id)),
    [branches, branchIds]
  );
  const { field } = useController({ control, name: "rules" });

  return (
    <AvailabilityRulesEditor
      mode="draft"
      branches={selected}
      rules={field.value}
      onRulesChange={field.onChange}
    />
  );
}
