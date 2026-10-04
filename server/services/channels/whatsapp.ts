import "server-only";
import { Channel } from "@prisma/client";
import {
  sendTextMessage,
  sendAudioMessage,
  uploadMedia,
  WhatsAppApiError,
  type WhatsAppRecipient,
  type WhatsAppCredentials,
} from "@/lib/meta/whatsapp";
import { getClinicWhatsappCredentials } from "@/lib/meta/whatsapp-config";
import type {
  ChannelAdapter,
  ChannelRecipient,
  ConversationIdentity,
  DeliveryResult,
  OutboundAudio,
} from "./types";

/** Transport for WhatsApp = what the Cloud API send helpers need (phoneNumberId +
 *  access token). `getClinicWhatsappCredentials` returns a superset of this. */
type Transport = WhatsAppCredentials;

const toRecipient = (to: ChannelRecipient): WhatsAppRecipient => ({
  phone: to.phone ?? null,
  userId: to.userId ?? null,
});

const label = (to: ChannelRecipient) => to.phone ?? to.userId ?? "unknown";

/**
 * WhatsApp Cloud API adapter. Wraps the low-level send helpers so the common
 * reply path never has to know about wamids, the 24-hour service window, or Meta
 * error codes. Never throws: a closed window (131047) or any API error becomes a
 * `delivered: false` result (the reply is already persisted + shown in the inbox;
 * the debounce processor retries delivery).
 */
export const whatsappAdapter: ChannelAdapter<Transport> = {
  channel: Channel.WHATSAPP,
  capabilities: { voiceReply: true },

  getTransport(clinicId: string): Promise<Transport | null> {
    return getClinicWhatsappCredentials(clinicId);
  },

  recipientOf(conversation: ConversationIdentity): ChannelRecipient {
    return { phone: conversation.whatsappPhone, userId: conversation.whatsappUserId };
  },

  async sendText(transport, to, text): Promise<DeliveryResult> {
    try {
      const wamid = await sendTextMessage(toRecipient(to), text, transport);
      return { delivered: true, providerMessageId: wamid };
    } catch (err) {
      if (err instanceof WhatsAppApiError && err.isOutsideServiceWindow) {
        console.error(
          `[whatsapp] reply not delivered to ${label(to)}: 24h service window closed (131047) — only an approved template can reach this contact`
        );
      } else {
        const code = err instanceof WhatsAppApiError ? err.code : undefined;
        console.error(`[whatsapp] reply not delivered to ${label(to)} (code=${code}):`, err);
      }
      return { delivered: false, providerMessageId: null };
    }
  },

  async sendVoice(transport, to, audio: OutboundAudio): Promise<DeliveryResult> {
    try {
      const mediaId = await uploadMedia(transport, audio.bytes, audio.mimeType);
      const wamid = await sendAudioMessage(toRecipient(to), mediaId, transport);
      return { delivered: true, providerMessageId: wamid };
    } catch (err) {
      const code = err instanceof WhatsAppApiError ? err.code : undefined;
      console.error(
        `[whatsapp] voice reply not delivered to ${label(to)} (code=${code}) — caller may fall back to text:`,
        err
      );
      return { delivered: false, providerMessageId: null };
    }
  },
};
