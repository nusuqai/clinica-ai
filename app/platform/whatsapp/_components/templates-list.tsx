"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useForm, useWatch, type Control } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
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
  listClinicTemplatesAction,
  deleteClinicTemplateAction,
  sendClinicTemplateToNumberAction,
} from "@/server/actions/platformWhatsapp";
import type { MessageTemplate } from "@/lib/meta/whatsapp";
// These two stay under components/admin/whatsapp — the clinic-side reminders
// page and the inbox template picker share them.
import { languageLabel } from "@/components/admin/whatsapp/languages";
import WhatsappPreview from "@/components/admin/whatsapp/whatsapp-preview";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Card } from "@/components/ui/card";
import { sendTemplateSchema, type SendTemplateValues } from "@/lib/validations/platform";

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { cls: string; icon: React.ReactNode; label: string }> = {
    APPROVED: {
      cls: "bg-green-100 text-green-700",
      icon: <CheckCircle2 className="h-3 w-3" />,
      label: "معتمد",
    },
    PENDING: {
      cls: "bg-amber-100 text-amber-700",
      icon: <Clock className="h-3 w-3" />,
      label: "قيد المراجعة",
    },
    REJECTED: {
      cls: "bg-red-100 text-red-700",
      icon: <XCircle className="h-3 w-3" />,
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
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] ${m.cls}`}
    >
      {m.icon}
      {m.label}
    </span>
  );
}

const ALL = "__all__";

export default function TemplatesList({
  clinicId,
  disabled,
}: {
  clinicId: string;
  disabled: boolean;
}) {
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
    const res = await listClinicTemplatesAction({ clinicId });
    setLoading(false);
    if (res.ok) setTemplates(res.templates);
    else setError(("message" in res && res.message) || "تعذّر تحميل القوالب.");
  }, [clinicId, disabled]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleDelete = async (name: string) => {
    const res = await deleteClinicTemplateAction({ clinicId, name });
    if (res.ok) void load();
  };

  // Option sets derived from what actually loaded.
  const statuses = useMemo(
    () => Array.from(new Set(templates.map((t) => t.status))).sort(),
    [templates]
  );
  const categories = useMemo(
    () =>
      Array.from(new Set(templates.map((t) => t.category)))
        .filter(Boolean)
        .sort(),
    [templates]
  );
  const languages = useMemo(
    () =>
      Array.from(new Set(templates.map((t) => t.language)))
        .filter(Boolean)
        .sort(),
    [templates]
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return templates.filter((t) => {
      if (status !== ALL && t.status !== status) return false;
      if (category !== ALL && t.category !== category) return false;
      if (language !== ALL && t.language !== language) return false;
      if (q && !`${t.name} ${t.bodyText}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [templates, search, status, category, language]);

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="flex items-center gap-2 font-sans text-sm font-semibold text-foreground">
          <FileText className="h-4 w-4 text-accent" />
          القوالب
        </h2>
        {!disabled && (
          <Button
            variant="link"
            size="sm"
            onClick={() => void load()}
            className="h-auto px-0 text-accent"
          >
            تحديث
          </Button>
        )}
      </div>
      <Card className="space-y-4 p-5">
        {disabled ? (
          <p className="text-xs text-muted-foreground">أدخل بيانات الاتصال لعرض القوالب.</p>
        ) : loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> جارٍ التحميل...
          </div>
        ) : error ? (
          <p className="text-xs text-red-600">{error}</p>
        ) : templates.length === 0 ? (
          <p className="text-xs text-muted-foreground">لا توجد قوالب بعد.</p>
        ) : (
          <>
            {/* Filter bar */}
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
              <FormField
                type="search"
                value={search}
                onValueChange={setSearch}
                placeholder="بحث بالاسم أو النص"
                startIcon={<Search />}
                className="sm:col-span-2 lg:col-span-1"
              />
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
              <p className="py-4 text-center text-xs text-muted-foreground">
                لا توجد قوالب مطابقة للفلاتر.
              </p>
            ) : (
              <div className="space-y-3">
                {filtered.map((t) => (
                  <div key={t.id} className="rounded-xl border border-border px-3.5 py-3">
                    <div className="mb-1 flex items-center justify-between">
                      <span className="text-sm font-medium text-foreground">{t.name}</span>
                      <div className="flex items-center gap-2">
                        <StatusBadge status={t.status} />
                        <Button
                          variant="ghost-destructive"
                          size="icon-sm"
                          onClick={() => handleDelete(t.name)}
                          aria-label="حذف"
                        >
                          <Trash2 />
                        </Button>
                      </div>
                    </div>
                    <p className="mb-2 text-[10px] uppercase text-muted-foreground">
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
      </Card>
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
    <FormField
      type="select"
      value={value}
      onValueChange={onChange}
      options={[{ value: ALL, label: allLabel }, ...options]}
      controlClassName="text-muted-foreground"
    />
  );
}

function SendToNumber({
  clinicId,
  template,
  onDone,
}: {
  clinicId: string;
  template: MessageTemplate;
  onDone: () => void;
}) {
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const form = useForm<SendTemplateValues>({
    resolver: zodResolver(sendTemplateSchema),
    defaultValues: {
      phone: "",
      variables: Array.from({ length: template.variableCount }, () => ""),
    },
    mode: "onTouched",
  });
  const sending = form.formState.isSubmitting;

  const handleSend = form.handleSubmit(async ({ phone, variables }) => {
    setMessage(null);
    const res = await sendClinicTemplateToNumberAction({
      clinicId,
      phone,
      name: template.name,
      language: template.language,
      variables,
    });
    if (res.ok) {
      setMessage({ ok: true, text: "تم الإرسال." });
      setTimeout(onDone, 1200);
    } else {
      setMessage({
        ok: false,
        text: ("message" in res && res.message) || "تعذّر الإرسال.",
      });
    }
  });

  return (
    <form onSubmit={handleSend} noValidate className="mt-2 space-y-2 rounded-lg bg-muted/40 p-3">
      <FormField
        control={form.control}
        name="phone"
        type="tel"
        placeholder="رقم الهاتف مع رمز الدولة، أرقام فقط"
        controlClassName="h-9"
      />
      {Array.from({ length: template.variableCount }, (_, i) => (
        <FormField
          key={i}
          control={form.control}
          name={`variables.${i}`}
          placeholder={`القيمة ${i + 1} ({{${i + 1}}})`}
          controlClassName="h-9"
        />
      ))}
      <SendPreview control={form.control} template={template} />
      {message && (
        <p className={`text-xs ${message.ok ? "text-green-600" : "text-red-600"}`}>
          {message.text}
        </p>
      )}
      <div className="flex items-center gap-2">
        <Button type="submit" size="sm" loading={sending}>
          {!sending && <Send />}
          إرسال
        </Button>
        <Button
          type="button"
          variant="link"
          size="sm"
          onClick={onDone}
          className="text-muted-foreground"
        >
          إلغاء
        </Button>
      </div>
    </form>
  );
}

/** Preview with the typed variable values; re-renders alone as they change. */
function SendPreview({
  control,
  template,
}: {
  control: Control<SendTemplateValues>;
  template: MessageTemplate;
}) {
  const variables = useWatch({ control, name: "variables" });
  return (
    <WhatsappPreview
      headerText={template.headerText}
      bodyText={template.bodyText}
      variables={variables}
      footerText={template.footerText}
      buttons={template.buttons}
    />
  );
}
