import "server-only";
import { Prisma, DayOfWeek } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  clinicClock,
  findShiftOverlap,
  isOnShift,
  isValidShiftTime,
  type AgentShift,
} from "@/lib/ai-agent-shifts";
import type { AgentPersona } from "@/agent/types";
import { ok, err, type Result } from "./_result";

// A clinic's AI employees: named assistants with a persona and working hours.
// They are set up by the platform team (server/actions/platformAiAgents.ts) —
// the persona is prompt text, so like the knowledge base it is authored by the
// people who tune the agent, not by the clinic.
//
// WHO ANSWERS A MESSAGE:
//   • Active agents of one clinic can never have overlapping hours (enforced on
//     save), so at any moment at most one agent is on shift — that one answers.
//   • The on-shift agent has reached a usage cap (rolling 24h, see
//     agentCapReached) → same outcome: silent + escalated.
//   • Nobody on shift → the agent stays silent and an escalation is raised so
//     the human staff answer (see generateAgentReply). A clinic with no AI
//     employees at all is the same case: nobody is ever on shift, so the AI
//     never replies until the platform team adds an agent.

export const MAX_AI_AGENTS = 10;
const MAX_PERSONA_LENGTH = 2000;
const MAX_UNIT_CAP = 100_000;
// Usage caps are counted over a rolling window, not a calendar day: a night
// shift crossing midnight would otherwise get a fresh allowance mid-shift.
const CAP_WINDOW_MS = 24 * 60 * 60 * 1000;

const DAY_LABEL: Record<DayOfWeek, string> = {
  [DayOfWeek.SAT]: "السبت",
  [DayOfWeek.SUN]: "الأحد",
  [DayOfWeek.MON]: "الإثنين",
  [DayOfWeek.TUE]: "الثلاثاء",
  [DayOfWeek.WED]: "الأربعاء",
  [DayOfWeek.THU]: "الخميس",
  [DayOfWeek.FRI]: "الجمعة",
};

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AiAgentView {
  id: string;
  name: string;
  jobTitle: string | null;
  persona: string;
  isActive: boolean;
  alwaysOn: boolean;
  hours: AgentShift[];
  /** Units (replies) allowed per rolling 24h; null = unlimited. */
  dailyUnitCap: number | null;
  /** Same, for a single conversation; null = unlimited. */
  dailyUnitCapPerConversation: number | null;
  /** On shift at the moment the list was loaded (clinic clock). */
  onShiftNow: boolean;
  /** Units this agent spent in the last 24h (what the cap is measured against). */
  unitsLast24h: number;
  /** Units this agent spent in the last 30 days. */
  unitsLast30d: number;
}

export interface AiAgentInput {
  name: string;
  jobTitle?: string | null;
  persona?: string | null;
  isActive: boolean;
  alwaysOn: boolean;
  hours: readonly { dayOfWeek: string; startTime: string; endTime: string }[];
  /** null / undefined = unlimited. */
  dailyUnitCap?: number | null;
  dailyUnitCapPerConversation?: number | null;
}

export interface PlatformClinicAgents {
  clinicId: string;
  name: string;
  slug: string;
  agents: AiAgentView[];
}

export interface PlatformAiAgentsOverview {
  clinics: PlatformClinicAgents[];
  totalAgents: number;
  clinicsWithNoAgents: number;
}

// ─── Read ─────────────────────────────────────────────────────────────────────

const HOURS_SELECT = { dayOfWeek: true, startTime: true, endTime: true } as const;

