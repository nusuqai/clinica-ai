import { z } from "zod";
import { AvailabilityMode, DayOfWeek, QueueCapType } from "@prisma/client";
import { isQueueMode } from "@/lib/availability/modes";

// The "new availability rule" form — shared by the add/edit doctor modals, the
// admin doctor page and the doctor's own schedule page.

const positiveInt = (message: string) => z.coerce.number({ message }).int(message).min(1, message);

export const ruleFormSchema = z
  .object({
    branchId: z.string().min(1, "اختر الفرع لهذه القاعدة."),
    dayOfWeek: z.enum(DayOfWeek),
    startTime: z.string().min(1, "حدّد وقت البداية."),
    endTime: z.string().min(1, "حدّد وقت النهاية."),
    mode: z.enum(AvailabilityMode),
    slotDurationMin: z.coerce.number(),
    // Only used by the queue modes; validated regardless, they keep sane defaults.
    estimatedDurationMin: positiveInt("أدخل عدد دقائق صحيحاً (1 أو أكثر)."),
    /** Queue modes: how the day is capped — none, a number of patients, or minutes of services. */
    capType: z.enum(QueueCapType),
    dailyCap: positiveInt("أدخل حداً صحيحاً (1 أو أكثر)."),
    dailyCapMinutes: positiveInt("أدخل عدد دقائق صحيحاً (1 أو أكثر)."),
    /** Only these services may be booked on this rule; empty = all the doctor's services. */
    serviceIds: z.array(z.string()),
    referralOnly: z.boolean(),
    note: z.string().trim(),
  })
  .refine((v) => v.endTime > v.startTime, {
    message: "وقت النهاية يجب أن يكون بعد وقت البداية.",
    path: ["endTime"],
  });
export type RuleFormInput = z.input<typeof ruleFormSchema>;
export type RuleFormValues = z.output<typeof ruleFormSchema>;

export function ruleFormDefaults(branchId = ""): RuleFormInput {
  return {
    branchId,
    dayOfWeek: DayOfWeek.SAT,
    startTime: "09:00",
    endTime: "17:00",
    mode: AvailabilityMode.SLOT_BASED,
    slotDurationMin: "30",
    estimatedDurationMin: 10,
    capType: QueueCapType.PATIENTS,
    dailyCap: 50,
    dailyCapMinutes: 240,
    serviceIds: [],
    referralOnly: false,
    note: "",
  };
}

/** A rule as the add-doctor modal drafts it before the doctor exists (and as the server parses it). */
export interface RuleDraft {
  /** Present only for rules that already exist in the DB (live/edit mode). */
  id?: string;
  branchId: string;
  dayOfWeek: DayOfWeek;
  startTime: string;
  endTime: string;
  slotDurationMin: number;
  /** SLOT_BASED (fixed times) or a queue mode. */
  mode: AvailabilityMode;
  /** Queue modes: estimated minutes per patient. */
  estimatedDurationMin: number | null;
  /** Queue modes: how the day is capped. */
  capType: QueueCapType;
  /** Queue modes, PATIENTS cap: max bookings per day. */
  dailyCap: number | null;
  /** Queue modes, MINUTES cap: max minutes of services per day. */
  dailyCapMinutes: number | null;
  /** Only these services on this rule; empty = all the doctor's services. */
  serviceIds: string[];
  /** Referral-only rules aren't bookable by patients directly. */
  referralOnly: boolean;
  note: string | null;
}

/** Drop the queue-only numbers for slot rules, and empty notes. */
export function toRuleDraft(v: RuleFormValues): RuleDraft {
  const queue = isQueueMode(v.mode);
  return {
    branchId: v.branchId,
    dayOfWeek: v.dayOfWeek,
    startTime: v.startTime,
    endTime: v.endTime,
    slotDurationMin: v.slotDurationMin,
    mode: v.mode,
    estimatedDurationMin: queue ? v.estimatedDurationMin : null,
    capType: queue ? v.capType : QueueCapType.NONE,
    dailyCap: queue && v.capType === QueueCapType.PATIENTS ? v.dailyCap : null,
    dailyCapMinutes: queue && v.capType === QueueCapType.MINUTES ? v.dailyCapMinutes : null,
    serviceIds: v.serviceIds,
    referralOnly: v.referralOnly,
    note: v.note || null,
  };
}

/** The FormData createRuleAction / createMyRuleAction read. */
export function ruleDraftToFormData(d: RuleDraft): FormData {
  const fd = new FormData();
  fd.set("branchId", d.branchId);
  fd.set("dayOfWeek", d.dayOfWeek);
  fd.set("startTime", d.startTime);
  fd.set("endTime", d.endTime);
  fd.set("slotDurationMin", String(d.slotDurationMin));
  fd.set("mode", d.mode);
  if (d.estimatedDurationMin != null)
    fd.set("estimatedDurationMin", String(d.estimatedDurationMin));
  fd.set("capType", d.capType);
  if (d.dailyCap != null) fd.set("dailyCap", String(d.dailyCap));
  if (d.dailyCapMinutes != null) fd.set("dailyCapMinutes", String(d.dailyCapMinutes));
  for (const id of d.serviceIds) fd.append("serviceIds", id);
  if (d.referralOnly) fd.set("referralOnly", "on");
  if (d.note) fd.set("note", d.note);
  return fd;
}

/** The rule extras every create-rule action reads from FormData (cap + services). */
export function parseRuleExtras(fd: FormData): {
  capType: QueueCapType;
  dailyCap: number | null;
  dailyCapMinutes: number | null;
  serviceIds: string[];
} {
  const raw = String(fd.get("capType") ?? "");
  const capType = (Object.values(QueueCapType) as string[]).includes(raw)
    ? (raw as QueueCapType)
    : fd.get("dailyCap")
      ? QueueCapType.PATIENTS
      : QueueCapType.NONE;
  const num = (k: string) => (fd.get(k) ? Number(fd.get(k)) : null);
  return {
    capType,
    dailyCap: num("dailyCap"),
    dailyCapMinutes: num("dailyCapMinutes"),
    serviceIds: fd.getAll("serviceIds").map(String).filter(Boolean),
  };
}
