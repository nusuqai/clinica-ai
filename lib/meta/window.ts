/**
 * The WhatsApp 24-hour customer-service window.
 *
 * Inside it (the contact wrote to us within the last 24h) we may reply with
 * free-form text. Once it closes, Meta refuses free-form text outright — only an
 * approved template gets through. Both the admin inbox (to gate the textarea)
 * and the send action (to defend the rule) share this logic, so it lives in a
 * plain module usable from client and server.
 */

export const WHATSAPP_WINDOW_MS = 24 * 60 * 60 * 1000;

/** True while free-form replies are still allowed for this contact. */
export function isWithinWhatsappWindow(
  lastInboundAt: Date | string | null | undefined,
): boolean {
  if (!lastInboundAt) return false;
  const t = new Date(lastInboundAt).getTime();
  if (Number.isNaN(t)) return false;
  return Date.now() - t < WHATSAPP_WINDOW_MS;
}
