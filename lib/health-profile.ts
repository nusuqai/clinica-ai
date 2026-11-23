import { z } from "zod";

// The dynamic patient health profile ("ملف المريض") — shared, client-safe logic.
//
// Each clinic builds its own questionnaire (platform admins, /platform/health-
// profiles); patients answer it per clinic (booking modal, profile page, AI
// agent) and staff read/edit it on the patient page. Storage and the safe-edit
// rules (archive, snapshots, stable options) are described in prisma/schema
// .prisma above HealthProfileSection. DB access lives in
// server/services/health-profile.ts.
//
// Answer values by question type:
//   TEXT    → string        NUMBER → number
//   BOOLEAN → boolean       SELECT → option id (string)

export type HealthQuestionType = "TEXT" | "NUMBER" | "SELECT" | "BOOLEAN";
export type HealthQuestionAudience = "PATIENT" | "STAFF";
export type HealthAnswerSource = "PATIENT" | "STAFF" | "AGENT";
export type AnswerValue = string | number | boolean;
/** questionId → current value (absent/null = unanswered). */
export type AnswersMap = Record<string, AnswerValue | null | undefined>;

export interface HealthOptionView {
  id: string;
  label: string;
  archived: boolean;
}

export interface HealthQuestionView {
  id: string;
  sectionId: string;
  parentId: string | null;
  showWhen: boolean | null;
  label: string;
  helpText: string | null;
  type: HealthQuestionType;
  audience: HealthQuestionAudience;
  required: boolean;
  minValue: number | null;
  maxValue: number | null;
  unit: string | null;
  multiline: boolean;
  placeholder: string | null;
  archived: boolean;
  options: HealthOptionView[];
}

export interface HealthSectionView {
  id: string;
  title: string;
  description: string | null;
  archived: boolean;
  questions: HealthQuestionView[];
}

/** Frozen copy of a question stored on every answer (questionSnapshot). */
export interface QuestionSnapshot {
  label: string;
  type: HealthQuestionType;
  unit: string | null;
  /** SELECT: the chosen option's label at answer time. */
  optionLabel: string | null;
}

export const QUESTION_TYPE_LABEL: Record<HealthQuestionType, string> = {
  TEXT: "نص حر",
  NUMBER: "رقم",
  SELECT: "قائمة اختيار",
  BOOLEAN: "نعم / لا",
};

export const AUDIENCE_LABEL: Record<HealthQuestionAudience, string> = {
  PATIENT: "المريض والفريق",
  STAFF: "الفريق فقط",
};

export const SOURCE_LABEL: Record<HealthAnswerSource, string> = {
  PATIENT: "المريض",
  STAFF: "فريق العيادة",
  AGENT: "المساعد الذكي",
};

/** Booking refused because required health-profile answers are missing. */
export const HEALTH_PROFILE_REQUIRED_ERROR =
  "قبل حجز أول موعد يجب الإجابة على الأسئلة المطلوبة في ملف المريض.";

export const MAX_TEXT_ANSWER = 2000;

// ─── Visibility & completeness ───────────────────────────────────────────────

/**
 * Is this question shown given the current answers? A follow-up (parentId set)
 * appears only when its BOOLEAN parent's answer equals `showWhen`.
 */
export function isQuestionVisible(q: HealthQuestionView, answers: AnswersMap): boolean {
  if (!q.parentId) return true;
  const parent = answers[q.parentId];
  return typeof parent === "boolean" && parent === q.showWhen;
}

export function hasAnswer(v: AnswerValue | null | undefined): v is AnswerValue {
  if (v === null || v === undefined) return false;
  if (typeof v === "string") return v.trim().length > 0;
  return true;
}

/** Active questions in display order (sections, then questions, follow-ups under their parent). */
export function flattenQuestions(sections: HealthSectionView[]): HealthQuestionView[] {
  const out: HealthQuestionView[] = [];
  for (const s of sections) {
    if (s.archived) continue;
    const active = s.questions.filter((q) => !q.archived);
    for (const q of active.filter((x) => !x.parentId)) {
      out.push(q);
      out.push(...active.filter((f) => f.parentId === q.id));
    }
  }
  return out;
}

/**
 * Required PATIENT questions that are visible and still unanswered — the
 * booking-gate list. Hidden follow-ups and STAFF questions never count.
 */
