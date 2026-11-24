"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { BellRing, Bot, FileText, Loader2, Save, Unlink, Users } from "lucide-react";
import type { StaffEvent } from "@prisma/client";
import {
  listAlertTemplateChoicesAction,
  saveAlertTemplateAction,
  saveAssistantSettingsAction,
  setEventRecipientsAction,
  setMemberAssistantAction,
  unlinkMemberWhatsappAction,
} from "@/server/actions/staff-assistant";
import type { AssistantAdminView } from "@/server/services/staff/settings";
import {
  ROUTABLE_STAFF_EVENTS,
  STAFF_ALERT_TOKENS,
  STAFF_ALERT_TOKEN_LABELS,
  STAFF_EVENT_META,
  STAFF_EVENTS,
  SUGGESTED_ALERT_TEMPLATE_BODY,
} from "@/lib/staff/events";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useConfirm } from "@/components/ui/confirm-dialog";

type TemplateChoice = { name: string; language: string; bodyText: string; variableCount: number };

function SectionTitle({
  icon,
  title,
  hint,
}: {
  icon: React.ReactNode;
  title: string;
  hint?: string;
}) {
  return (
    <div className="mb-4">
      <div className="flex items-center gap-2">
        {icon}
        <h2 className="font-heading text-base font-semibold">{title}</h2>
      </div>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

export default function AssistantSettings({
  view,
  hasOfficialNumber,
}: {
  view: AssistantAdminView;
  hasOfficialNumber: boolean;
}) {
  const confirm = useConfirm();
  const [pending, startTransition] = useTransition();

  // ─── General ───────────────────────────────────────────────────────────────
  const [enabled, setEnabled] = useState(view.config.enabled);
  const [batch, setBatch] = useState(String(view.config.batchMinutes));

  function saveGeneral() {
    startTransition(async () => {
      const res = await saveAssistantSettingsAction({ enabled, batchMinutes: Number(batch) });
      if (res.ok) toast.success("تم حفظ الإعدادات");
      else toast.error(res.error);
    });
  }

  // ─── Members ───────────────────────────────────────────────────────────────
  const [members, setMembers] = useState(view.members);

  function toggleMember(memberId: string, next: boolean) {
    setMembers((list) =>
      list.map((m) => (m.memberId === memberId ? { ...m, assistantEnabled: next } : m))
    );
    startTransition(async () => {
      const res = await setMemberAssistantAction(memberId, next);
      if (!res.ok) {
        toast.error(res.error);
        setMembers((list) =>
          list.map((m) => (m.memberId === memberId ? { ...m, assistantEnabled: !next } : m))
        );
      }
    });
  }

  async function unlinkMember(memberId: string, name: string) {
    await confirm({
      description: `إلغاء ربط رقم واتساب «${name}»؟`,
      warning: "لن تصله التنبيهات ولن يستطيع استخدام المساعد من واتساب حتى يربط رقمه من جديد.",
      confirmText: "إلغاء الربط",
      onConfirm: async () => {
        const res = await unlinkMemberWhatsappAction(memberId);
        if (!res.ok) return { error: res.error };
        setMembers((list) =>
          list.map((m) => (m.memberId === memberId ? { ...m, whatsapp: null } : m))
        );
      },
    });
  }

  // ─── Event routing ─────────────────────────────────────────────────────────
  const [recipients, setRecipients] = useState(view.recipients);

  function toggleRecipient(event: StaffEvent, memberId: string, on: boolean) {
    const next = on
      ? [...new Set([...recipients[event], memberId])]
      : recipients[event].filter((id) => id !== memberId);
    setRecipients((r) => ({ ...r, [event]: next }));
    startTransition(async () => {
      const res = await setEventRecipientsAction(event, next);
      if (!res.ok) toast.error(res.error);
    });
  }

  // ─── Alert template (official numbers) ────────────────────────────────────
  const [templates, setTemplates] = useState<TemplateChoice[] | null>(null);
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [templateKey, setTemplateKey] = useState(
    view.config.alertTemplateName
      ? `${view.config.alertTemplateName}|${view.config.alertTemplateLanguage}`
      : ""
  );
  const [variableMap, setVariableMap] = useState<string[]>(view.config.alertVariableMap);

  async function loadTemplates() {
    setLoadingTemplates(true);
    const res = await listAlertTemplateChoicesAction();
    setLoadingTemplates(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    setTemplates(res.templates);
  }

  const chosen = templates?.find((t) => `${t.name}|${t.language}` === templateKey) ?? null;

  function pickTemplate(key: string) {
    setTemplateKey(key);
    const t = templates?.find((x) => `${x.name}|${x.language}` === key);
    setVariableMap(
      t ? Array.from({ length: t.variableCount }, (_, i) => variableMap[i] ?? "") : []
    );
  }

  function saveTemplate() {
    if (!chosen) return;
    if (variableMap.some((v) => !v)) {
      toast.error("اختر قيمة لكل متغيّر في القالب");
      return;
    }
    startTransition(async () => {
      const res = await saveAlertTemplateAction({
        name: chosen.name,
        languageCode: chosen.language,
        variableMap,
      });
      if (res.ok) toast.success("تم ربط قالب التنبيهات");
      else toast.error(res.error);
    });
  }

  function clearTemplate() {
    startTransition(async () => {
      const res = await saveAlertTemplateAction(null);
      if (res.ok) {
        setTemplateKey("");
        setVariableMap([]);
        toast.success("تم إلغاء ربط القالب");
      } else toast.error(res.error);
    });
  }

  return (
    <div className="space-y-6">
      <Card className="p-5">
        <SectionTitle
          icon={<Bot className="h-5 w-5 text-primary" />}
          title="تشغيل مساعد الفريق"
          hint="يتيح للفريق إدارة العيادة بالمحادثة من واتساب أو من فقاعة المحادثة في لوحة التحكم. إيقافه هنا يوقفه للجميع (التنبيهات تستمر حسب توزيعها بالأسفل)."
        />
        <div className="flex flex-wrap items-end gap-6">
          <label className="flex items-center gap-3">
            <Switch checked={enabled} onCheckedChange={setEnabled} />
            <span className="text-sm">{enabled ? "المساعد يعمل" : "المساعد متوقف"}</span>
          </label>
          <div className="space-y-1">
            <Label htmlFor="batch">تجميع التنبيهات كل (دقيقة)</Label>
            <Input
              id="batch"
              type="number"
              min={1}
              max={30}
              value={batch}
              onChange={(e) => setBatch(e.target.value)}
              className="w-28"
            />
          </div>
          <Button onClick={saveGeneral} disabled={pending}>
            <Save className="h-4 w-4" /> حفظ
          </Button>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          التنبيهات لا تُرسل فوراً: تُجمع لكل عضو وتصله في رسالة واحدة بعد هذه المدة من أول تنبيه.
        </p>
      </Card>

      <Card className="p-5">
        <SectionTitle
          icon={<Users className="h-5 w-5 text-primary" />}
          title="أعضاء الفريق"
          hint="فعّل المساعد لمن تريد من الموظفين والأطباء (المدير مسموح له دائماً). كل عضو يربط رقمه بنفسه من صفحة «واتساب الخاص بي»، ويتصرف المساعد حسب صلاحيات دوره وفروعه فقط."
        />
        <div className="divide-y divide-border">
          {members.map((m) => (
            <div
              key={m.memberId}
              className="flex flex-wrap items-center justify-between gap-3 py-3"
            >
              <div>
                <p className="text-sm font-medium">{m.name}</p>
                <p className="text-xs text-muted-foreground">{m.roleLabel}</p>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                {m.whatsapp ? (
                  <span className="flex items-center gap-2">
                    <Badge variant="success" dir="ltr">
                      {m.whatsapp}
                    </Badge>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => unlinkMember(m.memberId, m.name)}
                      aria-label="إلغاء ربط الرقم"
                    >
                      <Unlink className="h-4 w-4" />
                    </Button>
                  </span>
                ) : (
                  <Badge variant="muted">واتساب غير مربوط</Badge>
                )}
                <label className="flex items-center gap-2 text-sm">
                  <Switch
                    checked={m.assistantEnabled}
                    disabled={m.role === "ADMIN" || pending}
                    onCheckedChange={(v) => toggleMember(m.memberId, v)}
                  />
                  المساعد
                </label>
              </div>
            </div>
          ))}
        </div>
      </Card>

      <Card className="p-5">
        <SectionTitle
          icon={<BellRing className="h-5 w-5 text-primary" />}
          title="من يصله كل تنبيه على واتساب"
          hint="اختر لكل نوع من التنبيهات من يصله من الفريق. يصل التنبيه فقط لمن ربط رقمه، والموظف المحدد بفروع لا تصله إلا تنبيهات فروعه."
        />
        <div className="space-y-5">
          {ROUTABLE_STAFF_EVENTS.map((event) => {
            const meta = STAFF_EVENT_META[event];
            const eligible = members.filter((m) => meta.doctors || m.role !== "DOCTOR");
            return (
              <div key={event} className="rounded-lg border border-border p-4">
                <p className="text-sm font-semibold">{meta.label}</p>
                <p className="mb-3 text-xs text-muted-foreground">{meta.description}</p>
                <div className="flex flex-wrap gap-x-5 gap-y-2">
                  {eligible.map((m) => (
                    <label key={m.memberId} className="flex items-center gap-2 text-sm">
                      <Checkbox
                        checked={recipients[event].includes(m.memberId)}
                        onCheckedChange={(v) => toggleRecipient(event, m.memberId, v === true)}
                      />
                      {m.name}
                      {!m.whatsapp && (
                        <span className="text-[11px] text-muted-foreground">(غير مربوط)</span>
                      )}
                    </label>
                  ))}
                </div>
              </div>
            );
          })}
          <div className="rounded-lg bg-muted/50 p-4 text-xs text-muted-foreground">
            <p className="mb-1 font-semibold text-foreground">
              تنبيهات شخصية (تصل لصاحبها تلقائياً)
            </p>
            <ul className="list-disc space-y-0.5 pe-4">
              {STAFF_EVENTS.filter((e) => STAFF_EVENT_META[e].personal).map((e) => (
                <li key={e}>
                  {STAFF_EVENT_META[e].label}: {STAFF_EVENT_META[e].description}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </Card>

      {hasOfficialNumber && (
        <Card className="p-5">
          <SectionTitle
            icon={<FileText className="h-5 w-5 text-primary" />}
            title="قالب التنبيهات (الرقم الرسمي)"
            hint="واتساب الرسمي لا يسمح بإرسال رسالة حرة لمن لم يراسل العيادة خلال 24 ساعة. في هذه الحالة نرسل قالباً معتمداً يخبر العضو بعدد التنبيهات، وعندما يرد بأي رسالة تصله التفاصيل كاملة. بدون قالب تنتظر التنبيهات حتى يراسل العضو العيادة."
          />
          <div className="mb-4 rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground">
            أنشئ قالباً من فئة «UTILITY» في صفحة القوالب، مثال للنص:
            <p className="mt-1 font-medium text-foreground">{SUGGESTED_ALERT_TEMPLATE_BODY}</p>
          </div>
          {view.config.alertTemplateName && !templates && (
            <p className="mb-3 text-sm">
              القالب المربوط حالياً:{" "}
              <span className="font-semibold">{view.config.alertTemplateName}</span> (
              {view.config.alertTemplateLanguage})
            </p>
          )}
          {!templates ? (
            <div className="flex gap-2">
              <Button variant="outline" onClick={loadTemplates} disabled={loadingTemplates}>
                {loadingTemplates && <Loader2 className="h-4 w-4 animate-spin" />}
                {view.config.alertTemplateName ? "تغيير القالب" : "اختيار قالب"}
              </Button>
              {view.config.alertTemplateName && (
                <Button variant="ghost" onClick={clearTemplate} disabled={pending}>
                  إلغاء الربط
                </Button>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              <Select value={templateKey} onValueChange={pickTemplate}>
                <SelectTrigger className="w-full max-w-md">
                  <SelectValue placeholder="اختر قالباً معتمداً" />
                </SelectTrigger>
                <SelectContent>
                  {templates.map((t) => (
                    <SelectItem key={`${t.name}|${t.language}`} value={`${t.name}|${t.language}`}>
                      {t.name} ({t.language})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {chosen && (
                <>
                  <p className="whitespace-pre-wrap rounded-lg border border-border p-3 text-sm">
                    {chosen.bodyText}
                  </p>
                  {variableMap.map((value, i) => (
                    <div key={i} className="flex items-center gap-3">
                      <span className="w-12 font-mono text-sm">{`{{${i + 1}}}`}</span>
                      <Select
                        value={value}
                        onValueChange={(v) =>
                          setVariableMap((map) => map.map((x, j) => (j === i ? v : x)))
                        }
                      >
                        <SelectTrigger className="w-full max-w-sm">
                          <SelectValue placeholder="اختر القيمة" />
                        </SelectTrigger>
                        <SelectContent>
                          {STAFF_ALERT_TOKENS.map((t) => (
                            <SelectItem key={t} value={t}>
                              {STAFF_ALERT_TOKEN_LABELS[t]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  ))}
                  <Button onClick={saveTemplate} disabled={pending}>
                    <Save className="h-4 w-4" /> حفظ القالب
                  </Button>
                </>
              )}
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
