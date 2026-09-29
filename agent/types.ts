import type { Role, Channel } from "@prisma/client";

/**
 * Per-request identity the agent acts on behalf of. Every tool authorizes
 * against this — the agent can only ever do what this actor is allowed to do.
 *
 * `role` is the effective role driving tool selection:
 *   - PATIENT | DOCTOR | ADMIN → an identified user (web always; WhatsApp when
 *     the phone matches a profile).
 *   - null → an unknown WhatsApp contact (info-only tools, no actions).
 */
export interface AgentContext {
  actorId: string | null;
  role: Role | null;
  /** The clinic (tenant) this conversation belongs to; scopes every tool. */
  clinicId: string;
  /** The clinic's URL slug — used to build public links (e.g. the register page). */
  clinicSlug: string;
  /**
   * The contact's WhatsApp number (wa_id, e.g. "201014443991"), or null on web.
   * Used to prefill the register link so the phone matches their WhatsApp number.
   */
  contactPhone: string | null;
  channel: Channel;
  conversationId: string;
  sessionId: string;
  /** Display name used to greet the contact. */
  actorName: string;
}

/**
 * One tool invocation, captured during a run and persisted on the AGENT
 * message so the web chat can re-render its rich card after reload.
 * `id` links the AIMessage tool_call to its ToolMessage when rebuilding history.
 */
export interface ToolCallRecord {
  id: string;
  name: string;
  args: Record<string, unknown>;
  result: unknown;
  status: "ok" | "error";
}

/**
 * Voice-note metadata (issue #49), attached to `Message.metadata.voice`. The
 * audio bytes live in Supabase Storage at `storagePath`; the transcript is kept
 * here so a message is transcribed exactly once and history reads never re-hit
 * the audio. Present on USER voice messages, and on AGENT messages when the
 * clinic replied with synthesized speech.
 */
export interface VoiceMessageMetadata {
  /** Object path in the patient-media bucket (not a URL — signed on demand). */
  storagePath: string;
  mimeType: string;
  /** Audio length in seconds; null when it couldn't be determined. */
  durationSec: number | null;
  /** Empty on an AGENT (TTS) message or a failed transcription. */
  transcript: string;
  /** Model that produced (STT) or spoke (TTS) this audio. */
  model: string;
  status: "transcribed" | "failed" | "spoken";
}

/**
 * A downloadable media attachment a patient sent over WhatsApp, archived to the
 * private bucket so the clinic keeps a record independent of WhatsApp (the bytes
 * live at `storagePath`; the DB only points at them). Only `image` is ever read
 * by the agent — and only when the clinic enabled image analysis: the one-time
 * vision description then lives in `analysis`, so the image is never re-read and
 * every later turn reuses that text. All other kinds are archive-only.
 */
export interface MediaAttachmentMetadata {
  kind: "image" | "video" | "audio" | "document" | "sticker";
  /** Object path in the patient-media bucket (not a URL — signed on demand). */
  storagePath: string;
  mimeType: string;
  /** Original filename, for documents. */
  filename?: string;
  /** Caption the patient attached to the media, if any. */
  caption?: string;
  /** Byte length of the stored object. */
  sizeBytes?: number;
  /** Intrinsic pixel dimensions of an image, when known (staff-sent images) —
   *  lets the UI reserve exact space and avoid layout shift. */
  width?: number;
  height?: number;
  /**
   * The one-time vision description of an image (Arabic), reused on every later
   * turn so the image is transcribed-to-text exactly once. Present only on an
   * `image` the agent was allowed to read; absent when analysis was off.
   */
  analysis?: string;
  /** Model that produced `analysis` (snapshot for the record). */
  analysisModel?: string;
}

/**
 * A structured (non-file) WhatsApp message — a shared location, contact card, or
 * catalog order. There are no bytes to store, so the raw payload is kept here for
 * the record and a human-readable summary is the message content. Archive-only:
 * the agent never acts on these; a human is escalated.
 */
export interface StructuredMessageMetadata {
  kind: "location" | "contacts" | "order";
  /** The raw Cloud API sub-object (location/contacts/order), kept verbatim. */
  data: unknown;
}

export interface AgentMessageMetadata {
  toolCalls?: ToolCallRecord[];
  voice?: VoiceMessageMetadata;
  /** A downloadable media attachment (image/video/document/sticker/audio). */
  media?: MediaAttachmentMetadata;
  /** A structured message (location/contacts/order). */
  structured?: StructuredMessageMetadata;
}

/**
 * Token usage for a single agent turn, summed across the (possibly several) LLM
 * calls a ReAct turn makes. Fed to the credit service to compute + charge cost.
 * `model` is the model name the provider actually billed, snapshotted per turn.
 */
export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  model: string;
}
