"use client";

import { useState } from "react";
import { FormField } from "@/components/ui/form-field";

export interface SpecialtyOption {
  id: string;
  name: string;
}

/**
 * Specialty picker: choose from the clinic's list, or "➕ تخصص جديد" to create
 * one inline. Submits `specialtyId` (hidden) or `newSpecialtyName` — the server
 * resolves either into a specialtyId (find-or-create, case-insensitive).
 */
export default function SpecialtySelect({
  specialties,
  defaultSpecialtyId = null,
  required = false,
}: {
  specialties: SpecialtyOption[];
  defaultSpecialtyId?: string | null;
  required?: boolean;
}) {
  const [value, setValue] = useState<string>(defaultSpecialtyId ?? "");
  const isNew = value === "__new__";

  return (
    <div className="space-y-2">
      {/* Real submitted value: empty when creating a new specialty. */}
      <input type="hidden" name="specialtyId" value={isNew ? "" : value} />
      <FormField
        type="select"
        label="التخصص"
        value={value}
        onValueChange={setValue}
        required={required && !isNew}
        options={[
          { value: "", label: "— اختر التخصص —" },
          ...specialties.map((s) => ({ value: s.id, label: s.name })),
          { value: "__new__", label: "➕ تخصص جديد…" },
        ]}
      />
      {isNew && (
        <FormField name="newSpecialtyName" required={required} placeholder="اسم التخصص الجديد" />
      )}
    </div>
  );
}
