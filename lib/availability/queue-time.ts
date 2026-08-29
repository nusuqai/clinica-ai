/**
 * Expected clock time for an order-based (queue) appointment.
 *
 * The estimate is position-based and stable: it assumes patients are seen back
 * to back from the session's start time, each taking `estimatedDurationMin`.
 * So order #1 starts at the session start, #2 at start + est, and so on.
 * Shown to patients so they know roughly when to arrive, and to staff on the
 * queue board. Shared by server and client (no server-only imports).
 */

/** "HH:MM" → minutes since midnight, or null if malformed. */
function parseHHMM(hhmm: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

/** Minutes since midnight → "HH:MM" (24h, zero-padded). */
function toHHMM(totalMin: number): string {
  const wrapped = ((totalMin % 1440) + 1440) % 1440;
  const h = Math.floor(wrapped / 60);
  const m = wrapped % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/**
 * Expected start time for a given order, as "HH:MM". Returns null when inputs
 * are missing/invalid (e.g. no estimate configured for the rule).
 */
export function expectedOrderTime(
  sessionStart: string,
  orderNumber: number,
  estimatedDurationMin: number | null,
): string | null {
  const startMin = parseHHMM(sessionStart);
  if (
    startMin == null ||
    estimatedDurationMin == null ||
    estimatedDurationMin < 1 ||
    !Number.isFinite(orderNumber) ||
    orderNumber < 1
  )
    return null;
  return toHHMM(startMin + (orderNumber - 1) * estimatedDurationMin);
}
