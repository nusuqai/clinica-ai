import "server-only";
import { Channel } from "@prisma/client";
import type { ChannelAdapter } from "./types";
import { whatsappAdapter } from "./whatsapp";

export type { ChannelAdapter, ChannelRecipient, DeliveryResult, OutboundAudio } from "./types";

/**
 * Registry of send-side channel adapters, keyed by `Channel`.
 *
 * To add a push channel (Instagram, Messenger, TikTok, …): implement its
 * ChannelAdapter in ./<channel>.ts and register it here — the debounce processor
 * and the agent brain pick it up by `conversation.channel` with no other change.
 *
 * WEB is intentionally absent: it is the one SYNChronous channel (the reply is
 * returned in the HTTP response, not pushed), so it has no send adapter.
 */
const registry: Partial<Record<Channel, ChannelAdapter>> = {
  [Channel.WHATSAPP]: whatsappAdapter,
};

/** The adapter for a channel, or null when that channel has no send side (WEB). */
export function getChannelAdapter(channel: Channel): ChannelAdapter | null {
  return registry[channel] ?? null;
}
