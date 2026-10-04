import "server-only";
import type { Channel } from "@prisma/client";

/**
 * Channel abstraction — the ONLY thing you implement to add a messaging channel
 * (WhatsApp, Instagram, Messenger, TikTok, …).
 *
 * The agent "brain" (generateAgentReply) and the debounce processor are
 * channel-agnostic: they persist/consolidate messages and run the agent, then
 * hand the reply to an adapter for delivery. A new channel = write its RECEIVE
 * parser + a thin webhook route that calls the common ingest, and a ChannelAdapter
 * whose job is "how do I address this user, and how do I send them a message".
 *
 * Web is the one SYNChronous channel (the reply is returned in the HTTP response),
 * so it does NOT use an adapter — see the web entrypoints in agentRunner.
 */

/** How to address a user on a channel. Different channels key on different ids. */
export interface ChannelRecipient {
  /** E.164 phone (WhatsApp classic). */
  phone?: string | null;
  /** Platform-scoped user id — WhatsApp BSUID, or an IG/Messenger-scoped id. */
  userId?: string | null;
}

/** The conversation fields any adapter may need to build a recipient. */
export interface ConversationIdentity {
  whatsappPhone: string | null;
  whatsappUserId: string | null;
}

/** Outcome of a single delivery attempt. Adapters NEVER throw — a failed send
 *  returns `delivered: false` so the processor can schedule a retry. */
export interface DeliveryResult {
  /** True when the provider accepted the message. */
  delivered: boolean;
  /** Provider message id (e.g. WhatsApp wamid), when one came back. */
  providerMessageId: string | null;
}

/** A synthesized voice reply, ready to upload + send. */
export interface OutboundAudio {
  bytes: Buffer;
  mimeType: string;
}

/**
 * One messaging channel's send side. `T` is the per-clinic transport (resolved
 * credentials/keys) threaded through the send calls.
 */
export interface ChannelAdapter<T = unknown> {
  readonly channel: Channel;

  /** Capabilities that gate optional behaviour (e.g. spoken replies). */
  readonly capabilities: { readonly voiceReply: boolean };

  /** Resolve the clinic's send credentials, or null if the channel isn't
   *  configured for this clinic (→ the processor idles the conversation). */
  getTransport(clinicId: string): Promise<T | null>;

  /** Build the recipient descriptor from the conversation row. */
  recipientOf(conversation: ConversationIdentity): ChannelRecipient;

  /** Deliver a text reply. Must never throw. */
  sendText(transport: T, to: ChannelRecipient, text: string): Promise<DeliveryResult>;

  /** Deliver a spoken reply. Present only when `capabilities.voiceReply`. Must
   *  never throw; a false result lets the caller fall back to text. */
  sendVoice?(transport: T, to: ChannelRecipient, audio: OutboundAudio): Promise<DeliveryResult>;
}
