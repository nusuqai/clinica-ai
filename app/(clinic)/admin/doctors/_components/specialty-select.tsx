"use client";

import { useWatch, type Control, type Path } from "react-hook-form";
import { FormField } from "@/components/ui/form-field";
import { NEW_SPECIALTY } from "@/lib/validations/doctor";

/** Any form with the two specialty fields (the doctor modals, the doctor's own profile). */
type WithSpecialty = { specialtyId: string; newSpecialtyName: string };

export interface SpecialtyOption {
  id: string;
  name: string;
}

/**
 * Specialty picker: choose from the clinic's list, or "➕ تخصص جديد" to create
 * one inline. Sets `specialtyId` (or NEW_SPECIALTY + `newSpecialtyName`); the
 * server resolves either into a specialtyId (find-or-create, case-insensitive).
 */
export default function SpecialtySelect<T extends WithSpecialty>({
  control,
  specialties,
}: {
  control: Control<T>;
  specialties: SpecialtyOption[];
}) {
  const idName = "specialtyId" as Path<T>;
  const isNew = useWatch({ control, name: idName }) === NEW_SPECIALTY;

  return (
    <div className="space-y-2">
      <FormField
        control={control}
        name={idName}
        type="select"
        label="التخصص"
        options={[
          { value: "", label: "— اختر التخصص —" },
          ...specialties.map((s) => ({ value: s.id, label: s.name })),
          { value: NEW_SPECIALTY, label: "➕ تخصص جديد…" },
        ]}
      />
      {isNew && (
        <FormField
          control={control}
          name={"newSpecialtyName" as Path<T>}
          placeholder="اسم التخصص الجديد"
          autoFocus
        />
      )}
    </div>
  );
}
