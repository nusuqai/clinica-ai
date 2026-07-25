import "server-only";
import { sendPresence } from "@/lib/evolution";

/** Under WhatsApp's ~10s client-side expiry of a "composing" presence. */
const CHUNK_MS = 8_000;
/** Hard cap so a hung agent run can't keep the loop alive indefinitely. */
const MAX_MS = 90_000;

/**
 * Shows "typing…" on the contact's WhatsApp until the returned stop function
 * is called. Purely cosmetic: it runs detached and swallows its own errors so
 * it can never throw into, or delay, the reply path.
 *
 * Each `sendPresence` call blocks on Evolution's side for `CHUNK_MS` and then
 * emits `paused`, so the indicator has to be re-asserted in a loop. Stopping
 * doesn't cancel the in-flight chunk — it just stops re-firing; that chunk's
 * own `paused`, and the outgoing message itself, clear the indicator.
 */
export function startTypingIndicator(phone: string): () => void {
  let active = true;
  const deadline = Date.now() + MAX_MS;

  void (async () => {
    while (active && Date.now() < deadline) {
      try {
        await sendPresence(phone, "composing", CHUNK_MS);
      } catch (err) {
        // Instance down or number not on WhatsApp — stop rather than retry-storm.
        console.error("WhatsApp typing indicator failed:", err);
        return;
      }
    }
  })();

  return () => {
    active = false;
  };
}
