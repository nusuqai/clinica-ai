"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useForm, useWatch, type Control } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  BellRing,
  Loader2,
  MessageSquareHeart,
  CalendarClock,
  Save,
  Syringe,
  HeartHandshake,
  Trash2,
} from "lucide-react";
import type { AppointmentTemplatePurpose } from "@prisma/client";
import { listTemplatesAction } from "@/server/actions/whatsapp";
import {
  deleteAppointmentTemplateBindingAction,
  getAppointmentTemplateBindingsAction,
  saveAppointmentTemplateBindingAction,
  saveCustomAppointmentTemplateAction,
  type AppointmentTemplateBinding,
} from "@/server/actions/appointment-templates";
import type { MessageTemplate } from "@/lib/meta/whatsapp";
import {
  APPOINTMENT_TOKENS,
  APPOINTMENT_TOKEN_LABELS,
  CUSTOM_TEMPLATE_MAX_LENGTH,
  fillCustomTemplate,
  isCustomTemplate,
} from "@/lib/appointment-templates";
import { languageLabel } from "./languages";
import WhatsappPreview from "./whatsapp-preview";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useConfirm } from "@/components/ui/confirm-dialog";

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
  {
    purpose: "OPERATION_REMINDER",
    title: "تذكير بموعد العملية",
    hint: "يُرسَل قبل موعد العملية المحدد. استخدم «اسم العملية» و«مكان العملية» و«تاريخ/وقت الموعد» (تاريخ ووقت العملية).",
    icon: <Syringe className="h-4 w-4 text-accent" />,
  },
  {
    purpose: "OPERATION_FOLLOWUP",
    title: "الاطمئنان بعد العملية",
    hint: "يُرسَل بعد تعليم العملية «تمت» للاطمئنان على المريض؛ ردّه يصل لصندوق الرسائل والمساعد الذكي.",
    icon: <HeartHandshake className="h-4 w-4 text-accent" />,
  },
];

/**
 * Appointment automation settings. Official (Meta) clinics bind each purpose to
 * an approved template; Evolution (WhatsApp Web) clinics have no templates to
 * approve, so they write each message themselves with named fields.
 */
export default function AppointmentAutomation({
  provider,
}: {
  /** The clinic's WhatsApp connection, or null when none is set up. */
  provider: "META_CLOUD" | "EVOLUTION" | null;
}) {
  const configured = provider !== null;
  const isEvolution = provider === "EVOLUTION";
  const [templates, setTemplates] = useState<MessageTemplate[]>([]);
  const [bindings, setBindings] = useState<AppointmentTemplateBinding[]>([]);
  const [loading, setLoading] = useState(configured);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!configured) return;
    setLoading(true);
    setError(null);
    const [tRes, bRes] = await Promise.all([
      // Evolution has no Meta templates to list.
      isEvolution ? Promise.resolve(null) : listTemplatesAction(),
      getAppointmentTemplateBindingsAction(),
    ]);
    setLoading(false);
    if (tRes) {
      if (tRes.ok) setTemplates(tRes.templates.filter((t) => t.status === "APPROVED"));
      else setError(("message" in tRes && tRes.message) || "تعذّر تحميل القوالب.");
    }
    if (bRes.ok) setBindings(bRes.bindings);
  }, [configured, isEvolution]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!configured) {
    return (
      <Card className="p-5">
        <p className="text-xs text-muted-foreground">
          لم يُفعّل اتصال واتساب لهذه العيادة بعد. اربط رقم عيادتك من صفحة «اتصال واتساب»، أو تواصل
          مع فريق دعم Clinica للربط الرسمي، ثم يمكنك إعداد رسائل التذكير والتقييم من هنا.
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-5">
      <p className="text-xs leading-relaxed text-muted-foreground">
        {isEvolution
          ? "اكتب نص كل رسالة بنفسك وأدرج بيانات الموعد من الحقول المتاحة — لا تحتاج رسائل واتساب ويب إلى اعتماد من ميتا. لن تُرسَل الرسائل التلقائية لنوعٍ ما إلا بعد حفظ نص مُفعّل له."
          : "اربط كل نوع رسالة بأحد قوالبك المعتمدة، وحدِّد أي بيانات الموعد تملأ كل متغيّر في القالب. لن تُرسَل الرسائل التلقائية لنوعٍ ما إلا بعد ربط قالب مُفعّل له."}
      </p>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> جارٍ التحميل...
        </div>
      ) : error ? (
        <p className="text-xs text-red-600">{error}</p>
      ) : (
        PURPOSES.map((p) => {
          const initial = bindings.find((b) => b.purpose === p.purpose) ?? null;
          return isEvolution ? (
            <CustomBindingCard
              key={p.purpose}
              meta={p}
              // A leftover Meta binding (from before switching) isn't editable
              // text — start that purpose blank.
              initial={initial && isCustomTemplate(initial.templateName) ? initial : null}
              onSaved={load}
            />
          ) : (
            <BindingCard
              key={p.purpose}
              meta={p}
              templates={templates}
              initial={initial && !isCustomTemplate(initial.templateName) ? initial : null}
              onSaved={load}
            />
          );
        })
      )}
    </div>
  );
}

