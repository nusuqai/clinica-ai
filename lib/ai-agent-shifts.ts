import { DayOfWeek } from "@prisma/client";

// Working hours of an AI employee (see AiAgent / AiAgentHours in the schema).
// Shifts are wall-clock "HH:MM" on the clinic's clock, one per day; a shift whose
// end is not after its start runs past midnight into the next day.

export interface AgentShift {
  dayOfWeek: DayOfWeek;
  startTime: string; // "HH:MM"
  endTime: string; // "HH:MM"
}

// Index = JS getUTCDay() (0 = Sunday).
const DAY_ORDER: DayOfWeek[] = [
  DayOfWeek.SUN,
  DayOfWeek.MON,
  DayOfWeek.TUE,
  DayOfWeek.WED,
  DayOfWeek.THU,
  DayOfWeek.FRI,
  DayOfWeek.SAT,
];

const WEEKDAY_INDEX: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function isValidShiftTime(value: string): boolean {
  return TIME_RE.test(value);
}

function toMinutes(value: string): number {
  const m = TIME_RE.exec(value);
  return m ? Number(m[1]) * 60 + Number(m[2]) : NaN;
}

/** The day and minute-of-day it currently is on the clinic's wall clock. */
export function clinicClock(
  timeZone: string,
  at: Date = new Date()
): {
  day: DayOfWeek;
  minutes: number;
} {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(at);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return {
    day: DAY_ORDER[WEEKDAY_INDEX[get("weekday")] ?? 0],
    minutes: Number(get("hour")) * 60 + Number(get("minute")),
  };
}

/** Whether any of `shifts` covers the given clinic-clock moment. */
export function isOnShift(
  shifts: readonly AgentShift[],
  now: { day: DayOfWeek; minutes: number }
): boolean {
  const today = DAY_ORDER.indexOf(now.day);
  const yesterday = DAY_ORDER[(today + 6) % 7];
  for (const s of shifts) {
    const start = toMinutes(s.startTime);
    const end = toMinutes(s.endTime);
    if (Number.isNaN(start) || Number.isNaN(end)) continue;
    if (end > start) {
      if (s.dayOfWeek === now.day && now.minutes >= start && now.minutes < end) return true;
    } else {
      // Overnight: the evening part on its own day, the tail on the next one.
      if (s.dayOfWeek === now.day && now.minutes >= start) return true;
      if (s.dayOfWeek === yesterday && now.minutes < end) return true;
    }
  }
  return false;
}

const DAY_MINUTES = 24 * 60;
const WEEK_MINUTES = 7 * DAY_MINUTES;

/** An agent's working time as [start, end) minute ranges on a SUN-based week. */
function weekRanges(agent: {
  alwaysOn: boolean;
  hours: readonly AgentShift[];
}): [number, number][] {
  if (agent.alwaysOn) return [[0, WEEK_MINUTES]];
  const ranges: [number, number][] = [];
  for (const s of agent.hours) {
    const start = toMinutes(s.startTime);
    const end = toMinutes(s.endTime);
    if (Number.isNaN(start) || Number.isNaN(end)) continue;
    const base = DAY_ORDER.indexOf(s.dayOfWeek) * DAY_MINUTES;
    const from = base + start;
    const to = base + (end > start ? end : end + DAY_MINUTES);
    if (to <= WEEK_MINUTES) ranges.push([from, to]);
    else {
      // A Saturday-night shift wraps round to Sunday morning.
      ranges.push([from, WEEK_MINUTES], [0, to - WEEK_MINUTES]);
    }
  }
  return ranges;
}

/**
 * The first day on which two agents' working hours overlap, or null when they
 * never do. Used to keep a clinic's active agents from being on shift together.
 */
export function findShiftOverlap(
  a: { alwaysOn: boolean; hours: readonly AgentShift[] },
  b: { alwaysOn: boolean; hours: readonly AgentShift[] }
): DayOfWeek | null {
  const other = weekRanges(b);
  for (const [aStart, aEnd] of weekRanges(a)) {
    for (const [bStart, bEnd] of other) {
      const start = Math.max(aStart, bStart);
      if (start < Math.min(aEnd, bEnd)) return DAY_ORDER[Math.floor(start / DAY_MINUTES)];
    }
  }
  return null;
}
