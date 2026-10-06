"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { BellRing, Loader2, MessageSquareHeart, CalendarClock, Save, Trash2 } from "lucide-react";
import type { AppointmentTemplatePurpose } from "@prisma/client";
import { listTemplatesAction } from "@/server/actions/whatsapp";
import {
  deleteAppointmentTemplateBindingAction,
  getAppointmentTemplateBindingsAction,
  saveAppointmentTemplateBindingAction,
  type AppointmentTemplateBinding,
} from "@/server/actions/appointment-templates";
import type { MessageTemplate } from "@/lib/meta/whatsapp";
import { APPOINTMENT_TOKENS, APPOINTMENT_TOKEN_LABELS } from "@/lib/appointment-templates";
import { languageLabel } from "./languages";
import WhatsappPreview from "./whatsapp-preview";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Label } from "@/components/ui/label";

const TOKEN_OPTIONS = APPOINTMENT_TOKENS.map((t) => ({
  value: t,
  label: APPOINTMENT_TOKEN_LABELS[t],
}));

interface PurposeMeta {
  purpose: AppointmentTemplatePurpose;
  title: string;
  hint: string;
  icon: React.ReactNode;
}

const PURPOSES: PurposeMeta[] = [
  {
    purpose: "CONFIRM_REMINDER",
    title: "تذكير تأكيد الموعد",
    hint: "يُرسَل قبل الموعد ليؤكّد المريض حجزه. اربطه بقالب يحتوي أزرار (تأكيد / إلغاء).",
    icon: <BellRing className="h-4 w-4 text-accent" />,
  },
  {
    purpose: "FEEDBACK_REQUEST",
    title: "طلب التقييم بعد الزيارة",
    hint: "يُرسَل بعد اكتمال الزيارة لطلب رأي المريض في الخدمة.",
    icon: <MessageSquareHeart className="h-4 w-4 text-accent" />,
  },
  {
    purpose: "FOLLOWUP_REMINDER",
    title: "تذكير بموعد المتابعة",
    hint: "يُرسَل قبل موعد المتابعة الذي حدّده الطبيب في السجل العلاجي، يدعو المريض لحجز زيارة متابعة. استخدم حقل «تاريخ الموعد» ليعرض تاريخ المتابعة المقترح.",
    icon: <CalendarClock className="h-4 w-4 text-accent" />,
  },
];

export default function AppointmentAutomation({ configured }: { configured: boolean }) {
  const [templates, setTemplates] = useState<MessageTemplate[]>([]);
  const [bindings, setBindings] = useState<AppointmentTemplateBinding[]>([]);
  const [loading, setLoading] = useState(configured);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!configured) return;
    setLoading(true);
    setError(null);
    const [tRes, bRes] = await Promise.all([
      listTemplatesAction(),
      getAppointmentTemplateBindingsAction(),
    ]);
    setLoading(false);
    if (tRes.ok) setTemplates(tRes.templates.filter((t) => t.status === "APPROVED"));
    else setError(("message" in tRes && tRes.message) || "تعذّر تحميل القوالب.");
    if (bRes.ok) setBindings(bRes.bindings);
  }, [configured]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!configured) {
    return (
      <div className="rounded-2xl border border-border bg-card p-5">
        <p className="text-xs text-muted-foreground">
          لم يُفعّل اتصال واتساب لهذه العيادة بعد. تواصل مع إدارة المنصّة لتفعيله، ثم يمكنك ربط
          قوالب التذكير والتقييم من هنا.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <p className="text-xs leading-relaxed text-muted-foreground">
        اربط كل نوع رسالة بأحد قوالبك المعتمدة، وحدِّد أي بيانات الموعد تملأ كل متغيّر في القالب. لن
        تُرسَل الرسائل التلقائية لنوعٍ ما إلا بعد ربط قالب مُفعّل له.
      </p>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> جارٍ التحميل...
        </div>
      ) : error ? (
        <p className="text-xs text-red-600">{error}</p>
      ) : (
        PURPOSES.map((p) => (
          <BindingCard
            key={p.purpose}
            meta={p}
            templates={templates}
            initial={bindings.find((b) => b.purpose === p.purpose) ?? null}
            onSaved={load}
          />
        ))
      )}
    </div>
  );
}

function templateKey(name: string, language: string) {
  return `${name}__${language}`;
}