/** Timing is edited in DAYS before (follow-up), HOURS before (confirm
 *  reminder), or MINUTES after completion (feedback). */
function initialTiming(
  purpose: AppointmentTemplatePurpose,
  initial: AppointmentTemplateBinding | null
): number {
  if (purpose === "FOLLOWUP_REMINDER") {
    return initial ? Math.max(1, Math.round(initial.leadMinutes / 1440)) : 3;
  }
  if (purpose === "CONFIRM_REMINDER" || purpose === "OPERATION_REMINDER") {
    return initial ? Math.round(initial.leadMinutes / 60) : 24;
  }
  if (purpose === "OPERATION_FOLLOWUP") {
    return initial ? Math.max(1, Math.round(initial.delayMinutes / 60)) : 24;
  }
  return initial?.delayMinutes ?? 120;
}

/** The lead/delay fields to save for an edited timing value. */
function timingToMinutes(purpose: AppointmentTemplatePurpose, timing: number) {
  if (purpose === "FOLLOWUP_REMINDER") return { leadMinutes: timing * 1440 };
  if (purpose === "CONFIRM_REMINDER" || purpose === "OPERATION_REMINDER")
    return { leadMinutes: timing * 60 };
  if (purpose === "OPERATION_FOLLOWUP") return { delayMinutes: timing * 60 };
  return { delayMinutes: timing };
}

function timingLabel(purpose: AppointmentTemplatePurpose): string {
  if (purpose === "FOLLOWUP_REMINDER") return "يُرسَل قبل موعد المتابعة بـ (أيام)";
  if (purpose === "CONFIRM_REMINDER") return "يُرسَل قبل الموعد بـ (ساعات)";
  if (purpose === "OPERATION_REMINDER") return "يُرسَل قبل العملية بـ (ساعات)";
  if (purpose === "OPERATION_FOLLOWUP") return "يُرسَل بعد تعليم العملية «تمت» بـ (ساعات)";
  return "يُرسَل بعد اكتمال الزيارة بـ (دقائق)";
}

function templateKey(name: string, language: string) {
  return `${name}__${language}`;
}

