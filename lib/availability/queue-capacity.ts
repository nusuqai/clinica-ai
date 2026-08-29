/**
 * Queue-capacity sanity check for ORDER_BASED (طابور) availability rules.
 *
 * When an admin sizes a queue by (max bookings × estimated minutes per patient),
 * that total must fit inside the rule's start–end window. This helper computes
 * that and returns a hint to surface in the rule-add forms so mis-sized queues
 * are caught before the rule is saved. Shared by the doctor add/edit modals and
 * the standalone rules tabs.
 */

/** "HH:MM" → minutes since midnight; null if malformed or out of range. */
export function toMinutes(hhmm: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

/** Human-readable Arabic duration, e.g. 90 → "ساعة و30 دقيقة". */
export function fmtMinutes(total: number): string {
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h === 0) return `${m} دقيقة`;
  const hPart = h === 1 ? "ساعة" : h === 2 ? "ساعتان" : `${h} ساعات`;
  return m === 0 ? hPart : `${hPart} و${m} دقيقة`;
}

export interface QueueCapacityHint {
  tone: "ok" | "warn";
  text: string;
}

/**
 * Does (max bookings × estimated minutes) fit inside the start–end window?
 * Returns a tone + message, or null when there's nothing meaningful to say
 * (missing/invalid input).
 */
export function queueCapacityHint(
  startTime: string,
  endTime: string,
  estDur: number,
  cap: number,
): QueueCapacityHint | null {
  const start = toMinutes(startTime);
  const end = toMinutes(endTime);
  if (start == null || end == null) return null;
  const windowMin = end - start;
  if (windowMin <= 0 || !Number.isFinite(estDur) || !Number.isFinite(cap)) return null;
  if (estDur < 1 || cap < 1) return null;

  const required = cap * estDur;
  const fits = Math.floor(windowMin / estDur);

  if (required <= windowMin) {
    const remaining = windowMin - required;
    return {
      tone: "ok",
      text:
        `يتّسع الطابور: ${cap} مريض × ${estDur} دقيقة = ${fmtMinutes(required)}، ` +
        `ضمن نافذة العمل ${fmtMinutes(windowMin)}` +
        (remaining > 0 ? ` (يتبقّى ${fmtMinutes(remaining)}).` : `.`),
    };
  }

  return {
    tone: "warn",
    text:
      `تنبيه: ${cap} مريض × ${estDur} دقيقة = ${fmtMinutes(required)}، ` +
      `وهي تتجاوز نافذة العمل ${fmtMinutes(windowMin)}. ` +
      `يتّسع الوقت لـ ${fits} مريض فقط — قلّل الحد الأقصى أو دقائق الكشف، أو وسّع وقت النهاية.`,
  };
}
