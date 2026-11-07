"use client";

import { useController, type Control } from "react-hook-form";
import { FormField } from "@/components/ui/form-field";
import { Label } from "@/components/ui/label";
import type { DoctorFormValues } from "@/lib/validations/doctor";
import SpecialtySelect, { type SpecialtyOption } from "./specialty-select";
import type { EditorBranch } from "./availability-rules-editor";

export const DOCTOR_TITLE_OPTIONS = [
  { value: "", label: "غير محدد" },
  { value: "SPECIALIST", label: "أخصائي" },
  { value: "CONSULTANT", label: "استشاري" },
];

/**
 * The doctor fields shared by the add and edit modals. `afterBranches` is where
 * the add modal slots its drafted availability rules.
 */
export function DoctorFormFields({
  control,
  branches,
  specialties,
  optionalHints = false,
  afterBranches,
}: {
  control: Control<DoctorFormValues>;
  branches: EditorBranch[];
  specialties: SpecialtyOption[];
  /** Label the optional fields "(اختياري)" and show example placeholders — the add modal. */
  optionalHints?: boolean;
  afterBranches?: React.ReactNode;
}) {
  const opt = optionalHints ? " (اختياري)" : "";

  return (
    <>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <FormField
          control={control}
          name="fullName"
          label={optionalHints ? "الاسم الكامل *" : "الاسم الكامل"}
          placeholder={optionalHints ? "د. أحمد محمد" : undefined}
        />
        <FormField
          control={control}
          name="title"
          type="select"
          label={`الدرجة${opt}`}
          options={DOCTOR_TITLE_OPTIONS}
        />
        <div>
          <SpecialtySelect control={control} specialties={specialties} />
        </div>
        <FormField
          control={control}
          name="yearsOfExperience"
          type="number"
          label={`سنوات الخبرة${opt}`}
          min={0}
          placeholder={optionalHints ? "10" : undefined}
        />
        <FormField
          control={control}
          name="examinationFee"
          type="number"
          label={`سعر الكشف${opt}`}
          min={0}
          step="0.01"
          placeholder={optionalHints ? "200.00" : undefined}
        />
        <FormField
          control={control}
          name="consultationFee"
          type="number"
          label={`سعر الاستشارة${opt}`}
          min={0}
          step="0.01"
          placeholder={optionalHints ? "150.00" : undefined}
        />
      </div>

      {/* Flags */}
      <div className="flex flex-wrap gap-4">
        <FormField
          control={control}
          name="requiresAdvanceBooking"
          type="checkbox"
          label="يحتاج حجزاً مسبقاً"
        />
        <FormField
          control={control}
          name="acceptsChildren"
          type="checkbox"
          label="يكشف على الأطفال"
        />
      </div>

      <BranchPicker control={control} branches={branches} />

      {afterBranches}

      <FormField
        control={control}
        name="qualifications"
        type="textarea"
        label={`المؤهلات العلمية${opt}`}
        rows={2}
        placeholder={optionalHints ? "بكالوريوس الطب والجراحة، ماجستير..." : undefined}
      />
      <FormField
        control={control}
        name="expertiseAreas"
        type="textarea"
        label={`مجالات الخبرة الدقيقة${opt}`}
        rows={2}
        placeholder={optionalHints ? "جراحة المناظير، أمراض القلب التداخلية..." : undefined}
      />
      <FormField
        control={control}
        name="bio"
        type="textarea"
        label={optionalHints ? "نبذة تعريفية (اختياري)" : "النبذة التعريفية"}
        rows={3}
        placeholder={optionalHints ? "خبرة في..." : undefined}
      />
    </>
  );
}

/** Work-branch checkboxes, bound to the `branchIds` array. */
function BranchPicker({
  control,
  branches,
}: {
  control: Control<DoctorFormValues>;
  branches: EditorBranch[];
}) {
  const { field } = useController({ control, name: "branchIds" });
  const selected = field.value;

  return (
    <div className="space-y-1.5">
      <Label className="font-sans text-sm font-medium text-foreground">فروع العمل</Label>
      {branches.length === 0 ? (
        <p className="font-sans text-xs text-muted-foreground">
          لا توجد فروع. أضف فرعاً من صفحة الفروع أولاً.
        </p>
      ) : (
        <div className="flex flex-wrap gap-3">
          {branches.map((b) => (
            <FormField
              key={b.id}
              type="checkbox"
              label={b.name}
              labelClassName="cursor-pointer font-normal"
              checked={selected.includes(b.id)}
              onCheckedChange={(c) =>
                field.onChange(c ? [...selected, b.id] : selected.filter((x) => x !== b.id))
              }
              className="rounded-xl border border-border px-3 py-2 hover:bg-muted"
            />
          ))}
        </div>
      )}
    </div>
  );
}
