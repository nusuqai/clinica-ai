"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Loader2,
  Trash2,
  Send,
  CheckCircle2,
  Clock,
  XCircle,
  FileText,
  Search,
} from "lucide-react";
import {
  listTemplatesAction,
  deleteTemplateAction,
  sendTemplateToNumberAction,
} from "@/server/actions/whatsapp";
import type { MessageTemplate } from "@/lib/meta/whatsapp";
import { languageLabel } from "./languages";
import WhatsappPreview from "./whatsapp-preview";

function StatusBadge({ status }: { status: string }) {
  const map: Record<
    string,
    { cls: string; icon: React.ReactNode; label: string }
  > = {
    APPROVED: {
      cls: "bg-green-100 text-green-700",
      icon: <CheckCircle2 className="w-3 h-3" />,
      label: "معتمد",
    },
    PENDING: {
      cls: "bg-amber-100 text-amber-700",
      icon: <Clock className="w-3 h-3" />,
      label: "قيد المراجعة",
    },
    REJECTED: {
      cls: "bg-red-100 text-red-700",
      icon: <XCircle className="w-3 h-3" />,
      label: "مرفوض",
    },
  };
  const m = map[status] ?? {
    cls: "bg-muted text-muted-foreground",
    icon: null,
    label: status,
  };
  return (
    <span
      className={`inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full ${m.cls}`}
    >
      {m.icon}
      {m.label}
    </span>
  );
}

const ALL = "__all__";

export default function TemplatesList({ disabled }: { disabled: boolean }) {
  const [templates, setTemplates] = useState<MessageTemplate[]>([]);
  const [loading, setLoading] = useState(!disabled);
  const [error, setError] = useState<string | null>(null);
  const [sendFor, setSendFor] = useState<string | null>(null);

  // Filters (all client-side over the loaded list).
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<string>(ALL);
  const [category, setCategory] = useState<string>(ALL);
  const [language, setLanguage] = useState<string>(ALL);

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

  // Option sets derived from what actually loaded.
  const statuses = useMemo(
    () => Array.from(new Set(templates.map((t) => t.status))).sort(),
    [templates],
  );
  const categories = useMemo(
    () =>
      Array.from(new Set(templates.map((t) => t.category)))
        .filter(Boolean)
        .sort(),
    [templates],
  );
  const languages = useMemo(
    () =>
      Array.from(new Set(templates.map((t) => t.language)))
        .filter(Boolean)
        .sort(),
    [templates],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return templates.filter((t) => {
      if (status !== ALL && t.status !== status) return false;
      if (category !== ALL && t.category !== category) return false;
      if (language !== ALL && t.language !== language) return false;
      if (q && !`${t.name} ${t.bodyText}`.toLowerCase().includes(q))
        return false;
      return true;
    });
  }, [templates, search, status, category, language]);

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-foreground font-sans flex items-center gap-2">
          <FileText className="w-4 h-4 text-accent" />
          القوالب
        </h2>
        {!disabled && (
          <button
            onClick={() => void load()}
            className="text-xs text-accent hover:underline"
          >
            تحديث
          </button>
        )}
      </div>
      <div className="bg-card border border-border rounded-2xl p-5 space-y-4">
        {disabled ? (
          <p className="text-xs text-muted-foreground">
            أدخل بيانات الاتصال لعرض القوالب.
          </p>
        ) : loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" /> جارٍ التحميل...
          </div>
        ) : error ? (
          <p className="text-xs text-red-600">{error}</p>
        ) : templates.length === 0 ? (
          <p className="text-xs text-muted-foreground">لا توجد قوالب بعد.</p>
        ) : (
          <>
            {/* Filter bar */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
              <div className="relative sm:col-span-2 lg:col-span-1">
                <Search className="w-3.5 h-3.5 text-muted-foreground absolute top-1/2 -translate-y-1/2 start-3" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="بحث بالاسم أو النص"
                  className="w-full rounded-lg border border-border bg-background ps-8 pe-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-accent"
                />
              </div>
              <FilterSelect
                value={status}
                onChange={setStatus}
                allLabel="كل الحالات"
                options={statuses.map((s) => ({ value: s, label: s }))}
              />
              <FilterSelect
                value={category}
                onChange={setCategory}
                allLabel="كل الفئات"
                options={categories.map((c) => ({ value: c, label: c }))}
              />
              <FilterSelect
                value={language}
                onChange={setLanguage}
                allLabel="كل اللغات"
                options={languages.map((l) => ({
                  value: l,
                  label: languageLabel(l),
                }))}
              />
            </div>

            {filtered.length === 0 ? (
              <p className="text-xs text-muted-foreground py-4 text-center">
                لا توجد قوالب مطابقة للفلاتر.
              </p>
            ) : (
              <div className="space-y-3">
                {filtered.map((t) => (
                  <div
                    key={t.id}
                    className="rounded-xl border border-border px-3.5 py-3"
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium text-foreground">
                        {t.name}
                      </span>
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
                    <p className="text-[10px] text-muted-foreground mb-2 uppercase">
                      {t.category} · {t.language}
                    </p>
                    <WhatsappPreview
                      headerText={t.headerText}
                      bodyText={t.bodyText}
                      footerText={t.footerText}
                      buttons={t.buttons}
                    />
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function FilterSelect({
  value,
  onChange,
  allLabel,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  allLabel: string;
  options: { value: string; label: string }[];
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-muted-foreground focus:outline-none focus:ring-1 focus:ring-accent"
    >
      <option value={ALL}>{allLabel}</option>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
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
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(
    null,
  );

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
            setVariables((prev) =>
              prev.map((x, j) => (j === i ? e.target.value : x)),
            )
          }
          placeholder={`القيمة ${i + 1} ({{${i + 1}}})`}
          className="w-full rounded-lg border border-border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-accent"
        />
      ))}
      <WhatsappPreview
        headerText={template.headerText}
        bodyText={template.bodyText}
        variables={variables}
        footerText={template.footerText}
        buttons={template.buttons}
      />
      {message && (
        <p
          className={`text-xs ${message.ok ? "text-green-600" : "text-red-600"}`}
        >
          {message.text}
        </p>
      )}
      <div className="flex items-center gap-2">
        <button
          onClick={handleSend}
          disabled={
            sending || !phone.trim() || variables.some((v) => !v.trim())
          }
          className="inline-flex items-center gap-1.5 rounded-lg bg-primary text-white px-3 py-1.5 text-xs font-medium hover:bg-primary/90 disabled:opacity-40"
        >
          {sending ? (
            <Loader2 className="w-3 h-3 animate-spin" />
          ) : (
            <Send className="w-3 h-3" />
          )}
          إرسال
        </button>
        <button
          onClick={onDone}
          className="text-xs text-muted-foreground hover:underline"
        >
          إلغاء
        </button>
      </div>
    </div>
  );
}
