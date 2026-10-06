import { z } from "zod";
import { AvailabilityMode, DayOfWeek } from "@prisma/client";
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
    dailyCap: positiveInt("أدخل حداً صحيحاً (1 أو أكثر)."),
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
    dailyCap: 50,
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
  /** Queue modes: max bookings per day. */
  dailyCap: number | null;
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
    dailyCap: queue ? v.dailyCap : null,
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
  if (d.dailyCap != null) fd.set("dailyCap", String(d.dailyCap));
  if (d.referralOnly) fd.set("referralOnly", "on");
  if (d.note) fd.set("note", d.note);
  return fd;
}
