"use client";

import { useEffect, useState } from "react";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { createTemplateAction } from "@/server/actions/whatsapp";
import { countVariables } from "@/lib/meta/template-render";
import type {
  TemplateCategory,
  TemplateButton,
  TemplateButtonType,
} from "@/lib/meta/whatsapp";
import { Field } from "./field";
import { LANGUAGES } from "./languages";
import WhatsappPreview from "./whatsapp-preview";

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

// Meta allows more, but a small cap keeps the builder and preview readable.
const MAX_BUTTONS = 3;

/**
 * Create-a-template form. Submits the template to Meta for approval and shows a
 * live WhatsApp-style preview of the body as the admin types, with the example
 * values standing in for the `{{n}}` placeholders.
 */
export default function CreateTemplate({ disabled }: { disabled: boolean }) {
  const [name, setName] = useState("");
  const [category, setCategory] = useState<TemplateCategory>("UTILITY");
  const [language, setLanguage] = useState<string>(LANGUAGES[0].value);
  const [headerText, setHeaderText] = useState("");
  const [bodyText, setBodyText] = useState("");
  const [footerText, setFooterText] = useState("");
  const [buttons, setButtons] = useState<TemplateButton[]>([]);
  const [examples, setExamples] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(
    null,
  );

  const varCount = countVariables(bodyText);
  // Keep the examples array length in sync with the variable count.
  useEffect(() => {
    setExamples((prev) =>
      Array.from({ length: varCount }, (_, i) => prev[i] ?? ""),
    );
  }, [varCount]);

  const addButton = () =>
    setButtons((prev) =>
      prev.length >= MAX_BUTTONS
        ? prev
        : [...prev, { type: "QUICK_REPLY", text: "" }],
    );
  const updateButton = (i: number, patch: Partial<TemplateButton>) =>
    setButtons((prev) => prev.map((b, j) => (j === i ? { ...b, ...patch } : b)));
  const removeButton = (i: number) =>
    setButtons((prev) => prev.filter((_, j) => j !== i));

  const handleSubmit = async () => {
    setSubmitting(true);
    setMessage(null);
    const res = await createTemplateAction({
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
      <h2 className="text-sm font-semibold text-foreground font-sans mb-3 flex items-center gap-2">
        <Plus className="w-4 h-4 text-accent" />
        إنشاء قالب جديد
      </h2>
      <div className="bg-card border border-border rounded-2xl p-5 grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* Form column */}
        <div className="space-y-4">
          {disabled && (
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              أدخل بيانات الاتصال أولاً لتتمكن من إنشاء القوالب.
            </p>
          )}
          <Field label="اسم القالب (أحرف صغيرة وأرقام وشرطة سفلية)" value={name} onChange={setName} placeholder="appointment_reminder" />
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-muted-foreground mb-1 font-sans">الفئة</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as TemplateCategory)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-accent"
              >
                {CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-muted-foreground mb-1 font-sans">اللغة</label>
              <select
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-accent"
              >
                {LANGUAGES.map((l) => (
                  <option key={l.value} value={l.value}>
                    {l.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <Field
            label="العنوان (اختياري)"
            value={headerText}
            onChange={setHeaderText}
            placeholder="تذكير بموعد"
            dir="rtl"
          />
          <div>
            <label className="block text-xs text-muted-foreground mb-1 font-sans">
              نص الرسالة (استخدم {"{{1}}"}، {"{{2}}"} للمتغيرات)
            </label>
            <textarea
              value={bodyText}
              onChange={(e) => setBodyText(e.target.value)}
              rows={3}
              placeholder={"مرحبًا {{1}}، تذكير بموعدك يوم {{2}}."}
              className="w-full resize-none rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-accent"
              dir="rtl"
            />
          </div>
          {examples.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">قيم توضيحية للمتغيرات (يطلبها ميتا للمراجعة، وتظهر في المعاينة)</p>
              {examples.map((ex, i) => (
                <input
                  key={i}
                  value={ex}
                  onChange={(e) =>
                    setExamples((prev) => prev.map((x, j) => (j === i ? e.target.value : x)))
                  }
                  placeholder={`مثال للقيمة ${i + 1} ({{${i + 1}}})`}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-accent"
                />
              ))}
            </div>
          )}
          <Field label="تذييل اختياري" value={footerText} onChange={setFooterText} placeholder="عيادة النور" dir="rtl" />

          {/* Buttons builder */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs text-muted-foreground font-sans">الأزرار (اختياري)</label>
              <button
                type="button"
                onClick={addButton}
                disabled={buttons.length >= MAX_BUTTONS}
                className="inline-flex items-center gap-1 text-xs text-accent hover:underline disabled:opacity-40 disabled:no-underline"
              >
                <Plus className="w-3 h-3" />
                إضافة زر
              </button>
            </div>
            {buttons.map((b, i) => (
              <div key={i} className="rounded-lg border border-border p-2.5 space-y-2">
                <div className="flex items-center gap-2">
                  <select
                    value={b.type}
                    onChange={(e) =>
                      updateButton(i, { type: e.target.value as TemplateButtonType })
                    }
                    className="rounded-lg border border-border bg-background px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-accent"
                  >
                    {BUTTON_TYPES.map((t) => (
                      <option key={t.value} value={t.value}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                  <input
                    value={b.text}
                    onChange={(e) => updateButton(i, { text: e.target.value })}
                    placeholder="نص الزر"
                    maxLength={25}
                    className="flex-1 rounded-lg border border-border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-accent"
                    dir="rtl"
                  />
                  <button
                    type="button"
                    onClick={() => removeButton(i)}
                    className="text-muted-foreground hover:text-red-600 flex-shrink-0"
                    aria-label="حذف الزر"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
                {b.type === "URL" && (
                  <input
                    value={b.url ?? ""}
                    onChange={(e) => updateButton(i, { url: e.target.value })}
                    placeholder="https://example.com"
                    className="w-full rounded-lg border border-border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-accent"
                    dir="ltr"
                  />
                )}
                {b.type === "PHONE_NUMBER" && (
                  <input
                    value={b.phoneNumber ?? ""}
                    onChange={(e) => updateButton(i, { phoneNumber: e.target.value })}
                    placeholder="+201234567890"
                    className="w-full rounded-lg border border-border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-accent"
                    dir="ltr"
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

          <button
            onClick={handleSubmit}
            disabled={disabled || submitting || !name.trim() || !bodyText.trim()}
            className="inline-flex items-center gap-2 rounded-xl bg-primary text-white px-4 py-2 text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-40"
          >
            {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            إرسال للمراجعة
          </button>
        </div>

        {/* Live preview column */}
        <div>
          <p className="text-xs text-muted-foreground mb-2 font-sans">معاينة مباشرة</p>
          <WhatsappPreview
            headerText={headerText}
            bodyText={bodyText}
            variables={examples}
            footerText={footerText}
            buttons={buttons}
            className="md:sticky md:top-4"
          />
        </div>
      </div>
    </div>
  );
}
