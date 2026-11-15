import "server-only";
import { Channel } from "@prisma/client";
import { WhatsAppApiError } from "@/lib/meta/whatsapp";
import { EvolutionApiError } from "@/lib/evolution/client";
import {
  getClinicWhatsappTransport,
  sendWhatsAppText,
  sendWhatsAppVoice,
  type WhatsAppTransport,
} from "@/lib/whatsapp/transport";
import type {
  ChannelAdapter,
  ChannelRecipient,
  ConversationIdentity,
  DeliveryResult,
  OutboundAudio,
} from "./types";

const label = (to: ChannelRecipient) => to.phone ?? to.userId ?? "unknown";

/** Logs a failed send with whatever the provider told us. */
function logFailure(kind: string, to: ChannelRecipient, err: unknown): void {
  if (err instanceof WhatsAppApiError && err.isOutsideServiceWindow) {
    console.error(
      `[whatsapp] ${kind} not delivered to ${label(to)}: 24h service window closed (131047) — only an approved template can reach this contact`
    );
    return;
  }
  const code =
    err instanceof WhatsAppApiError
      ? `meta code=${err.code}`
      : err instanceof EvolutionApiError
        ? `evolution status=${err.status}`
        : "unknown";
  console.error(`[whatsapp] ${kind} not delivered to ${label(to)} (${code}):`, err);
}

/**
 * WhatsApp adapter — covers both providers (official Cloud API and Evolution)
 * through lib/whatsapp/transport, so the common reply path never has to know
 * which one a clinic uses, nor about wamids, the 24-hour window, or provider
 * error codes. Never throws: any API error becomes a `delivered: false` result
 * (the reply is already persisted + shown in the inbox; the debounce processor
 * retries delivery).
 */
export const whatsappAdapter: ChannelAdapter<WhatsAppTransport> = {
  channel: Channel.WHATSAPP,
  capabilities: { voiceReply: true },

  getTransport(clinicId: string): Promise<WhatsAppTransport | null> {
    return getClinicWhatsappTransport(clinicId);
  },

  recipientOf(conversation: ConversationIdentity): ChannelRecipient {
    return { phone: conversation.whatsappPhone, userId: conversation.whatsappUserId };
  },

  async sendText(transport, to, text): Promise<DeliveryResult> {
    try {
      const id = await sendWhatsAppText(transport, to, text);
      return { delivered: true, providerMessageId: id };
    } catch (err) {
      logFailure("reply", to, err);
      return { delivered: false, providerMessageId: null };
    }
  },

  async sendVoice(transport, to, audio: OutboundAudio): Promise<DeliveryResult> {
    try {
      const id = await sendWhatsAppVoice(transport, to, audio);
      return { delivered: true, providerMessageId: id };
    } catch (err) {
      logFailure("voice reply (caller may fall back to text)", to, err);
      return { delivered: false, providerMessageId: null };
    }
  },
};
