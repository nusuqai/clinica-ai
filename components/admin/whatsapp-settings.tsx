"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Loader2,
  Save,
  Plus,
  Trash2,
  Send,
  CheckCircle2,
  Clock,
  XCircle,
  FileText,
  KeyRound,
  Copy,
  Check,
} from "lucide-react";
import {
  saveWhatsappConfigAction,
  listTemplatesAction,
  createTemplateAction,
  deleteTemplateAction,
  sendTemplateToNumberAction,
} from "@/server/actions/whatsapp";
import { fillTemplate } from "@/components/admin/whatsapp-template-picker";
import type { WhatsappConfigStatus } from "@/lib/meta/whatsapp-config";
import type {
  MessageTemplate,
  TemplateCategory,
} from "@/lib/meta/whatsapp";

interface Props {
  initialConfig: WhatsappConfigStatus | null;
  /** Public base URL, used to build the clinic's unique webhook URL. */
  appUrl: string;
}

const CATEGORIES: { value: TemplateCategory; label: string }[] = [
  { value: "UTILITY", label: "خدمية (Utility)" },
  { value: "MARKETING", label: "تسويقية (Marketing)" },
  { value: "AUTHENTICATION", label: "مصادقة (Authentication)" },
];

/** Number of `{{n}}` placeholders in a body. */
function countVariables(body: string): number {
  return (body.match(/\{\{\s*\d+\s*\}\}/g) ?? []).length;
}

export default function WhatsappSettings({ initialConfig, appUrl }: Props) {
  const configured = !!initialConfig;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <ConnectionConfig initialConfig={initialConfig} appUrl={appUrl} />
      <div className="space-y-6">
        <CreateTemplate disabled={!configured} />
        <TemplatesList disabled={!configured} />
      </div>
    </div>
  );
}

// ─── Connection config ───────────────────────────────────────────────────────

function ConnectionConfig({
  initialConfig,
  appUrl,
}: {
  initialConfig: WhatsappConfigStatus | null;
  appUrl: string;
}) {
  const [phoneNumberId, setPhoneNumberId] = useState(
    initialConfig?.phoneNumberId ?? "",
  );
  const [wabaId, setWabaId] = useState(initialConfig?.wabaId ?? "");
  const [accessToken, setAccessToken] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(
    null,
  );
  // The webhook + verify tokens the clinic must paste into Meta. Known once the
  // config exists (either loaded, or returned by the first save).
  const [tokens, setTokens] = useState<{
    webhookToken: string;
    verifyToken: string;
  } | null>(
    initialConfig
      ? {
          webhookToken: initialConfig.webhookToken,
          verifyToken: initialConfig.verifyToken,
        }
      : null,
  );

  const handleSave = async () => {
    setSaving(true);
    setMessage(null);
    const res = await saveWhatsappConfigAction({
      phoneNumberId,
      wabaId,
      accessToken: accessToken || undefined,
    });
    setSaving(false);
    if (res.ok) {
      setAccessToken("");
      setTokens({ webhookToken: res.webhookToken, verifyToken: res.verifyToken });
      setMessage({ ok: true, text: "تم حفظ الإعدادات بنجاح." });
    } else {
      setMessage({
        ok: false,
        text: ("message" in res && res.message) || "تعذّر حفظ الإعدادات.",
      });
    }
  };

  const webhookUrl = tokens
    ? `${appUrl}/api/meta/whatsapp/webhook/${tokens.webhookToken}`
    : "";

  return (
    <div>
      <h2 className="text-sm font-semibold text-foreground font-sans mb-3 flex items-center gap-2">
        <KeyRound className="w-4 h-4 text-accent" />
        بيانات الاتصال (Meta Cloud API)
      </h2>
      <div className="bg-card border border-border rounded-2xl p-5 space-y-4">
        <Field
          label="Phone Number ID"
          value={phoneNumberId}
          onChange={setPhoneNumberId}
          placeholder="مثال: 1286383577882071"
        />
        <Field
          label="WhatsApp Business Account ID (WABA)"
          value={wabaId}
          onChange={setWabaId}
          placeholder="مثال: 2292332154910536"
        />
        <div>
          <label className="block text-xs text-muted-foreground mb-1 font-sans">
            Access Token (System User)
            {initialConfig?.hasToken && (
              <span className="text-green-600"> — تم حفظ رمز، اتركه فارغًا للإبقاء عليه</span>
            )}
          </label>
          <input
            type="password"
            value={accessToken}
            onChange={(e) => setAccessToken(e.target.value)}
            placeholder={initialConfig?.hasToken ? "••••••••••••" : "الصق الرمز هنا"}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-accent"
            dir="ltr"
          />
        </div>

        {message && (
          <p
            className={`text-xs ${message.ok ? "text-green-600" : "text-red-600"}`}
          >
            {message.text}
          </p>
        )}

        <button
          onClick={handleSave}
          disabled={saving || !phoneNumberId.trim() || !wabaId.trim()}
          className="inline-flex items-center gap-2 rounded-xl bg-primary text-white px-4 py-2 text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-40"
        >
          {saving ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Save className="w-4 h-4" />
          )}
          حفظ
        </button>

        {tokens && (
          <div className="mt-2 space-y-3 border-t border-border pt-4">
            <p className="text-xs text-muted-foreground font-sans">
              انسخ هذين القيمتين والصقهما في إعداد الويبهوك داخل تطبيق ميتا الخاص
              بالعيادة (اشترك في حقل <span dir="ltr">messages</span>). حافظ على
              سرية رابط الويبهوك.
            </p>
            <CopyRow label="Callback URL" value={webhookUrl} />
            <CopyRow label="Verify Token" value={tokens.verifyToken} />
          </div>
        )}
      </div>
    </div>
  );
}

