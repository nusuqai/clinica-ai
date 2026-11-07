"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Bot, Clock, Pencil, Plus, Trash2 } from "lucide-react";
import { DayOfWeek } from "@prisma/client";
import Modal from "@/components/admin/modal";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Hint } from "@/components/ui/tooltip";
import {
  createClinicAiAgentAction,
  deleteClinicAiAgentAction,
  updateClinicAiAgentAction,
} from "@/server/actions/platformAiAgents";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AiAgentShiftView {
  dayOfWeek: DayOfWeek;
  startTime: string;
  endTime: string;
}

export interface AiAgentView {
  id: string;
  name: string;
  jobTitle: string | null;
  persona: string;
  isActive: boolean;
  alwaysOn: boolean;
  hours: AiAgentShiftView[];
  dailyUnitCap: number | null;
  dailyUnitCapPerConversation: number | null;
  onShiftNow: boolean;
  unitsLast24h: number;
  unitsLast30d: number;
}

const DAYS: { key: DayOfWeek; label: string }[] = [
  { key: DayOfWeek.SAT, label: "السبت" },
  { key: DayOfWeek.SUN, label: "الأحد" },
  { key: DayOfWeek.MON, label: "الإثنين" },
  { key: DayOfWeek.TUE, label: "الثلاثاء" },
  { key: DayOfWeek.WED, label: "الأربعاء" },
  { key: DayOfWeek.THU, label: "الخميس" },
  { key: DayOfWeek.FRI, label: "الجمعة" },
];

const PERSONA_MAX = 2000;

const labelCls = "font-sans text-foreground";
const hintCls = "text-xs text-muted-foreground font-sans";
// A checkbox or switch with its caption beside it.
const checkRowCls = "flex cursor-pointer items-center gap-2 font-sans text-sm text-foreground";

// A whole day is stored as a shift from midnight to midnight: an end that is not
// after its start runs into the next day, so 00:00–00:00 covers all 24 hours.
const ALL_DAY = "00:00";

function isAllDay(h: { startTime: string; endTime: string }): boolean {
  return h.startTime === ALL_DAY && h.endTime === ALL_DAY;
}

function hoursSummary(agent: AiAgentView): string {
  if (agent.alwaysOn) return "على مدار الساعة";
  return DAYS.filter((d) => agent.hours.some((h) => h.dayOfWeek === d.key))
    .map((d) => {
      const h = agent.hours.find((x) => x.dayOfWeek === d.key)!;
      return isAllDay(h) ? `${d.label} طوال اليوم` : `${d.label} ${h.startTime}–${h.endTime}`;
    })
    .join("، ");
}

// ─── List ─────────────────────────────────────────────────────────────────────

