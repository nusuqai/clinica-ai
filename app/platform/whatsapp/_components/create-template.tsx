"use client";

import { useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { createClinicTemplateAction } from "@/server/actions/platformWhatsapp";
import { countVariables } from "@/lib/meta/template-render";
import type { TemplateCategory, TemplateButton, TemplateButtonType } from "@/lib/meta/whatsapp";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Label } from "@/components/ui/label";
// Shared with the clinic-side reminders page and inbox picker, so these stay
// under components/admin/whatsapp rather than moving here.
import { LANGUAGES } from "@/components/admin/whatsapp/languages";
import WhatsappPreview from "@/components/admin/whatsapp/whatsapp-preview";
import { Card } from "@/components/ui/card";

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
  const [name, setName] = useState("");
  const [category, setCategory] = useState<TemplateCategory>("UTILITY");
  const [language, setLanguage] = useState<string>(LANGUAGES[0].value);
  const [headerText, setHeaderText] = useState("");
  const [bodyText, setBodyText] = useState("");
  const [footerText, setFooterText] = useState("");
  const [buttons, setButtons] = useState<TemplateButton[]>([]);
  const [examples, setExamples] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const varCount = countVariables(bodyText);
  // Keep the examples array length in sync with the variable count.
  useEffect(() => {
    setExamples((prev) => Array.from({ length: varCount }, (_, i) => prev[i] ?? ""));
  }, [varCount]);

  const addButton = () =>
    setButtons((prev) =>
      prev.length >= MAX_BUTTONS ? prev : [...prev, { type: "QUICK_REPLY", text: "" }]
    );
  const updateButton = (i: number, patch: Partial<TemplateButton>) =>
    setButtons((prev) => prev.map((b, j) => (j === i ? { ...b, ...patch } : b)));
  const removeButton = (i: number) => setButtons((prev) => prev.filter((_, j) => j !== i));

  const handleSubmit = async () => {
    setSubmitting(true);
    setMessage(null);
    const res = await createClinicTemplateAction({
      clinicId,
      name,
      category,
      language,
      headerText: headerText || undefined,
      bodyText,
      footerText: footerText || undefined,
      buttons: buttons.length > 0 ? buttons : undefined,
      bodyExamples: examples.length > 0 ? examples : undefined,
    });
    setSubmitting(false);
    if (res.ok) {
      setMessage({
        ok: true,
        text: `تم إرسال القالب إلى ميتا للمراجعة (الحالة: ${res.status}).`,
      });
      setName("");
      setHeaderText("");
      setBodyText("");
      setFooterText("");
      setButtons([]);
    } else {
      setMessage({
        ok: false,
        text: ("message" in res && res.message) || "تعذّر إرسال القالب.",
      });
    }
  };

  return (
    <div>
      <h2 className="mb-3 flex items-center gap-2 font-sans text-sm font-semibold text-foreground">
        <Plus className="h-4 w-4 text-accent" />
        إنشاء قالب جديد
      </h2>
      <Card className="grid grid-cols-1 gap-5 p-5 md:grid-cols-2">
        {/* Form column */}
        <div className="space-y-4">
          {disabled && (
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
              أدخل بيانات الاتصال أولاً لتتمكن من إنشاء القوالب.
            </p>
          )}
          <FormField
            label="اسم القالب (أحرف صغيرة وأرقام وشرطة سفلية)"
            labelClassName={smallLabel}
            value={name}
            onValueChange={setName}
            placeholder="appointment_reminder"
            dir="ltr"
          />
          <div className="grid grid-cols-2 gap-3">
            <FormField
              type="select"
              label="الفئة"
              labelClassName={smallLabel}
              value={category}
              onValueChange={(v) => setCategory(v as TemplateCategory)}
              options={CATEGORIES}
            />
            <FormField
              type="select"
              label="اللغة"
              labelClassName={smallLabel}
              value={language}
              onValueChange={setLanguage}
              options={LANGUAGES}
            />
          </div>
          <FormField
            label="العنوان (اختياري)"
            labelClassName={smallLabel}
            value={headerText}
            onValueChange={setHeaderText}
            placeholder="تذكير بموعد"
          />
          <FormField
            type="textarea"
            label={
              <>
                نص الرسالة (استخدم {"{{1}}"}، {"{{2}}"} للمتغيرات)
              </>
            }
            labelClassName={smallLabel}
            value={bodyText}
            onValueChange={setBodyText}
            rows={3}
            placeholder={"مرحبًا {{1}}، تذكير بموعدك يوم {{2}}."}
          />
          {examples.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">
                قيم توضيحية للمتغيرات (يطلبها ميتا للمراجعة، وتظهر في المعاينة)
              </p>
              {examples.map((ex, i) => (
                <FormField
                  key={i}
                  value={ex}
                  onValueChange={(v) =>
                    setExamples((prev) => prev.map((x, j) => (j === i ? v : x)))
                  }
                  placeholder={`مثال للقيمة ${i + 1} ({{${i + 1}}})`}
                />
              ))}
            </div>
          )}
          <FormField
            label="تذييل اختياري"
            labelClassName={smallLabel}
            value={footerText}
            onValueChange={setFooterText}
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
                onClick={addButton}
                disabled={buttons.length >= MAX_BUTTONS}
                className="h-auto px-0 text-accent [&_svg]:size-3"
              >
                <Plus />
                إضافة زر
              </Button>
            </div>
            {buttons.map((b, i) => (
              <div key={i} className="space-y-2 rounded-lg border border-border p-2.5">
                <div className="flex items-center gap-2">
                  <FormField
                    type="select"
                    value={b.type}
                    onValueChange={(v) => updateButton(i, { type: v as TemplateButtonType })}
                    options={BUTTON_TYPES}
                    className="w-32 shrink-0"
                    controlClassName="h-9 text-xs"
                  />
                  <FormField
                    value={b.text}
                    onValueChange={(v) => updateButton(i, { text: v })}
                    placeholder="نص الزر"
                    maxLength={25}
                    className="flex-1"
                    controlClassName="h-9"
                  />
                  <Button
                    type="button"
                    variant="ghost-destructive"
                    size="icon-sm"
                    onClick={() => removeButton(i)}
                    aria-label="حذف الزر"
                  >
                    <Trash2 />
                  </Button>
                </div>
                {b.type === "URL" && (
                  <FormField
                    type="url"
                    value={b.url ?? ""}
                    onValueChange={(v) => updateButton(i, { url: v })}
                    placeholder="https://example.com"
                    controlClassName="h-9"
                  />
                )}
                {b.type === "PHONE_NUMBER" && (
                  <FormField
                    type="tel"
                    value={b.phoneNumber ?? ""}
                    onValueChange={(v) => updateButton(i, { phoneNumber: v })}
                    placeholder="+201234567890"
                    controlClassName="h-9"
                  />
                )}
              </div>
            ))}
          </div>

          {message && (
            <p className={`text-xs ${message.ok ? "text-green-600" : "text-red-600"}`}>
              {message.text}
            </p>
          )}

          <Button
            onClick={handleSubmit}
            loading={submitting}
            disabled={disabled || !name.trim() || !bodyText.trim()}
          >
            {!submitting && <Plus />}
            إرسال للمراجعة
          </Button>
        </div>

        {/* Live preview column */}
        <div>
          <p className="mb-2 font-sans text-xs text-muted-foreground">معاينة مباشرة</p>
          <WhatsappPreview
            headerText={headerText}
            bodyText={bodyText}
            variables={examples}
            footerText={footerText}
            buttons={buttons}
            className="md:sticky md:top-4"
          />
        </div>
      </Card>
    </div>
  );
}
