"use client";

import { useState } from "react";

export interface SpecialtyOption {
  id: string;
  name: string;
}

const inputCls =
  "w-full border border-border rounded-xl px-3 py-2 text-sm bg-background text-foreground font-sans focus:outline-none focus:ring-2 focus:ring-primary/30";

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
      <label className="text-sm font-medium text-foreground font-sans">التخصص</label>
      {/* Real submitted value: empty when creating a new specialty. */}
      <input type="hidden" name="specialtyId" value={isNew ? "" : value} />
      <select
        value={value}
        onChange={(e) => setValue(e.target.value)}
        required={required && !isNew}
        className={inputCls}
      >
        <option value="">— اختر التخصص —</option>
        {specialties.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
        <option value="__new__">➕ تخصص جديد…</option>
      </select>
      {isNew && (
        <input
          name="newSpecialtyName"
          required={required}
          placeholder="اسم التخصص الجديد"
          className={inputCls}
        />
      )}
    </div>
  );
}
