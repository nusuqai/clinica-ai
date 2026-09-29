/**
 * Human-readable Arabic labels for escalation `reason` slugs, shown in the admin
 * inbox badge, the sidebar tooltip, and the realtime escalation toast. The
 * `escalate_to_human` tool stores a natural-language reason instead of a slug —
 * that is passed through as-is.
 */
const REASON_LABELS: Record<string, string> = {
  clinic_disabled: "المساعد الذكي متوقف في العيادة",
  insufficient_units: "نفدت وحدات المساعد الذكي",
  voice_transcription_failed: "تعذّر تفريغ رسالة صوتية",
  image_needs_review: "صورة تحتاج مراجعة من الفريق",
  image_analysis_disabled: "صورة بحاجة لمراجعة الفريق (تحليل الصور متوقف)",
  media_needs_review: "مرفق يحتاج مراجعة من الفريق",
};

/** Fallback shown when a reason is an unknown slug (all-lowercase, no spaces). */
const GENERIC_LABEL = "رسالة تحتاج مراجعة من الفريق";

/** Maps an escalation reason to a readable Arabic label. */
export function escalationReasonLabel(reason: string | null | undefined): string {
  if (!reason) return GENERIC_LABEL;
  if (REASON_LABELS[reason]) return REASON_LABELS[reason];
  // A slug-like unknown ("some_new_reason") — don't show it raw; use the generic.
  if (/^[a-z][a-z0-9_]*$/.test(reason)) return GENERIC_LABEL;
  // Otherwise it's a natural-language reason (e.g. from escalate_to_human).
  return reason;
}