function BindingCard({
  meta,
  templates,
  initial,
  onSaved,
}: {
  meta: PurposeMeta;
  templates: MessageTemplate[];
  initial: AppointmentTemplateBinding | null;
  onSaved: () => void;
}) {
  const isReminder = meta.purpose === "CONFIRM_REMINDER";
  const isFollowUp = meta.purpose === "FOLLOWUP_REMINDER";

  const [selected, setSelected] = useState<string>(
    initial ? templateKey(initial.templateName, initial.languageCode) : ""
  );
  const [variableMap, setVariableMap] = useState<string[]>(initial?.variableMap ?? []);
  const [enabled, setEnabled] = useState<boolean>(initial?.enabled ?? true);
  // Confirm reminder is edited in hours before the visit; follow-up in DAYS
  // before the follow-up date; feedback in minutes after completion.
  const [leadHours, setLeadHours] = useState<number>(
    initial ? Math.round(initial.leadMinutes / 60) : 24
  );
  const [leadDays, setLeadDays] = useState<number>(
    initial ? Math.max(1, Math.round(initial.leadMinutes / 1440)) : 3
  );
  const [delayMinutes, setDelayMinutes] = useState<number>(initial?.delayMinutes ?? 120);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const template = useMemo(
    () => templates.find((t) => templateKey(t.name, t.language) === selected) ?? null,
    [templates, selected]
  );

  // When the chosen template changes, resize the variable map to its placeholder
  // count, preserving prior selections where possible.
  const onSelectTemplate = (key: string) => {
    setSelected(key);
    const t = templates.find((x) => templateKey(x.name, x.language) === key);
    const count = t?.variableCount ?? 0;
    setVariableMap((prev) =>
      Array.from({ length: count }, (_, i) => prev[i] ?? TOKEN_OPTIONS[0].value)
    );
    setMsg(null);
  };

  const handleSave = async () => {
    if (!template) return;
    setSaving(true);
    setMsg(null);
    const res = await saveAppointmentTemplateBindingAction({
      purpose: meta.purpose,
      templateName: template.name,
      languageCode: template.language,
      variableMap,
      enabled,
      leadMinutes: isFollowUp ? leadDays * 1440 : isReminder ? leadHours * 60 : undefined,
      delayMinutes: isReminder || isFollowUp ? undefined : delayMinutes,
    });
    setSaving(false);
    if (res.ok) {
      setMsg({ ok: true, text: "تم الحفظ." });
      onSaved();
    } else {
      setMsg({ ok: false, text: ("message" in res && res.message) || "تعذّر الحفظ." });
    }
  };

  const handleDelete = async () => {
    setSaving(true);
    await deleteAppointmentTemplateBindingAction(meta.purpose);
    setSaving(false);
    setSelected("");
    setVariableMap([]);
    setMsg(null);
    onSaved();
  };

  const previewVariables = variableMap.map(
    (t) => `[${APPOINTMENT_TOKEN_LABELS[t as keyof typeof APPOINTMENT_TOKEN_LABELS] ?? t}]`
  );

  return (
    <div className="space-y-4 rounded-2xl border border-border bg-card p-5">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          {meta.icon}
          <div>
            <h2 className="text-sm font-semibold text-foreground">{meta.title}</h2>
            <p className="mt-0.5 max-w-md text-[11px] leading-relaxed text-muted-foreground">
              {meta.hint}
            </p>
          </div>
        </div>
        <FormField
          type="switch"
          label="مُفعّل"
          labelClassName="text-xs font-normal text-muted-foreground"
          checked={enabled}
          onCheckedChange={setEnabled}
          className="shrink-0"
        />
      </div>

      {/* Template picker */}
      <div className="space-y-1.5">
        <FormField
          type="select"
          label="القالب المعتمد"
          labelClassName="text-xs"
          value={selected}
          onValueChange={onSelectTemplate}
          options={[
            { value: "", label: "— اختر قالباً —" },
            ...templates.map((t) => ({
              value: templateKey(t.name, t.language),
              label: `${t.name} · ${languageLabel(t.language)}`,
            })),
          ]}
        />
        {templates.length === 0 && (
          <p className="text-[11px] text-amber-600">
            لا توجد قوالب معتمدة بعد. أنشئ قالباً واعتمده من ميتا أولاً.
          </p>
        )}
      </div>

      {/* Variable mapping */}
      {template && template.variableCount > 0 && (
        <div className="space-y-2">
          <label className="text-xs font-medium text-foreground">
            ربط متغيّرات القالب ({template.variableCount})
          </label>
          {variableMap.map((token, i) => (
            <div key={i} className="flex items-center gap-2">
              <span className="w-12 shrink-0 text-xs text-muted-foreground">{`{{${i + 1}}}`}</span>
              <FormField
                type="select"
                value={token}
                onValueChange={(v) =>
                  setVariableMap((prev) => prev.map((x, j) => (j === i ? v : x)))
                }
                options={TOKEN_OPTIONS}
                className="flex-1"
                controlClassName="h-9"
              />
            </div>
          ))}
        </div>
      )}

      {/* Timing */}
      <div className="space-y-1.5">
        <Label className="text-xs font-medium text-foreground">
          {isFollowUp
            ? "يُرسَل قبل موعد المتابعة بـ (أيام)"
            : isReminder
              ? "يُرسَل قبل الموعد بـ (ساعات)"
              : "يُرسَل بعد اكتمال الزيارة بـ (دقائق)"}
        </Label>
        {isFollowUp ? (
          <FormField
            type="number"
            min={1}
            value={leadDays}
            onValueChange={(v) => setLeadDays(Math.max(1, Number(v)))}
            className="w-32"
            controlClassName="h-9"
          />
        ) : isReminder ? (
          <FormField
            type="number"
            min={1}
            value={leadHours}
            onValueChange={(v) => setLeadHours(Math.max(0, Number(v)))}
            className="w-32"
            controlClassName="h-9"
          />
        ) : (
          <FormField
            type="number"
            min={0}
            value={delayMinutes}
            onValueChange={(v) => setDelayMinutes(Math.max(0, Number(v)))}
            className="w-32"
            controlClassName="h-9"
          />
        )}
      </div>

      {/* Preview */}
      {template && (
        <WhatsappPreview
          headerText={template.headerText}
          bodyText={template.bodyText}
          variables={previewVariables}
          footerText={template.footerText}
          buttons={template.buttons}
        />
      )}

      {msg && <p className={`text-xs ${msg.ok ? "text-green-600" : "text-red-600"}`}>{msg.text}</p>}

      <div className="flex items-center gap-2">
        <Button size="sm" onClick={handleSave} loading={saving} disabled={!template}>
          {!saving && <Save />}
          حفظ
        </Button>
        {initial && (
          <Button
            variant="ghost-destructive"
            size="sm"
            onClick={handleDelete}
            disabled={saving}
            className="[&_svg]:size-3"
          >
            <Trash2 />
            إلغاء الربط
          </Button>
        )}
      </div>
    </div>
  );
}