export default function AgentsManager({
  clinicId,
  agents,
}: {
  /** The clinic these agents belong to. Named explicitly because the console
      runs on the root domain, where there is no tenant to infer from the host. */
  clinicId: string;
  agents: AiAgentView[];
}) {
  const router = useRouter();
  const confirm = useConfirm();
  // null = closed, "new" = create, otherwise the agent being edited.
  const [editing, setEditing] = useState<AiAgentView | "new" | null>(null);

  async function remove(agent: AiAgentView) {
    const deleted = await confirm({
      title: "حذف الموظف الآلي",
      description: <>هل تريد حذف الموظف الآلي «{agent.name}»؟</>,
      warning: "لن يردّ المساعد في أوقات دوامه بعد الحذف، ولا يمكن التراجع.",
      onConfirm: () => deleteClinicAiAgentAction(clinicId, agent.id),
    });
    if (deleted) router.refresh();
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className={hintCls}>
          {agents.length === 0
            ? "لا يوجد موظفون آليون — لن يردّ المساعد على عملاء هذه العيادة إلى أن تضيف أول موظف."
            : "يردّ الموظف الذي يوافق دوامه وقت الرسالة. خارج دوام الجميع لا يردّ المساعد وتُحوَّل الرسالة إلى فريق العيادة."}
        </p>
        <Button onClick={() => setEditing("new")} className="flex-shrink-0">
          <Plus />
          موظف آلي جديد
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        {agents.map((agent) => (
          <Card key={agent.id} className="p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex min-w-0 items-start gap-3">
                <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-accent/10 text-accent">
                  <Bot className="h-5 w-5" />
                </span>
                <div className="min-w-0">
                  <p className="font-heading font-semibold text-foreground">{agent.name}</p>
                  {agent.jobTitle && (
                    <p className="font-sans text-sm text-muted-foreground">{agent.jobTitle}</p>
                  )}
                </div>
              </div>
              <div className="flex flex-shrink-0 items-center gap-1">
                <Badge
                  variant={!agent.isActive ? "muted" : agent.onShiftNow ? "success" : "warning"}
                >
                  {!agent.isActive ? "موقوف" : agent.onShiftNow ? "في الدوام الآن" : "خارج الدوام"}
                </Badge>
                <Hint label="تعديل">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setEditing(agent)}
                    aria-label="تعديل"
                    className="hover:bg-primary/10 hover:text-primary"
                  >
                    <Pencil />
                  </Button>
                </Hint>
                <Hint label="حذف">
                  <Button
                    variant="ghost-destructive"
                    size="icon"
                    onClick={() => remove(agent)}
                    aria-label="حذف"
                  >
                    <Trash2 />
                  </Button>
                </Hint>
              </div>
            </div>

            <p className="mt-3 flex items-start gap-1.5 font-sans text-xs text-muted-foreground">
              <Clock className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
              {hoursSummary(agent)}
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <Hint label="الوحدات المستهلكة خلال آخر 24 ساعة من الحد اليومي">
                <Badge
                  variant={
                    agent.dailyUnitCap !== null && agent.unitsLast24h >= agent.dailyUnitCap
                      ? "danger"
                      : "muted"
                  }
                >
                  آخر 24 ساعة: {agent.unitsLast24h} / {agent.dailyUnitCap ?? "بلا حد"}
                </Badge>
              </Hint>
              <Badge variant="muted">
                لكل عميل: {agent.dailyUnitCapPerConversation ?? "بلا حد"}
              </Badge>
              <Badge variant="muted">آخر 30 يوماً: {agent.unitsLast30d} وحدة</Badge>
            </div>
            {agent.persona && (
              <p className="mt-2 line-clamp-3 whitespace-pre-line font-sans text-sm leading-relaxed text-foreground/80">
                {agent.persona}
              </p>
            )}
          </Card>
        ))}
      </div>

      {editing && (
        <AgentModal
          // Remount per agent so the form state starts from that agent's values.
          key={editing === "new" ? "new" : editing.id}
          clinicId={clinicId}
          agent={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onDone={() => {
            setEditing(null);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

/** A usage cap: a number input that an "unlimited" checkbox switches off.
    `value` null = unlimited. */
function CapField({
  label,
  hint,
  value,
  onChange,
  fallback,
}: {
  label: string;
  hint: string;
  value: number | null;
  onChange: (value: number | null) => void;
  /** What the number input starts at when "unlimited" is unticked. */
  fallback: number;
}) {
  return (
    <div className="space-y-1.5">
      <Label className={labelCls}>{label}</Label>
      <div className="flex items-center gap-3">
        <Input
          type="number"
          min={1}
          max={100000}
          step={1}
          value={value ?? ""}
          onChange={(e) => onChange(Math.max(1, Math.trunc(Number(e.target.value)) || 1))}
          disabled={value === null}
          required={value !== null}
          placeholder="بلا حد"
        />
        <label className={`${checkRowCls} flex-shrink-0`}>
          <Checkbox
            checked={value === null}
            onCheckedChange={(checked) => onChange(checked === true ? null : fallback)}
          />
          بلا حد
        </label>
      </div>
      <p className={hintCls}>{hint}</p>
    </div>
  );
}

// ─── Create / edit ────────────────────────────────────────────────────────────

interface DayState {
  on: boolean;
  allDay: boolean;
  startTime: string;
  endTime: string;
}

function initialDays(agent: AiAgentView | null): Record<DayOfWeek, DayState> {
  const days = {} as Record<DayOfWeek, DayState>;
  for (const d of DAYS) {
    const h = agent?.hours.find((x) => x.dayOfWeek === d.key);
    // An all-day shift keeps the default times behind it, so unticking "all day"
    // shows a sensible range rather than midnight to midnight.
    days[d.key] =
      h && !isAllDay(h)
        ? { on: true, allDay: false, startTime: h.startTime, endTime: h.endTime }
        : { on: !!h, allDay: !!h, startTime: "09:00", endTime: "17:00" };
  }
  return days;
}

function AgentModal({
  clinicId,
  agent,
  onClose,
  onDone,
}: {
  clinicId: string;
  agent: AiAgentView | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const [name, setName] = useState(agent?.name ?? "");
  const [jobTitle, setJobTitle] = useState(agent?.jobTitle ?? "");
  const [persona, setPersona] = useState(agent?.persona ?? "");
  const [isActive, setIsActive] = useState(agent?.isActive ?? true);
  const [alwaysOn, setAlwaysOn] = useState(agent?.alwaysOn ?? false);
  const [dailyUnitCap, setDailyUnitCap] = useState(agent?.dailyUnitCap ?? null);
  const [perConversationCap, setPerConversationCap] = useState(
    agent?.dailyUnitCapPerConversation ?? null
  );
  const [days, setDays] = useState(() => initialDays(agent));
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function setDay(day: DayOfWeek, patch: Partial<DayState>) {
    setDays((prev) => ({ ...prev, [day]: { ...prev[day], ...patch } }));
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const input = {
      name,
      jobTitle,
      persona,
      isActive,
      alwaysOn,
      dailyUnitCap,
      dailyUnitCapPerConversation: perConversationCap,
      hours: DAYS.filter((d) => days[d.key].on).map((d) => ({
        dayOfWeek: d.key,
        startTime: days[d.key].allDay ? ALL_DAY : days[d.key].startTime,
        endTime: days[d.key].allDay ? ALL_DAY : days[d.key].endTime,
      })),
    };
    startTransition(async () => {
      const res = agent
        ? await updateClinicAiAgentAction(clinicId, agent.id, input)
        : await createClinicAiAgentAction(clinicId, input);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      onDone();
    });
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={agent ? "تعديل الموظف الآلي" : "موظف آلي جديد"}
      width="max-w-2xl"
    >
      <form onSubmit={submit} className="space-y-4">
        {error && <Alert variant="destructive">{error}</Alert>}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="agent-name" className={labelCls}>
              الاسم
            </Label>
            <Input
              id="agent-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="مثال: سارة"
              maxLength={40}
              required
              autoFocus
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="agent-job-title" className={labelCls}>
              المسمّى الوظيفي <span className="text-muted-foreground">(اختياري)</span>
            </Label>
            <Input
              id="agent-job-title"
              value={jobTitle}
              onChange={(e) => setJobTitle(e.target.value)}
              placeholder="مثال: موظفة الاستقبال"
              maxLength={60}
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="agent-persona" className={labelCls}>
            الشخصية وأسلوب الحديث <span className="text-muted-foreground">(اختياري)</span>
          </Label>
          <Textarea
            id="agent-persona"
            value={persona}
            onChange={(e) => setPersona(e.target.value)}
            rows={5}
            maxLength={PERSONA_MAX}
            placeholder="مثال: ودودة ومرحة، تتحدث باللهجة المصرية، ردودها قصيرة، وتستخدم الإيموجي باعتدال."
            className="resize-y leading-relaxed"
          />
          <p className={hintCls}>
            تحدّد النبرة والأسلوب فقط — لا تغيّر ما يستطيع الموظف تنفيذه. {persona.length}/
            {PERSONA_MAX}
          </p>
        </div>

        <div className="space-y-2">
          <Label className={labelCls}>الدوام</Label>
          <label className={checkRowCls}>
            <Checkbox checked={alwaysOn} onCheckedChange={(v) => setAlwaysOn(v === true)} />
            على مدار الساعة طوال الأسبوع
          </label>
          {!alwaysOn && (
            <div className="space-y-1.5 rounded-xl border border-border p-3">
              {DAYS.map((d) => {
                const day = days[d.key];
                return (
                  <div key={d.key} className="flex flex-wrap items-center gap-3">
                    <label className={`${checkRowCls} w-28`}>
                      <Checkbox
                        checked={day.on}
                        onCheckedChange={(v) => setDay(d.key, { on: v === true })}
                      />
                      {d.label}
                    </label>
                    {day.on && (
                      <label className={checkRowCls}>
                        <Checkbox
                          checked={day.allDay}
                          onCheckedChange={(v) => setDay(d.key, { allDay: v === true })}
                        />
                        طوال اليوم
                      </label>
                    )}
                    {!day.on ? (
                      <span className={hintCls}>إجازة</span>
                    ) : day.allDay ? null : (
                      <div className="flex items-center gap-2 font-sans text-sm text-muted-foreground">
                        من
                        <Input
                          type="time"
                          value={day.startTime}
                          onChange={(e) => setDay(d.key, { startTime: e.target.value })}
                          required
                          aria-label={`بداية دوام ${d.label}`}
                          className="w-32"
                        />
                        إلى
                        <Input
                          type="time"
                          value={day.endTime}
                          onChange={(e) => setDay(d.key, { endTime: e.target.value })}
                          required
                          aria-label={`نهاية دوام ${d.label}`}
                          className="w-32"
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
          <p className={hintCls}>
            الأوقات بتوقيت العيادة. إذا كان وقت النهاية قبل وقت البداية فالدوام يمتد إلى ما بعد
            منتصف الليل. لا يمكن أن يتداخل الدوام مع دوام موظف آلي آخر مفعّل في العيادة نفسها.
          </p>
        </div>

        <div className="space-y-2">
          <Label className={labelCls}>حدود الاستهلاك</Label>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <CapField
              label="الحد اليومي للموظف"
              hint="أقصى عدد ردود (وحدات) يرسلها الموظف لكل العملاء."
              value={dailyUnitCap}
              onChange={setDailyUnitCap}
              fallback={500}
            />
            <CapField
              label="الحد اليومي للعميل الواحد"
              hint="أقصى عدد ردود يرسلها الموظف في المحادثة الواحدة."
              value={perConversationCap}
              onChange={setPerConversationCap}
              fallback={30}
            />
          </div>
          <p className={hintCls}>
            يُحتسب الحدّان على آخر 24 ساعة. عند بلوغ أحدهما يتوقف الموظف عن الرد وتُحوَّل المحادثة
            إلى فريق العيادة.
          </p>
        </div>

        <label className={checkRowCls}>
          <Switch checked={isActive} onCheckedChange={setIsActive} />
          مفعّل ويستقبل المحادثات
        </label>

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={onClose}>
            إلغاء
          </Button>
          <Button type="submit" loading={isPending}>
            {isPending ? "جارٍ الحفظ…" : "حفظ"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
