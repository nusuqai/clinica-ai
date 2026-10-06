"use client";

import { useEffect, useState } from "react";
import { useFieldArray, useForm, useWatch, type Control } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, Trash2 } from "lucide-react";
import { createClinicTemplateAction } from "@/server/actions/platformWhatsapp";
import { countVariables } from "@/lib/meta/template-render";
import type { TemplateButton, TemplateButtonType, TemplateCategory } from "@/lib/meta/whatsapp";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Label } from "@/components/ui/label";
// Shared with the clinic-side reminders page and inbox picker, so these stay
// under components/admin/whatsapp rather than moving here.
import { LANGUAGES } from "@/components/admin/whatsapp/languages";
import WhatsappPreview from "@/components/admin/whatsapp/whatsapp-preview";
import { Card } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { createTemplateSchema, type CreateTemplateValues } from "@/lib/validations/platform";

const CATEGORIES: { value: TemplateCategory; label: string }[] = [
  { value: "UTILITY", label: "خدمية (Utility)" },
  { value: "MARKETING", label: "تسويقية (Marketing)" },
  { value: "AUTHENTICATION", label: "مصادقة (Authentication)" },
];

const BUTTON_TYPES: { value: TemplateButtonType; label: string }[] = [
  { value: "QUICK_REPLY", label: "رد سريع" },
  { value: "URL", label: "رابط (URL)" },
  { value: "PHONE_NUMBER", label: "اتصال" },
];

const smallLabel = "text-xs font-normal text-muted-foreground";

// Meta allows more, but a small cap keeps the builder and preview readable.
const MAX_BUTTONS = 3;

const EMPTY_TEMPLATE: CreateTemplateValues = {
  name: "",
  category: "UTILITY",
  language: LANGUAGES[0].value,
  headerText: "",
  bodyText: "",
  footerText: "",
  examples: [],
  buttons: [],
};

type TemplateControl = Control<CreateTemplateValues>;

/** The form's buttons as Meta expects them: only the field each type uses. */
function toTemplateButtons(buttons: CreateTemplateValues["buttons"]): TemplateButton[] {
  return buttons.map((b) => ({
    type: b.type,
    text: b.text,
    ...(b.type === "URL" && { url: b.url }),
    ...(b.type === "PHONE_NUMBER" && { phoneNumber: b.phoneNumber }),
  }));
}

/**
 * Create-a-template form. Submits the template to Meta for approval and shows a
 * live WhatsApp-style preview of the body as the admin types, with the example
 * values standing in for the `{{n}}` placeholders.
 */