function CopyRow({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked — the value is still selectable in the field */
    }
  };
  return (
    <div>
      <label className="block text-xs text-muted-foreground mb-1 font-sans">
        {label}
      </label>
      <div className="flex items-stretch gap-2">
        <input
          readOnly
          value={value}
          onFocus={(e) => e.currentTarget.select()}
          className="flex-1 rounded-lg border border-border bg-muted px-3 py-2 text-xs focus:outline-none"
          dir="ltr"
        />
        <button
          onClick={copy}
          className="flex-shrink-0 inline-flex items-center gap-1 rounded-lg border border-border px-2.5 text-xs text-muted-foreground hover:bg-muted"
        >
          {copied ? <Check className="w-3.5 h-3.5 text-green-600" /> : <Copy className="w-3.5 h-3.5" />}
          {copied ? "تم" : "نسخ"}
        </button>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div>
      <label className="block text-xs text-muted-foreground mb-1 font-sans">
        {label}
      </label>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-accent"
        dir="ltr"
      />
    </div>
  );
}

// ─── Create template ─────────────────────────────────────────────────────────

function CreateTemplate({ disabled }: { disabled: boolean }) {
  const [name, setName] = useState("");
  const [category, setCategory] = useState<TemplateCategory>("UTILITY");
  const [language, setLanguage] = useState("ar");
  const [bodyText, setBodyText] = useState("");
  const [footerText, setFooterText] = useState("");
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

  const handleSubmit = async () => {
    setSubmitting(true);
    setMessage(null);
    const res = await createTemplateAction({
      name,
      category,
      language,
      bodyText,
      footerText: footerText || undefined,
      bodyExamples: examples.length > 0 ? examples : undefined,
    });
    setSubmitting(false);
    if (res.ok) {
      setMessage({
        ok: true,
        text: `تم إرسال القالب إلى ميتا للمراجعة (الحالة: ${res.status}).`,
      });
      setName("");
      setBodyText("");
      setFooterText("");
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
      <div className="bg-card border border-border rounded-2xl p-5 space-y-4">
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
          <Field label="اللغة" value={language} onChange={setLanguage} placeholder="ar / en_US" />
        </div>
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
            <p className="text-xs text-muted-foreground">قيم توضيحية للمتغيرات (يطلبها ميتا للمراجعة)</p>
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
        <Field label="تذييل اختياري" value={footerText} onChange={setFooterText} placeholder="عيادة النور" />

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
    </div>
  );
}

// ─── Templates list ──────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { cls: string; icon: React.ReactNode; label: string }> = {
    APPROVED: { cls: "bg-green-100 text-green-700", icon: <CheckCircle2 className="w-3 h-3" />, label: "معتمد" },
    PENDING: { cls: "bg-amber-100 text-amber-700", icon: <Clock className="w-3 h-3" />, label: "قيد المراجعة" },
    REJECTED: { cls: "bg-red-100 text-red-700", icon: <XCircle className="w-3 h-3" />, label: "مرفوض" },
  };
  const m = map[status] ?? { cls: "bg-muted text-muted-foreground", icon: null, label: status };
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full ${m.cls}`}>
      {m.icon}
      {m.label}
    </span>
  );
}

function TemplatesList({ disabled }: { disabled: boolean }) {
  const [templates, setTemplates] = useState<MessageTemplate[]>([]);
  const [loading, setLoading] = useState(!disabled);
  const [error, setError] = useState<string | null>(null);
  const [sendFor, setSendFor] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (disabled) return;
    setLoading(true);
    setError(null);
    const res = await listTemplatesAction();
    setLoading(false);
    if (res.ok) setTemplates(res.templates);
    else setError(("message" in res && res.message) || "تعذّر تحميل القوالب.");
  }, [disabled]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleDelete = async (name: string) => {
    const res = await deleteTemplateAction(name);
    if (res.ok) void load();
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-foreground font-sans flex items-center gap-2">
          <FileText className="w-4 h-4 text-accent" />
          القوالب
        </h2>
        {!disabled && (
          <button onClick={() => void load()} className="text-xs text-accent hover:underline">
            تحديث
          </button>
        )}
      </div>
      <div className="bg-card border border-border rounded-2xl p-5 space-y-3">
        {disabled ? (
          <p className="text-xs text-muted-foreground">أدخل بيانات الاتصال لعرض القوالب.</p>
        ) : loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" /> جارٍ التحميل...
          </div>
        ) : error ? (
          <p className="text-xs text-red-600">{error}</p>
        ) : templates.length === 0 ? (
          <p className="text-xs text-muted-foreground">لا توجد قوالب بعد.</p>
        ) : (
          templates.map((t) => (
            <div key={t.id} className="rounded-xl border border-border px-3.5 py-3">
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-medium text-foreground">{t.name}</span>
                <div className="flex items-center gap-2">
                  <StatusBadge status={t.status} />
                  <button
                    onClick={() => handleDelete(t.name)}
                    className="text-muted-foreground hover:text-red-600"
                    aria-label="حذف"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
              <p className="text-[10px] text-muted-foreground mb-1 uppercase">
                {t.category} · {t.language}
              </p>
              <p className="text-xs text-muted-foreground whitespace-pre-wrap">{t.bodyText}</p>

              {t.status === "APPROVED" && (
                <div className="mt-2">
                  {sendFor === t.id ? (
                    <SendToNumber template={t} onDone={() => setSendFor(null)} />
                  ) : (
                    <button
                      onClick={() => setSendFor(t.id)}
                      className="inline-flex items-center gap-1.5 text-xs text-accent hover:underline"
                    >
                      <Send className="w-3 h-3" />
                      إرسال إلى رقم
                    </button>
                  )}
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function SendToNumber({
  template,
  onDone,
}: {
  template: MessageTemplate;
  onDone: () => void;
}) {
  const [phone, setPhone] = useState("");
  const [variables, setVariables] = useState<string[]>(
    Array.from({ length: template.variableCount }, () => ""),
  );
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const handleSend = async () => {
    setSending(true);
    setMessage(null);
    const res = await sendTemplateToNumberAction({
      phone,
      name: template.name,
      language: template.language,
      variables,
    });
    setSending(false);
    if (res.ok) {
      setMessage({ ok: true, text: "تم الإرسال." });
      setTimeout(onDone, 1200);
    } else {
      setMessage({
        ok: false,
        text: ("message" in res && res.message) || "تعذّر الإرسال.",
      });
    }
  };

  return (
    <div className="mt-2 space-y-2 rounded-lg bg-muted/40 p-3">
      <input
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
        placeholder="رقم الهاتف مع رمز الدولة، أرقام فقط"
        className="w-full rounded-lg border border-border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-accent"
        dir="ltr"
      />
      {variables.map((v, i) => (
        <input
          key={i}
          value={v}
          onChange={(e) =>
            setVariables((prev) => prev.map((x, j) => (j === i ? e.target.value : x)))
          }
          placeholder={`القيمة ${i + 1} ({{${i + 1}}})`}
          className="w-full rounded-lg border border-border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-accent"
        />
      ))}
      <div className="rounded-lg bg-background px-3 py-1.5 text-xs text-muted-foreground whitespace-pre-wrap">
        {fillTemplate(template.bodyText, variables)}
      </div>
      {message && (
        <p className={`text-xs ${message.ok ? "text-green-600" : "text-red-600"}`}>
          {message.text}
        </p>
      )}
      <div className="flex items-center gap-2">
        <button
          onClick={handleSend}
          disabled={sending || !phone.trim() || variables.some((v) => !v.trim())}
          className="inline-flex items-center gap-1.5 rounded-lg bg-primary text-white px-3 py-1.5 text-xs font-medium hover:bg-primary/90 disabled:opacity-40"
        >
          {sending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
          إرسال
        </button>
        <button onClick={onDone} className="text-xs text-muted-foreground hover:underline">
          إلغاء
        </button>
      </div>
    </div>
  );
}