/** Every clinic's AI employees in one query, for the platform console. */
export async function getPlatformAiAgentsOverview(): Promise<PlatformAiAgentsOverview> {
  const now = new Date();
  const clinics = await prisma.clinic.findMany({
    where: { isActive: true },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      slug: true,
      timezone: true,
      aiAgents: {
        orderBy: [{ isActive: "desc" }, { createdAt: "asc" }],
        include: { hours: { select: HOURS_SELECT } },
      },
    },
  });

  const agentIds = clinics.flatMap((c) => c.aiAgents.map((a) => a.id));
  const [last24h, last30d] = await Promise.all([
    unitsByAgent(agentIds, new Date(now.getTime() - CAP_WINDOW_MS)),
    unitsByAgent(agentIds, new Date(now.getTime() - 30 * CAP_WINDOW_MS)),
  ]);

  const rows = clinics.map((c) => {
    const clock = clinicClock(c.timezone, now);
    return {
      clinicId: c.id,
      name: c.name,
      slug: c.slug,
      agents: c.aiAgents.map((a) => ({
        id: a.id,
        name: a.name,
        jobTitle: a.jobTitle,
        persona: a.persona,
        isActive: a.isActive,
        alwaysOn: a.alwaysOn,
        hours: a.hours,
        dailyUnitCap: a.dailyUnitCap,
        dailyUnitCapPerConversation: a.dailyUnitCapPerConversation,
        onShiftNow: a.isActive && (a.alwaysOn || isOnShift(a.hours, clock)),
        unitsLast24h: last24h.get(a.id) ?? 0,
        unitsLast30d: last30d.get(a.id) ?? 0,
      })),
    };
  });
  return {
    clinics: rows,
    totalAgents: rows.reduce((n, c) => n + c.agents.length, 0),
    clinicsWithNoAgents: rows.filter((c) => c.agents.length === 0).length,
  };
}

/** Units each agent spent since `since`. */
async function unitsByAgent(agentIds: string[], since: Date): Promise<Map<string, number>> {
  if (agentIds.length === 0) return new Map();
  const rows = await prisma.aiUsageLog.groupBy({
    by: ["aiAgentId"],
    where: { aiAgentId: { in: agentIds }, createdAt: { gte: since } },
    _sum: { unitsCharged: true },
  });
  return new Map(rows.map((r) => [r.aiAgentId as string, r._sum.unitsCharged ?? 0]));
}

/** id → name of every AI employee of the clinic (inbox attribution). */
export async function aiAgentNames(clinicId: string): Promise<Record<string, string>> {
  const agents = await prisma.aiAgent.findMany({
    where: { clinicId },
    select: { id: true, name: true },
  });
  return Object.fromEntries(agents.map((a) => [a.id, a.name]));
}

// ─── Write ────────────────────────────────────────────────────────────────────

interface CleanAgent {
  name: string;
  jobTitle: string | null;
  persona: string;
  isActive: boolean;
  alwaysOn: boolean;
  hours: AgentShift[];
  dailyUnitCap: number | null;
  dailyUnitCapPerConversation: number | null;
}

/** A cap from the form: null/empty = unlimited, otherwise a whole number ≥ 1. */
function cleanCap(value: number | null | undefined): Result<number | null> {
  if (value === null || value === undefined) return ok(null);
  if (!Number.isInteger(value) || value < 1 || value > MAX_UNIT_CAP) {
    return err(`الحد اليومي يجب أن يكون رقماً صحيحاً بين 1 و ${MAX_UNIT_CAP}، أو «بلا حد»`);
  }
  return ok(value);
}

