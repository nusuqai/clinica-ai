"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Bot, Clock, Pencil, Plus, Trash2 } from "lucide-react";
import { DayOfWeek } from "@prisma/client";
import Modal from "@/components/admin/modal";
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

const inputCls =
  "w-full border border-border rounded-xl px-3 py-2 text-sm bg-background text-foreground font-sans focus:outline-none focus:ring-2 focus:ring-primary/30";
const labelCls = "text-sm font-medium text-foreground font-sans";
const hintCls = "text-xs text-muted-foreground font-sans";

function ErrorBox({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 font-sans text-sm text-red-700">
      {message}
    </div>
  );
}

function hoursSummary(agent: AiAgentView): string {
  if (agent.alwaysOn) return "على مدار الساعة";
  return DAYS.filter((d) => agent.hours.some((h) => h.dayOfWeek === d.key))
    .map((d) => {
      const h = agent.hours.find((x) => x.dayOfWeek === d.key)!;
      return `${d.label} ${h.startTime}–${h.endTime}`;
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
  // null = closed, "new" = create, otherwise the agent being edited.
  const [editing, setEditing] = useState<AiAgentView | "new" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function remove(agent: AiAgentView) {
    if (!confirm(`حذف الموظف الآلي «${agent.name}»؟`)) return;
    setError(null);
    startTransition(async () => {
      const res = await deleteClinicAiAgentAction(clinicId, agent.id);
      if (!res.ok) setError(res.error);
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className={hintCls}>
          {agents.length === 0
            ? "لا يوجد موظفون آليون — لن يردّ المساعد على عملاء هذه العيادة إلى أن تضيف أول موظف."
            : "يردّ الموظف الذي يوافق دوامه وقت الرسالة. خارج دوام الجميع لا يردّ المساعد وتُحوَّل الرسالة إلى فريق العيادة."}
        </p>
        <button
          onClick={() => setEditing("new")}
          className="inline-flex flex-shrink-0 items-center gap-2 rounded-xl bg-primary px-4 py-2 font-sans text-sm font-medium text-white transition-colors hover:bg-primary/90"
        >
          <Plus className="h-4 w-4" />
          موظف آلي جديد
        </button>
      </div>

      <ErrorBox message={error} />

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        {agents.map((agent) => (
          <div key={agent.id} className="rounded-xl border border-border bg-background p-4">
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
                <span
                  className={[
                    "rounded-full px-2.5 py-0.5 font-sans text-xs font-medium",
                    !agent.isActive
                      ? "bg-muted text-muted-foreground"
                      : agent.onShiftNow
                        ? "bg-emerald-500/10 text-emerald-600"
                        : "bg-amber-500/10 text-amber-600",
                  ].join(" ")}
                >
                  {!agent.isActive ? "موقوف" : agent.onShiftNow ? "في الدوام الآن" : "خارج الدوام"}
                </span>
                <button
                  onClick={() => setEditing(agent)}
                  title="تعديل"
                  className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  <Pencil className="h-4 w-4" />
                </button>
                <button
                  onClick={() => remove(agent)}
                  disabled={isPending}
                  title="حذف"
                  className="rounded-lg p-2 text-red-600 transition-colors hover:bg-red-50 disabled:opacity-40"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>

            <p className="mt-3 flex items-start gap-1.5 font-sans text-xs text-muted-foreground">
              <Clock className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
              {hoursSummary(agent)}
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5 font-sans text-xs">
              <span
                className={[
                  "rounded-full px-2.5 py-0.5",
                  agent.dailyUnitCap !== null && agent.unitsLast24h >= agent.dailyUnitCap
                    ? "bg-red-500/10 font-medium text-red-600"
                    : "bg-muted text-muted-foreground",
                ].join(" ")}
                title="الوحدات المستهلكة خلال آخر 24 ساعة من الحد اليومي"
              >
                آخر 24 ساعة: {agent.unitsLast24h} / {agent.dailyUnitCap ?? "بلا حد"}
              </span>
              <span className="rounded-full bg-muted px-2.5 py-0.5 text-muted-foreground">
                لكل عميل: {agent.dailyUnitCapPerConversation ?? "بلا حد"}
              </span>
              <span className="rounded-full bg-muted px-2.5 py-0.5 text-muted-foreground">
                آخر 30 يوماً: {agent.unitsLast30d} وحدة
              </span>
            </div>
            {agent.persona && (
              <p className="mt-2 line-clamp-3 whitespace-pre-line font-sans text-sm leading-relaxed text-foreground/80">
                {agent.persona}
              </p>
            )}
          </div>
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
      <label className={labelCls}>{label}</label>
      <div className="flex items-center gap-3">
        <input
          type="number"
          min={1}
          max={100000}
          step={1}
          value={value ?? ""}
          onChange={(e) => onChange(Math.max(1, Math.trunc(Number(e.target.value)) || 1))}
          disabled={value === null}
          required={value !== null}
          placeholder="بلا حد"
          className={`${inputCls} disabled:opacity-50`}
        />
        <label className="flex flex-shrink-0 cursor-pointer items-center gap-2 font-sans text-sm text-foreground">
          <input
            type="checkbox"
            checked={value === null}
            onChange={(e) => onChange(e.target.checked ? null : fallback)}
            className="h-4 w-4 accent-primary"
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
  startTime: string;
  endTime: string;
}

function initialDays(agent: AiAgentView | null): Record<DayOfWeek, DayState> {
  const days = {} as Record<DayOfWeek, DayState>;
  for (const d of DAYS) {
    const h = agent?.hours.find((x) => x.dayOfWeek === d.key);
    days[d.key] = h
      ? { on: true, startTime: h.startTime, endTime: h.endTime }
      : { on: false, startTime: "09:00", endTime: "17:00" };
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
        startTime: days[d.key].startTime,
        endTime: days[d.key].endTime,
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
        <ErrorBox message={error} />

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <label className={labelCls}>الاسم</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="مثال: سارة"
              maxLength={40}
              required
              className={inputCls}
            />
          </div>
          <div className="space-y-1.5">
            <label className={labelCls}>
              المسمّى الوظيفي <span className="text-muted-foreground">(اختياري)</span>
            </label>
            <input
              value={jobTitle}
              onChange={(e) => setJobTitle(e.target.value)}
              placeholder="مثال: موظفة الاستقبال"
              maxLength={60}
              className={inputCls}
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <label className={labelCls}>
            الشخصية وأسلوب الحديث <span className="text-muted-foreground">(اختياري)</span>
          </label>
          <textarea
            value={persona}
            onChange={(e) => setPersona(e.target.value)}
            rows={5}
            maxLength={PERSONA_MAX}
            placeholder="مثال: ودودة ومرحة، تتحدث باللهجة المصرية، ردودها قصيرة، وتستخدم الإيموجي باعتدال."
            className={inputCls}
          />
          <p className={hintCls}>
            تحدّد النبرة والأسلوب فقط — لا تغيّر ما يستطيع الموظف تنفيذه. {persona.length}/
            {PERSONA_MAX}
          </p>
        </div>

        <div className="space-y-2">
          <label className={labelCls}>الدوام</label>
          <label className="flex cursor-pointer items-center gap-2 font-sans text-sm text-foreground">
            <input
              type="checkbox"
              checked={alwaysOn}
              onChange={(e) => setAlwaysOn(e.target.checked)}
              className="h-4 w-4 accent-primary"
            />
            على مدار الساعة طوال الأسبوع
          </label>
          {!alwaysOn && (
            <div className="space-y-1.5 rounded-xl border border-border p-3">
              {DAYS.map((d) => {
                const day = days[d.key];
                return (
                  <div key={d.key} className="flex flex-wrap items-center gap-3">
                    <label className="flex w-28 cursor-pointer items-center gap-2 font-sans text-sm text-foreground">
                      <input
                        type="checkbox"
                        checked={day.on}
                        onChange={(e) => setDay(d.key, { on: e.target.checked })}
                        className="h-4 w-4 accent-primary"
                      />
                      {d.label}
                    </label>
                    {day.on ? (
                      <div className="flex items-center gap-2 font-sans text-sm text-muted-foreground">
                        من
                        <input
                          type="time"
                          value={day.startTime}
                          onChange={(e) => setDay(d.key, { startTime: e.target.value })}
                          required
                          className={`${inputCls} w-32`}
                        />
                        إلى
                        <input
                          type="time"
                          value={day.endTime}
                          onChange={(e) => setDay(d.key, { endTime: e.target.value })}
                          required
                          className={`${inputCls} w-32`}
                        />
                      </div>
                    ) : (
                      <span className={hintCls}>إجازة</span>
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
          <label className={labelCls}>حدود الاستهلاك</label>
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

        <label className="flex cursor-pointer items-center gap-2 font-sans text-sm text-foreground">
          <input
            type="checkbox"
            checked={isActive}
            onChange={(e) => setIsActive(e.target.checked)}
            className="h-4 w-4 accent-primary"
          />
          مفعّل ويستقبل المحادثات
        </label>

        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-border px-4 py-2 font-sans text-sm font-medium text-foreground transition-colors hover:bg-muted"
          >
            إلغاء
          </button>
          <button
            type="submit"
            disabled={isPending}
            className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 font-sans text-sm font-medium text-white transition-colors hover:bg-primary/90 disabled:opacity-50"
          >
            {isPending ? "جارٍ الحفظ…" : "حفظ"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
