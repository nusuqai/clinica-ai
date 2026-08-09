import "server-only";
import { markReadAndStartTyping, type WhatsAppCredentials } from "@/lib/meta/whatsapp";

/**
 * Marks the contact's message read and shows "typing…" while the agent runs.
 *
 * Cloud API needs no keep-alive loop: one call raises the indicator and Meta
 * clears it when our reply arrives, or after ~25 seconds if the agent is still
 * thinking. There is nothing to cancel, so this returns void rather than a stop
 * function.
 *
 * Purely cosmetic — it runs detached and swallows its own errors so it can
 * never throw into, or delay, the reply path.
 */
export function showTypingIndicator(
  messageId: string,
  creds: WhatsAppCredentials,
): void {
  void markReadAndStartTyping(messageId, creds).catch((err) => {
    console.error("WhatsApp typing indicator failed:", err);
  });
}