function cleanAgentInput(input: AiAgentInput): Result<CleanAgent> {
  const name = input.name?.trim() ?? "";
  if (name.length < 2) return err("اسم الموظف مطلوب");
  if (name.length > 40) return err("اسم الموظف طويل جداً");
  const jobTitle = input.jobTitle?.trim() || null;
  if (jobTitle && jobTitle.length > 60) return err("المسمّى الوظيفي طويل جداً");
  const persona = input.persona?.trim() ?? "";
  if (persona.length > MAX_PERSONA_LENGTH) {
    return err(`وصف الشخصية طويل جداً (الحد الأقصى ${MAX_PERSONA_LENGTH} حرف)`);
  }

  const hours: AgentShift[] = [];
  const seen = new Set<string>();
  for (const h of Array.isArray(input.hours) ? input.hours : []) {
    if (!(h.dayOfWeek in DayOfWeek) || seen.has(h.dayOfWeek)) continue;
    if (!isValidShiftTime(h.startTime) || !isValidShiftTime(h.endTime)) {
      return err("أوقات الدوام غير صحيحة");
    }
    seen.add(h.dayOfWeek);
    hours.push({
      dayOfWeek: h.dayOfWeek as DayOfWeek,
      startTime: h.startTime,
      endTime: h.endTime,
    });
  }
  const alwaysOn = Boolean(input.alwaysOn);
  if (!alwaysOn && hours.length === 0) {
    return err("حدّد يوم دوام واحداً على الأقل أو اختر «على مدار الساعة»");
  }
  // An overnight shift must not run into the same agent's next-day shift.
  if (!alwaysOn) {
    for (let i = 0; i < hours.length; i++) {
      for (let j = i + 1; j < hours.length; j++) {
        const day = findShiftOverlap(
          { alwaysOn: false, hours: [hours[i]] },
          { alwaysOn: false, hours: [hours[j]] }
        );
        if (day) return err(`دوام الموظف يتداخل مع نفسه يوم ${DAY_LABEL[day]}`);
      }
    }
  }

  const dailyUnitCap = cleanCap(input.dailyUnitCap);
  if (!dailyUnitCap.ok) return dailyUnitCap;
  const perConversation = cleanCap(input.dailyUnitCapPerConversation);
  if (!perConversation.ok) return perConversation;
  if (
    dailyUnitCap.data !== null &&
    perConversation.data !== null &&
    perConversation.data > dailyUnitCap.data
  ) {
    return err("حد العميل الواحد لا يمكن أن يتجاوز الحد اليومي للموظف");
  }

  return ok({
    name,
    jobTitle,
    persona,
    isActive: Boolean(input.isActive),
    alwaysOn,
    hours,
    dailyUnitCap: dailyUnitCap.data,
    dailyUnitCapPerConversation: perConversation.data,
  });
}

/**
 * Rejects hours that overlap another ACTIVE agent of the clinic — the rule that
 * guarantees a single agent on shift. An inactive agent is never on shift, so
 * it is checked only when it is (re)activated.
 */
async function checkNoOverlap(
  tx: Prisma.TransactionClient,
  clinicId: string,
  agent: CleanAgent,
  exceptId: string | null
): Promise<Result> {
  if (!agent.isActive) return ok(undefined);
  const others = await tx.aiAgent.findMany({
    where: { clinicId, isActive: true, ...(exceptId ? { id: { not: exceptId } } : {}) },
    select: { name: true, alwaysOn: true, hours: { select: HOURS_SELECT } },
  });
  for (const other of others) {
    const day = findShiftOverlap(agent, other);
    if (day) {
      return err(
        `الدوام يتداخل مع دوام «${other.name}» يوم ${DAY_LABEL[day]} — لا يمكن أن يعمل موظفان آليان في الوقت نفسه`
      );
    }
  }
  return ok(undefined);
}

function isUniqueViolation(e: unknown): boolean {
  return e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";
}

const DUPLICATE_NAME = "يوجد موظف آلي بهذا الاسم بالفعل";
const NOT_FOUND = "الموظف الآلي غير موجود";

export async function createAiAgent(
  clinicId: string,
  input: AiAgentInput
): Promise<Result<{ id: string }>> {
  const clean = cleanAgentInput(input);
  if (!clean.ok) return clean;
  const { hours, ...data } = clean.data;
  try {
    return await prisma.$transaction(async (tx) => {
      const existing = await tx.aiAgent.count({ where: { clinicId } });
      if (existing >= MAX_AI_AGENTS) {
        return err(`الحد الأقصى ${MAX_AI_AGENTS} موظفين آليين للعيادة`);
      }
      const overlap = await checkNoOverlap(tx, clinicId, clean.data, null);
      if (!overlap.ok) return overlap;
      const agent = await tx.aiAgent.create({
        data: { ...data, clinicId, hours: { create: hours.map((h) => ({ ...h, clinicId })) } },
        select: { id: true },
      });
      return ok(agent);
    });
  } catch (e) {
    if (isUniqueViolation(e)) return err(DUPLICATE_NAME);
    throw e;
  }
}