export function missingRequired(
  sections: HealthSectionView[],
  answers: AnswersMap
): HealthQuestionView[] {
  return flattenQuestions(sections).filter(
    (q) =>
      q.audience === "PATIENT" &&
      q.required &&
      isQuestionVisible(q, answers) &&
      !hasAnswer(answers[q.id])
  );
}

// ─── Answer validation ───────────────────────────────────────────────────────

const ARABIC_DIGITS = "٠١٢٣٤٥٦٧٨٩";
const PERSIAN_DIGITS = "۰۱۲۳۴۵۶۷۸۹";

/** "٧٢٫٥" → "72.5" — patients type Arabic-Indic digits. */
function normalizeDigits(s: string): string {
  return s
    .replace(/[٠-٩]/g, (d) => String(ARABIC_DIGITS.indexOf(d)))
    .replace(/[۰-۹]/g, (d) => String(PERSIAN_DIGITS.indexOf(d)))
    .replace(/[٫,]/g, ".");
}

const YES = new Set([
  "true",
  "yes",
  "y",
  "نعم",
  "ايوه",
  "أيوه",
  "ايوا",
  "أيوة",
  "ايوة",
  "اه",
  "آه",
]);
const NO = new Set(["false", "no", "n", "لا", "لأ", "لاء"]);

type Parsed = { ok: true; value: AnswerValue | null } | { ok: false; error: string };

/**
 * Normalise + validate one raw answer against its question. Accepts the loose
 * shapes the web form and the AI agent send (numbers as strings, "نعم"/"لا",
 * a SELECT option's id OR its label). Empty input → null (unanswered).
 * Archived options are rejected here; the service lets an unchanged answer
 * that points at one through.
 */
export function parseAnswer(q: HealthQuestionView, raw: unknown): Parsed {
  if (raw === null || raw === undefined) return { ok: true, value: null };
  if (typeof raw === "string" && raw.trim() === "") return { ok: true, value: null };

  switch (q.type) {
    case "TEXT": {
      const s = String(raw).trim();
      if (s.length > MAX_TEXT_ANSWER)
        return { ok: false, error: `«${q.label}»: الإجابة طويلة جداً.` };
      return { ok: true, value: s };
    }
    case "NUMBER": {
      const n = typeof raw === "number" ? raw : Number(normalizeDigits(String(raw).trim()));
      if (!Number.isFinite(n)) return { ok: false, error: `«${q.label}»: أدخل رقماً صحيحاً.` };
      if (q.minValue !== null && n < q.minValue)
        return { ok: false, error: `«${q.label}»: أقل قيمة مسموحة ${q.minValue}.` };
      if (q.maxValue !== null && n > q.maxValue)
        return { ok: false, error: `«${q.label}»: أكبر قيمة مسموحة ${q.maxValue}.` };
      return { ok: true, value: n };
    }
    case "BOOLEAN": {
      if (typeof raw === "boolean") return { ok: true, value: raw };
      const s = String(raw).trim().toLowerCase();
      if (YES.has(s)) return { ok: true, value: true };
      if (NO.has(s)) return { ok: true, value: false };
      return { ok: false, error: `«${q.label}»: الإجابة يجب أن تكون نعم أو لا.` };
    }
    case "SELECT": {
      const s = String(raw).trim();
      const opt =
        q.options.find((o) => o.id === s) ??
        q.options.find((o) => o.label.trim() === s) ??
        q.options.find((o) => o.label.trim().toLowerCase() === s.toLowerCase());
      if (!opt) return { ok: false, error: `«${q.label}»: اختر من الخيارات المتاحة.` };
      return { ok: true, value: opt.id };
    }
  }
}

// ─── Display ─────────────────────────────────────────────────────────────────

/** Human-readable answer, from the live question or (archived) its snapshot. */
export function formatAnswer(
  q: Pick<HealthQuestionView, "type" | "unit" | "options"> | null,
  value: AnswerValue | null | undefined,
  snapshot?: QuestionSnapshot | null
): string {
  if (!hasAnswer(value)) return "—";
  const type = q?.type ?? snapshot?.type;
  const unit = q?.unit ?? snapshot?.unit ?? null;
  switch (type) {
    case "BOOLEAN":
      return value === true ? "نعم" : "لا";
    case "NUMBER":
      return unit ? `${value} ${unit}` : String(value);
    case "SELECT":
      return q?.options.find((o) => o.id === value)?.label ?? snapshot?.optionLabel ?? "—";
    default:
      return String(value);
  }
}