export default function CreateTemplate({
  clinicId,
  disabled,
}: {
  clinicId: string;
  disabled: boolean;
}) {
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const form = useForm<CreateTemplateValues>({
    resolver: zodResolver(createTemplateSchema),
    defaultValues: EMPTY_TEMPLATE,
    mode: "onTouched",
  });
  const { control } = form;
  const buttons = useFieldArray({ control, name: "buttons" });
  const submitting = form.formState.isSubmitting;

  const handleSubmit = form.handleSubmit(async (v) => {
    setMessage(null);
    const res = await createClinicTemplateAction({
      clinicId,
      name: v.name,
      category: v.category,
      language: v.language,
      headerText: v.headerText || undefined,
      bodyText: v.bodyText,
      footerText: v.footerText || undefined,
      buttons: v.buttons.length > 0 ? toTemplateButtons(v.buttons) : undefined,
      bodyExamples: v.examples.length > 0 ? v.examples : undefined,
    });
    if (res.ok) {
      setMessage({
        ok: true,
        text: `تم إرسال القالب إلى ميتا للمراجعة (الحالة: ${res.status}).`,
      });
      form.reset({ ...EMPTY_TEMPLATE, category: v.category, language: v.language });
    } else {
      setMessage({
        ok: false,
        text: ("message" in res && res.message) || "تعذّر إرسال القالب.",
      });
    }
  });

  return (
    <div>
      <h2 className="mb-3 flex items-center gap-2 font-sans text-sm font-semibold text-foreground">
        <Plus className="h-4 w-4 text-accent" />
        إنشاء قالب جديد
      </h2>
      <Card className="grid grid-cols-1 gap-5 p-5 md:grid-cols-2">
        {/* Form column */}
        <form onSubmit={handleSubmit} noValidate className="space-y-4">
          {disabled && (
            <Alert variant="warning" className="block rounded-lg px-3 py-2 text-xs">
              أدخل بيانات الاتصال أولاً لتتمكن من إنشاء القوالب.
            </Alert>
          )}
          <FormField
            control={control}
            name="name"
            label="اسم القالب (أحرف صغيرة وأرقام وشرطة سفلية)"
            labelClassName={smallLabel}
            placeholder="appointment_reminder"
            dir="ltr"
          />
          <div className="grid grid-cols-2 gap-3">
            <FormField
              control={control}
              name="category"
              type="select"
              label="الفئة"
              labelClassName={smallLabel}
              options={CATEGORIES}
            />
            <FormField
              control={control}
              name="language"
              type="select"
              label="اللغة"
              labelClassName={smallLabel}
              options={LANGUAGES}
            />
          </div>
          <FormField
            control={control}
            name="headerText"
            label="العنوان (اختياري)"
            labelClassName={smallLabel}
            placeholder="تذكير بموعد"
          />
          <FormField
            control={control}
            name="bodyText"
            type="textarea"
            label={
              <>
                نص الرسالة (استخدم {"{{1}}"}، {"{{2}}"} للمتغيرات)
              </>
            }
            labelClassName={smallLabel}
            rows={3}
            placeholder={"مرحبًا {{1}}، تذكير بموعدك يوم {{2}}."}
          />
          <ExampleFields control={control} setValue={form.setValue} getValues={form.getValues} />
          <FormField
            control={control}
            name="footerText"
            label="تذييل اختياري"
            labelClassName={smallLabel}
            placeholder="عيادة النور"
          />

          {/* Buttons builder */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className={smallLabel}>الأزرار (اختياري)</Label>
              <Button
                type="button"
                variant="link"
                size="sm"
                onClick={() =>
                  buttons.append({ type: "QUICK_REPLY", text: "", url: "", phoneNumber: "" })
                }
                disabled={buttons.fields.length >= MAX_BUTTONS}
                className="h-auto px-0 text-accent [&_svg]:size-3"
              >
                <Plus />
                إضافة زر
              </Button>
            </div>
            {buttons.fields.map((field, i) => (
              <ButtonRow
                key={field.id}
                control={control}
                index={i}
                onRemove={() => buttons.remove(i)}
              />
            ))}
          </div>

          {message && (
            <p className={`text-xs ${message.ok ? "text-green-600" : "text-red-600"}`}>
              {message.text}
            </p>
          )}

          <Button type="submit" loading={submitting} disabled={disabled}>
            {!submitting && <Plus />}
            إرسال للمراجعة
          </Button>
        </form>

        {/* Live preview column */}
        <div>
          <p className="mb-2 font-sans text-xs text-muted-foreground">معاينة مباشرة</p>
          <LivePreview control={control} />
        </div>
      </Card>
    </div>
  );
}

/** One example input per `{{n}}` in the body, kept in step with the variable count. */
function ExampleFields({
  control,
  setValue,
  getValues,
}: {
  control: TemplateControl;
  setValue: ReturnType<typeof useForm<CreateTemplateValues>>["setValue"];
  getValues: ReturnType<typeof useForm<CreateTemplateValues>>["getValues"];
}) {
  const varCount = countVariables(useWatch({ control, name: "bodyText" }));

  useEffect(() => {
    const prev = getValues("examples");
    if (prev.length === varCount) return;
    setValue(
      "examples",
      Array.from({ length: varCount }, (_, i) => prev[i] ?? "")
    );
  }, [varCount, getValues, setValue]);

  if (varCount === 0) return null;
  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">
        قيم توضيحية للمتغيرات (يطلبها ميتا للمراجعة، وتظهر في المعاينة)
      </p>
      {Array.from({ length: varCount }, (_, i) => (
        <FormField
          key={i}
          control={control}
          name={`examples.${i}`}
          placeholder={`مثال للقيمة ${i + 1} ({{${i + 1}}})`}
        />
      ))}
    </div>
  );
}

/** One template button; shows the URL / phone field its type needs. */
function ButtonRow({
  control,
  index,
  onRemove,
}: {
  control: TemplateControl;
  index: number;
  onRemove: () => void;
}) {
  const type = useWatch({ control, name: `buttons.${index}.type` });
  return (
    <div className="space-y-2 rounded-lg border border-border p-2.5">
      <div className="flex items-start gap-2">
        <FormField
          control={control}
          name={`buttons.${index}.type`}
          type="select"
          options={BUTTON_TYPES}
          className="w-32 shrink-0"
          controlClassName="h-9 text-xs"
        />
        <FormField
          control={control}
          name={`buttons.${index}.text`}
          placeholder="نص الزر"
          maxLength={25}
          className="flex-1"
          controlClassName="h-9"
        />
        <Button
          type="button"
          variant="ghost-destructive"
          size="icon-sm"
          onClick={onRemove}
          aria-label="حذف الزر"
        >
          <Trash2 />
        </Button>
      </div>
      {type === "URL" && (
        <FormField
          control={control}
          name={`buttons.${index}.url`}
          type="url"
          placeholder="https://example.com"
          controlClassName="h-9"
        />
      )}
      {type === "PHONE_NUMBER" && (
        <FormField
          control={control}
          name={`buttons.${index}.phoneNumber`}
          type="tel"
          placeholder="+201234567890"
          controlClassName="h-9"
        />
      )}
    </div>
  );
}

/** The WhatsApp-style preview; the only part that re-renders on every keystroke. */
function LivePreview({ control }: { control: TemplateControl }) {
  const [headerText, bodyText, footerText, examples, buttons] = useWatch({
    control,
    name: ["headerText", "bodyText", "footerText", "examples", "buttons"],
  });
  return (
    <WhatsappPreview
      headerText={headerText}
      bodyText={bodyText}
      variables={examples}
      footerText={footerText}
      buttons={toTemplateButtons(buttons)}
      className="md:sticky md:top-4"
    />
  );
}