export async function updateAiAgent(
  clinicId: string,
  agentId: string,
  input: AiAgentInput
): Promise<Result> {
  const clean = cleanAgentInput(input);
  if (!clean.ok) return clean;
  const { hours, ...data } = clean.data;
  try {
    return await prisma.$transaction(async (tx) => {
      const current = await tx.aiAgent.findFirst({
        where: { id: agentId, clinicId },
        select: { id: true },
      });
      if (!current) return err(NOT_FOUND);
      const overlap = await checkNoOverlap(tx, clinicId, clean.data, agentId);
      if (!overlap.ok) return overlap;
      await tx.aiAgentHours.deleteMany({ where: { agentId } });
      await tx.aiAgent.update({
        where: { id: agentId },
        data: { ...data, hours: { create: hours.map((h) => ({ ...h, clinicId })) } },
      });
      return ok(undefined);
    });
  } catch (e) {
    if (isUniqueViolation(e)) return err(DUPLICATE_NAME);
    throw e;
  }
}

export async function deleteAiAgent(clinicId: string, agentId: string): Promise<Result> {
  // Messages keep their rows; the FK nulls their aiAgentId.
  const { count } = await prisma.aiAgent.deleteMany({ where: { id: agentId, clinicId } });
  return count > 0 ? ok(undefined) : err(NOT_FOUND);
}

// ─── Routing ──────────────────────────────────────────────────────────────────

/** The on-shift agent's identity plus the usage caps to enforce before it runs. */
export interface OnDutyAgent extends AgentPersona {
  dailyUnitCap: number | null;
  dailyUnitCapPerConversation: number | null;
}

/** The AI employee on shift in this clinic right now; null when nobody is —
 *  outside every agent's hours, or because the clinic has no agents. */
export async function resolveOnDutyAgent(
  clinicId: string,
  now: Date = new Date()
): Promise<OnDutyAgent | null> {
  const clinic = await prisma.clinic.findUnique({
    where: { id: clinicId },
    select: {
      timezone: true,
      aiAgents: {
        // Hours never overlap, so the order only matters if that rule is ever
        // bypassed by hand — then the oldest agent wins, deterministically.
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          name: true,
          jobTitle: true,
          persona: true,
          isActive: true,
          alwaysOn: true,
          dailyUnitCap: true,
          dailyUnitCapPerConversation: true,
          hours: { select: HOURS_SELECT },
        },
      },
    },
  });
  if (!clinic) return null;

  const clock = clinicClock(clinic.timezone, now);
  const onShift = clinic.aiAgents.find(
    (a) => a.isActive && (a.alwaysOn || isOnShift(a.hours, clock))
  );
  if (!onShift) return null;
  return {
    id: onShift.id,
    name: onShift.name,
    jobTitle: onShift.jobTitle,
    persona: onShift.persona,
    dailyUnitCap: onShift.dailyUnitCap,
    dailyUnitCapPerConversation: onShift.dailyUnitCapPerConversation,
  };
}

// ─── Usage caps ───────────────────────────────────────────────────────────────

export type AgentCapReason = "agent_daily_cap_reached" | "conversation_daily_cap_reached";

/**
 * Whether this agent may NOT reply to this conversation right now because a
 * usage cap is spent — returns which one (also the escalation reason), or null
 * when it may reply. Both caps count units charged to the agent over the last
 * 24 hours; a null cap is unlimited and costs no query.
 *
 * Soft by a few units: this is checked before the reply is generated and the
 * unit is charged after, so conversations answered at the same moment can each
 * pass and overshoot the agent cap slightly. Accepted — an exact cap would need
 * a locked counter on the hot path.
 */
export async function agentCapReached(
  agent: OnDutyAgent,
  conversationId: string,
  now: Date = new Date()
): Promise<AgentCapReason | null> {
  const since = new Date(now.getTime() - CAP_WINDOW_MS);
  const spent = async (where: Prisma.AiUsageLogWhereInput) => {
    const { _sum } = await prisma.aiUsageLog.aggregate({
      where: { aiAgentId: agent.id, createdAt: { gte: since }, ...where },
      _sum: { unitsCharged: true },
    });
    return _sum.unitsCharged ?? 0;
  };

  if (agent.dailyUnitCap !== null && (await spent({})) >= agent.dailyUnitCap) {
    return "agent_daily_cap_reached";
  }
  if (
    agent.dailyUnitCapPerConversation !== null &&
    (await spent({ session: { conversationId } })) >= agent.dailyUnitCapPerConversation
  ) {
    return "conversation_daily_cap_reached";
  }
  return null;
}