/** Timing is hours (confirm reminder), days (follow-up) or minutes (feedback) depending on purpose. */
function bindingSchema(minTiming: number) {
  return z.object({
    templateKey: z.string().min(1, "اختر قالباً معتمداً."),
    variableMap: z.array(z.string()),
    enabled: z.boolean(),
    timing: z.coerce
      .number({ message: "أدخل رقماً." })
      .int("أدخل عدداً صحيحاً.")
      .min(minTiming, minTiming > 0 ? `${minTiming} على الأقل.` : "لا يمكن أن يكون سالباً."),
  });
}
type BindingSchema = ReturnType<typeof bindingSchema>;
type BindingInput = z.input<BindingSchema>;
type BindingValues = z.output<BindingSchema>;
type BindingControl = Control<BindingInput, unknown, BindingValues>;

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
  // Everything but the feedback request needs a timing of at least 1.
  const isFollowUp = meta.purpose !== "FEEDBACK_REQUEST" && !isReminder;
  const [deleting, setDeleting] = useState(false);
  const confirm = useConfirm();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const timing0 = initialTiming(meta.purpose, initial);

  const empty: BindingInput = {
    templateKey: "",
    variableMap: [],
    enabled: true,
    timing: timing0,
  };
  const form = useForm<BindingInput, unknown, BindingValues>({
    resolver: zodResolver(bindingSchema(isReminder || isFollowUp ? 1 : 0)),
    defaultValues: {
      templateKey: initial ? templateKey(initial.templateName, initial.languageCode) : "",
      variableMap: initial?.variableMap ?? [],
      enabled: initial?.enabled ?? true,
      timing: timing0,
    },
  });
  const { control } = form;
  const saving = form.formState.isSubmitting || deleting;

  const findTemplate = (key: string) =>
    templates.find((t) => templateKey(t.name, t.language) === key) ?? null;

  // When the chosen template changes, resize the variable map to its placeholder
  // count, preserving prior selections where possible.
  const onSelectTemplate = (key: string) => {
    const count = findTemplate(key)?.variableCount ?? 0;
    const prev = form.getValues("variableMap");
    form.setValue(
      "variableMap",
      Array.from({ length: count }, (_, i) => prev[i] ?? TOKEN_OPTIONS[0].value)
    );
    setMsg(null);
  };

  const handleSave = form.handleSubmit(
    async ({ templateKey: key, variableMap, enabled, timing }) => {
      const template = findTemplate(key);
      if (!template) return;
      setMsg(null);
      const res = await saveAppointmentTemplateBindingAction({
        purpose: meta.purpose,
        templateName: template.name,
        languageCode: template.language,
        variableMap,
        enabled,
        ...timingToMinutes(meta.purpose, timing),
      });
      if (res.ok) {
        setMsg({ ok: true, text: "تم الحفظ." });
        onSaved();
      } else {
        setMsg({ ok: false, text: ("message" in res && res.message) || "تعذّر الحفظ." });
      }
    }
  );

  const handleDelete = async () => {
    const unbound = await confirm({
      title: "إلغاء ربط القالب",
      description: <>هل تريد إيقاف «{meta.title}» وإلغاء ربط القالب الخاص به؟</>,
      warning: "لن تُرسل هذه الرسائل للمرضى حتى تربط قالباً من جديد.",
      confirmText: "إلغاء الربط",
      cancelText: "تراجع",
      onConfirm: async () => {
        setDeleting(true);
        try {
          const res = await deleteAppointmentTemplateBindingAction(meta.purpose);
          if (!res.ok) return { error: res.message || "تعذّر إلغاء الربط." };
        } finally {
          setDeleting(false);
        }
      },
    });
    if (!unbound) return;
    form.reset(empty);
    setMsg(null);
    onSaved();
  };

  return (
    <Card asChild className="space-y-4 p-5">
      <form onSubmit={handleSave} noValidate>
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
            control={control}
            name="enabled"
            type="switch"
            label="مُفعّل"
            labelClassName="text-xs font-normal text-muted-foreground"
            className="shrink-0"
          />
        </div>

        {/* Template picker */}
        <div className="space-y-1.5">
          <FormField
            control={control}
            name="templateKey"
            type="select"
            label="القالب المعتمد"
            labelClassName="text-xs"
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

        <TemplateDetails control={control} findTemplate={findTemplate}>
          {/* Timing */}
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-foreground">
              {timingLabel(meta.purpose)}
            </Label>
            <FormField
              control={control}
              name="timing"
              type="number"
              min={isFollowUp || isReminder ? 1 : 0}
              className="w-32"
              controlClassName="h-9"
            />
          </div>
        </TemplateDetails>

        {msg && (
          <p className={`text-xs ${msg.ok ? "text-green-600" : "text-red-600"}`}>{msg.text}</p>
        )}

        <div className="flex items-center gap-2">
          <Button type="submit" size="sm" loading={form.formState.isSubmitting} disabled={deleting}>
            {!form.formState.isSubmitting && <Save />}
            حفظ
          </Button>
          {initial && (
            <Button
              type="button"
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
      </form>
    </Card>
  );
}

/**
 * Variable mapping, then `children` (the timing field), then the preview — the
 * parts that depend on the chosen template, so only they re-render when it changes.
 */
function TemplateDetails({
  control,
  findTemplate,
  children,
}: {
  control: BindingControl;
  findTemplate: (key: string) => MessageTemplate | null;
  children: React.ReactNode;
}) {
  const [key, variableMap] = useWatch({ control, name: ["templateKey", "variableMap"] });
  const template = findTemplate(key);
  const previewVariables = variableMap.map(
    (t) => `[${APPOINTMENT_TOKEN_LABELS[t as keyof typeof APPOINTMENT_TOKEN_LABELS] ?? t}]`
  );

  return (
    <>
      {/* Variable mapping */}
      {template && template.variableCount > 0 && (
        <div className="space-y-2">
          <Label className="text-xs font-medium text-foreground">
            ربط متغيّرات القالب ({template.variableCount})
          </Label>
          {variableMap.map((_, i) => (
            <div key={i} className="flex items-center gap-2">
              <span className="w-12 shrink-0 text-xs text-muted-foreground">{`{{${i + 1}}}`}</span>
              <FormField
                control={control}
                name={`variableMap.${i}`}
                type="select"
                options={TOKEN_OPTIONS}
                className="flex-1"
                controlClassName="h-9"
              />
            </div>
          ))}
        </div>
      )}

      {children}

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
    </>
  );
}

/** Starter text per purpose, so an Evolution clinic isn't facing a blank box. */
const CUSTOM_DEFAULTS: Record<AppointmentTemplatePurpose, string> = {
  CONFIRM_REMINDER:
    "مرحباً {{patient_name}} 👋\nنذكّرك بموعدك في {{clinic_name}} مع د. {{doctor_name}} يوم {{appointment_date}} الساعة {{appointment_time}}.\nبرجاء الرد بـ «تأكيد» أو «إلغاء».",
  FEEDBACK_REQUEST:
    "شكراً لزيارتك {{clinic_name}} يا {{patient_name}} 🌷\nيسعدنا معرفة رأيك في الخدمة — ما تقييمك من 1 إلى 5؟",
  FOLLOWUP_REMINDER:
    "مرحباً {{patient_name}} 👋\nحان موعد متابعتك مع د. {{doctor_name}} في {{clinic_name}} ({{appointment_date}}).\nرد على هذه الرسالة لحجز موعدك.",
  OPERATION_REMINDER:
    "مرحباً {{patient_name}} 👋\nنذكّرك بموعد عمليتك ({{operation_name}}) مع د. {{doctor_name}} يوم {{appointment_date}} الساعة {{appointment_time}} في {{operation_location}}.\nبرجاء الالتزام بتعليمات ما قبل العملية، ولأي استفسار رد على هذه الرسالة.",
  OPERATION_FOLLOWUP:
    "مرحباً {{patient_name}} 🌷\nنتمنى لك السلامة بعد عملية {{operation_name}}. كيف حالك اليوم؟\nإن شعرت بأي ألم شديد أو أعراض مقلقة رد على هذه الرسالة وسيتواصل معك فريق {{clinic_name}}.",
};

/**
 * Evolution (WhatsApp Web) version of a binding: the clinic writes the message
 * itself, inserting named fields like {{patient_name}} that the sender fills
 * from the appointment. No approval, no buttons — the patient's reply reaches
 * the inbox and the AI agent like any other message.
 */
function CustomBindingCard({
  meta,
  initial,
  onSaved,
}: {
  meta: PurposeMeta;
  initial: AppointmentTemplateBinding | null;
  onSaved: () => void;
}) {
  const [body, setBody] = useState(initial?.bodyText || CUSTOM_DEFAULTS[meta.purpose]);
  const [enabled, setEnabled] = useState(initial?.enabled ?? true);
  const [timing, setTiming] = useState(String(initialTiming(meta.purpose, initial)));
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const confirm = useConfirm();
  const minTiming = meta.purpose === "FEEDBACK_REQUEST" ? 0 : 1;

  /** Inserts {{token}} at the cursor (or appends), keeping focus in the box. */
  const insertToken = (token: string) => {
    const el = textareaRef.current;
    const tag = `{{${token}}}`;
    const start = el?.selectionStart ?? body.length;
    const end = el?.selectionEnd ?? body.length;
    setBody(body.slice(0, start) + tag + body.slice(end));
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(start + tag.length, start + tag.length);
    });
  };

  const save = async () => {
    const n = Number(timing);
    if (!Number.isInteger(n) || n < minTiming) {
      setMsg({ ok: false, text: minTiming > 0 ? `${minTiming} على الأقل.` : "أدخل عدداً صحيحاً." });
      return;
    }
    setSaving(true);
    setMsg(null);
    const res = await saveCustomAppointmentTemplateAction({
      purpose: meta.purpose,
      bodyText: body,
      enabled,
      ...timingToMinutes(meta.purpose, n),
    });
    setSaving(false);
    if (res.ok) {
      setMsg({ ok: true, text: "تم الحفظ." });
      onSaved();
    } else {
      setMsg({ ok: false, text: ("message" in res && res.message) || "تعذّر الحفظ." });
    }
  };

  const remove = async () => {
    const removed = await confirm({
      title: "حذف الرسالة",
      description: <>هل تريد إيقاف «{meta.title}» وحذف نص الرسالة؟</>,
      warning: "لن تُرسل هذه الرسائل للمرضى حتى تحفظ نصاً من جديد.",
      confirmText: "حذف",
      cancelText: "تراجع",
      onConfirm: async () => {
        const res = await deleteAppointmentTemplateBindingAction(meta.purpose);
        if (!res.ok) return { error: res.message || "تعذّر الحذف." };
      },
    });
    if (!removed) return;
    setBody(CUSTOM_DEFAULTS[meta.purpose]);
    setMsg(null);
    onSaved();
  };

  const preview = fillCustomTemplate(body, (t) => `[${APPOINTMENT_TOKEN_LABELS[t]}]`);

  return (
    <Card className="space-y-4 p-5">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          {meta.icon}
          <div>
            <h2 className="text-sm font-semibold text-foreground">{meta.title}</h2>
            <p className="mt-0.5 max-w-md text-[11px] leading-relaxed text-muted-foreground">
              {meta.purpose === "CONFIRM_REMINDER"
                ? "يُرسَل قبل الموعد ليؤكّد المريض حجزه. اطلب منه الرد بـ «تأكيد» أو «إلغاء» — يصل رده للمساعد الذكي وصندوق الرسائل."
                : meta.hint}
            </p>
          </div>
        </div>
        <label className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
          مُفعّل
          <Switch checked={enabled} onCheckedChange={setEnabled} />
        </label>
      </div>

      <div className="space-y-2">
        <Label className="text-xs font-medium text-foreground">نص الرسالة</Label>
        <Textarea
          ref={textareaRef}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={5}
          maxLength={CUSTOM_TEMPLATE_MAX_LENGTH}
        />
        <div className="flex flex-wrap gap-1.5">
          {TOKEN_OPTIONS.map((t) => (
            <button
              key={t.value}
              type="button"
              onClick={() => insertToken(t.value)}
              className="rounded-full border border-border px-2.5 py-1 text-[11px] text-muted-foreground hover:border-accent hover:text-foreground"
            >
              + {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs font-medium text-foreground">{timingLabel(meta.purpose)}</Label>
        <Input
          type="number"
          min={minTiming}
          value={timing}
          onChange={(e) => setTiming(e.target.value)}
          className="h-9 w-32"
          dir="ltr"
        />
      </div>

      {body.trim() && <WhatsappPreview bodyText={preview} />}

      {msg && <p className={`text-xs ${msg.ok ? "text-green-600" : "text-red-600"}`}>{msg.text}</p>}

      <div className="flex items-center gap-2">
        <Button type="button" size="sm" onClick={save} loading={saving}>
          {!saving && <Save />}
          حفظ
        </Button>
        {initial && (
          <Button
            type="button"
            variant="ghost-destructive"
            size="sm"
            onClick={remove}
            disabled={saving}
            className="[&_svg]:size-3"
          >
            <Trash2 />
            حذف
          </Button>
        )}
      </div>
    </Card>
  );
}