export function buildSnapshot(q: HealthQuestionView, value: AnswerValue | null): QuestionSnapshot {
  return {
    label: q.label,
    type: q.type,
    unit: q.unit,
    optionLabel:
      q.type === "SELECT" && typeof value === "string"
        ? (q.options.find((o) => o.id === value)?.label ?? null)
        : null,
  };
}

// ─── Builder input (platform admin) ──────────────────────────────────────────

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, "النص طويل جداً.")
    .transform((v) => (v === "" ? null : v))
    .nullable()
    .optional();

export const sectionInputSchema = z.object({
  title: z.string().trim().min(1, "عنوان القسم مطلوب.").max(120, "العنوان طويل جداً."),
  description: optionalText(500),
});
export type SectionInput = z.input<typeof sectionInputSchema>;

const optionalNumber = z
  .union([z.number(), z.string()])
  .nullable()
  .optional()
  .transform((v, ctx) => {
    if (v === null || v === undefined || (typeof v === "string" && v.trim() === "")) return null;
    const n = typeof v === "number" ? v : Number(normalizeDigits(v.trim()));
    if (!Number.isFinite(n)) {
      ctx.addIssue({ code: "custom", message: "أدخل رقماً صحيحاً." });
      return z.NEVER;
    }
    return n;
  });

export const questionInputSchema = z
  .object({
    sectionId: z.string().uuid(),
    parentId: z.string().uuid().nullable().optional(),
    showWhen: z.boolean().nullable().optional(),
    label: z.string().trim().min(1, "نص السؤال مطلوب.").max(300, "السؤال طويل جداً."),
    helpText: optionalText(500),
    type: z.enum(["TEXT", "NUMBER", "SELECT", "BOOLEAN"]),
    audience: z.enum(["PATIENT", "STAFF"]),
    required: z.boolean(),
    minValue: optionalNumber,
    maxValue: optionalNumber,
    unit: optionalText(30),
    multiline: z.boolean().optional().default(false),
    placeholder: optionalText(120),
    /** SELECT only. Existing options keep their `id` (rename keeps answers). */
    options: z
      .array(
        z.object({
          id: z.string().uuid().nullable().optional(),
          label: z.string().trim().min(1, "نص الخيار مطلوب.").max(120, "الخيار طويل جداً."),
        })
      )
      .optional()
      .default([]),
  })
  .superRefine((v, ctx) => {
    if (v.parentId && (v.showWhen === null || v.showWhen === undefined))
      ctx.addIssue({ code: "custom", path: ["showWhen"], message: "حدّد متى يظهر سؤال المتابعة." });
    if (v.type === "SELECT") {
      if (v.options.length < 2)
        ctx.addIssue({ code: "custom", path: ["options"], message: "أضف خيارين على الأقل." });
      const labels = v.options.map((o) => o.label.trim());
      if (new Set(labels).size !== labels.length)
        ctx.addIssue({ code: "custom", path: ["options"], message: "لا تكرّر نفس الخيار." });
    }
    if (
      v.type === "NUMBER" &&
      v.minValue !== null &&
      v.maxValue !== null &&
      v.minValue > v.maxValue
    )
      ctx.addIssue({ code: "custom", path: ["maxValue"], message: "أكبر قيمة أصغر من أقل قيمة." });
  });
export type QuestionInput = z.input<typeof questionInputSchema>;
export type QuestionInputParsed = z.output<typeof questionInputSchema>;

// ─── Form state helpers (web forms keep raw strings) ─────────────────────────

/** Stored answers → form strings ("true"/"false" for BOOLEAN, option id for SELECT). */
export function toFormValues(answers: AnswersMap): Record<string, string> {
  return Object.fromEntries(
    Object.entries(answers).flatMap(([id, v]) => (hasAnswer(v) ? [[id, String(v)]] : []))
  );
}

/** Form strings → answers, just enough for visibility checks (BOOLEAN parsed). */
export function formValuesToAnswers(
  questions: HealthQuestionView[],
  values: Record<string, string>
): AnswersMap {
  const out: AnswersMap = {};
  for (const q of questions) {
    const v = values[q.id];
    if (v === undefined || v === "") continue;
    out[q.id] = q.type === "BOOLEAN" ? v === "true" : v;
  }
  return out;
}
