"use client";

import {
  useFieldArray,
  type ArrayPath,
  type Control,
  type FieldArray,
  type Path,
  type UseFormSetValue,
} from "react-hook-form";
import { Plus, X } from "lucide-react";
import { PhoneType } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Label } from "@/components/ui/label";
import type { PhoneRowValues } from "@/lib/validations/admin";

const PHONE_TYPES: { value: PhoneType; label: string }[] = [
  { value: PhoneType.LANDLINE, label: "أرضي" },
  { value: PhoneType.MOBILE, label: "موبايل" },
  { value: PhoneType.WHATSAPP, label: "واتساب" },
];

type WithPhones = { phones: PhoneRowValues[] };

/**
 * Editable phone list (type, number, label, single "primary") bound to a form's
 * `phones` array — shared by the branch modal and the clinic settings page.
 */
export function PhoneRows<T extends WithPhones>({
  control,
  setValue,
  title,
  description,
  labelPlaceholder = "وصف",
}: {
  control: Control<T>;
  setValue: UseFormSetValue<T>;
  title: string;
  description?: string;
  labelPlaceholder?: string;
}) {
  const { fields, append, remove } = useFieldArray({
    control,
    name: "phones" as ArrayPath<T>,
  });
  const path = (i: number, key: keyof PhoneRowValues) => `phones.${i}.${key}` as Path<T>;

  // Only one primary phone: ticking a row clears the others.
  function makePrimary(i: number) {
    fields.forEach((_, idx) => {
      if (idx !== i) setValue(path(idx, "isPrimary"), false as never);
    });
  }

  return (
    <>
      <div className="flex items-center justify-between">
        <Label className="font-sans text-sm font-medium text-foreground">{title}</Label>
        <Button
          type="button"
          variant="link"
          size="sm"
          onClick={() =>
            append({
              type: PhoneType.MOBILE,
              number: "",
              label: "",
              isPrimary: fields.length === 0,
            } as FieldArray<T, ArrayPath<T>>)
          }
          className="h-auto px-0 text-sm [&_svg]:size-3.5"
        >
          <Plus /> إضافة رقم
        </Button>
      </div>
      {description && <p className="font-sans text-xs text-muted-foreground">{description}</p>}
      {fields.length === 0 && (
        <p className="font-sans text-xs text-muted-foreground">لا توجد أرقام مضافة.</p>
      )}
      {fields.map((field, i) => (
        <div key={field.id} className="flex flex-wrap items-center gap-2">
          <FormField
            control={control}
            name={path(i, "type")}
            type="select"
            options={PHONE_TYPES}
            className="w-28"
          />
          <FormField
            control={control}
            name={path(i, "number")}
            type="tel"
            placeholder="الرقم"
            className="min-w-[120px] flex-1"
          />
          <FormField
            control={control}
            name={path(i, "label")}
            placeholder={labelPlaceholder}
            className="w-28"
          />
          <FormField
            control={control}
            name={path(i, "isPrimary")}
            type="checkbox"
            label="أساسي"
            labelClassName="text-xs font-normal text-muted-foreground"
            onCheckedChange={(checked) => checked && makePrimary(i)}
          />
          <Button
            type="button"
            variant="ghost-destructive"
            size="icon"
            onClick={() => remove(i)}
            aria-label="حذف الرقم"
          >
            <X />
          </Button>
        </div>
      ))}
    </>
  );
}

/** Phone rows as the server expects them: blank rows dropped, empty labels as null. */
export function phonesForSave(phones: PhoneRowValues[]) {
  return phones.filter((p) => p.number).map((p) => ({ ...p, label: p.label || null }));
}
