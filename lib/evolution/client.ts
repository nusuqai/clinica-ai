import "server-only";

/**
 * Evolution API v2 client — the unofficial WhatsApp (WhatsApp Web / Baileys)
 * provider. One self-hosted Evolution server serves every clinic; each clinic
 * that picks this provider gets its own *instance* (one linked phone), named in
 * `WhatsappConfig.evolutionInstanceName`.
 *
 * Every call authenticates with the server's global API key
 * (AUTHENTICATION_API_KEY on the Evolution side = EVOLUTION_API_KEY here), so no
 * per-instance secret is stored. Unlike Meta there are no templates and no
 * 24-hour window: free-form messages can be sent at any time.
 */

function config() {
  const baseUrl = process.env.EVOLUTION_API_URL;
  const apiKey = process.env.EVOLUTION_API_KEY;
  if (!baseUrl || !apiKey) {
    throw new EvolutionApiError("EVOLUTION_API_URL / EVOLUTION_API_KEY are not set", 500);
  }
  return { baseUrl: baseUrl.replace(/\/+$/, ""), apiKey };
}

export class EvolutionApiError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
    this.name = "EvolutionApiError";
  }
}

async function evo<T = Record<string, unknown>>(
  method: "GET" | "POST" | "DELETE",
  path: string,
  body?: unknown
): Promise<T> {
  const { baseUrl, apiKey } = config();
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers: { "Content-Type": "application/json", apikey: apiKey },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
  });
  const text = await res.text();
  let json: unknown = {};
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    /* non-JSON error page — keep the raw text for the message */
  }
  if (!res.ok) {
    const r = (json as { response?: { message?: unknown } }).response;
    const detail = r?.message ? JSON.stringify(r.message) : text.slice(0, 300);
    throw new EvolutionApiError(
      `Evolution ${method} ${path} → ${res.status}: ${detail}`,
      res.status
    );
  }
  return json as T;
}

const enc = encodeURIComponent;

// ─── Instance lifecycle ──────────────────────────────────────────────────────

/** Events the app's webhook handles. */
const WEBHOOK_EVENTS = ["MESSAGES_UPSERT", "CONNECTION_UPDATE"];

function webhookBlock(url: string) {
  return {
    enabled: true,
    url,
    byEvents: false,
    base64: false,
    events: WEBHOOK_EVENTS,
  };
}

/**
 * Creates an instance wired to the clinic's webhook URL. Passing `number`
 * (digits, with country code) makes Evolution also return a pairing code for
 * "Link with phone number instead".
 */
export async function createInstance(
  instanceName: string,
  webhookUrl: string,
  number?: string
): Promise<QrState> {
  const res = await evo<{ qrcode?: RawQr }>("POST", "/instance/create", {
    instanceName,
    integration: "WHATSAPP-BAILEYS",
    qrcode: true,
    ...(number ? { number } : {}),
    // Patients only — never answer group chats.
    groupsIgnore: true,
    alwaysOnline: false,
    readMessages: false,
    syncFullHistory: false,
    webhook: webhookBlock(webhookUrl),
  });
  return toQrState(res.qrcode);
}

/** Re-points an existing instance's webhook (e.g. after APP URL changes). */
export async function setInstanceWebhook(instanceName: string, webhookUrl: string): Promise<void> {
  await evo("POST", `/webhook/set/${enc(instanceName)}`, { webhook: webhookBlock(webhookUrl) });
}

export type ConnectionState = "open" | "connecting" | "close";

export async function getConnectionState(instanceName: string): Promise<ConnectionState> {
  const res = await evo<{ instance?: { state?: string } }>(
    "GET",
    `/instance/connectionState/${enc(instanceName)}`
  );
  const state = res.instance?.state;
  return state === "open" || state === "connecting" ? state : "close";
}

type RawQr = { base64?: string | null; code?: string | null; pairingCode?: string | null };

export interface QrState {
  /** `data:image/png;base64,…` — render straight into an <img>. */
  qrDataUrl: string | null;
  /** 8-char code for "Link with phone number instead", when a number was given. */
  pairingCode: string | null;
}

function toQrState(raw: RawQr | undefined): QrState {
  const b64 = raw?.base64 || null;
  return {
    qrDataUrl: b64 ? (b64.startsWith("data:") ? b64 : `data:image/png;base64,${b64}`) : null,
    pairingCode: raw?.pairingCode || null,
  };
}

/** Starts (or resumes) linking and returns a fresh QR / pairing code. */
export async function connectInstance(instanceName: string, number?: string): Promise<QrState> {
  const q = number ? `?number=${enc(number)}` : "";
  const res = await evo<RawQr>("GET", `/instance/connect/${enc(instanceName)}${q}`);
  return toQrState(res);
}

/** The linked phone's number and profile name, once connected. */
export async function getInstanceOwner(
  instanceName: string
): Promise<{ phone: string | null; profileName: string | null }> {
  const res = await evo<Array<{ ownerJid?: string | null; profileName?: string | null }>>(
    "GET",
    `/instance/fetchInstances?instanceName=${enc(instanceName)}`
  );
  const row = Array.isArray(res) ? res[0] : undefined;
  return {
    phone: row?.ownerJid ? row.ownerJid.split("@")[0].split(":")[0] : null,
    profileName: row?.profileName ?? null,
  };
}

/** Logs the phone out and deletes the instance. Tolerates an already-gone one. */
export async function destroyInstance(instanceName: string): Promise<void> {
  await evo("DELETE", `/instance/logout/${enc(instanceName)}`).catch(() => {});
  try {
    await evo("DELETE", `/instance/delete/${enc(instanceName)}`);
  } catch (err) {
    if (err instanceof EvolutionApiError && err.status === 404) return;
    throw err;
  }
}

// ─── Addressing ──────────────────────────────────────────────────────────────

export interface EvolutionRecipient {
  /** Digits with country code — `…@s.whatsapp.net` on the wire. */
  phone?: string | null;
  /** A full JID (e.g. `…@lid`) when WhatsApp hides the phone number. */
  userId?: string | null;
}

/** What goes in Evolution's `number` field: digits, or a full JID as-is. */
function toNumber(to: EvolutionRecipient): string {
  if (to.phone) return to.phone.replace(/\D/g, "");
  if (to.userId) return to.userId;
  throw new EvolutionApiError("outbound message has no recipient (neither phone nor JID)", 400);
}

/** The remote JID for chat-level calls (presence, read receipts). */
function toJid(to: EvolutionRecipient): string {
  const n = toNumber(to);
  return n.includes("@") ? n : `${n}@s.whatsapp.net`;
}

// ─── Sending ─────────────────────────────────────────────────────────────────

export interface EvolutionSendOptions {
  /** Id of the message to quote (swipe-to-reply bubble). */
  replyToId?: string | null;
}

function quoted(options?: EvolutionSendOptions) {
  return options?.replyToId ? { quoted: { key: { id: options.replyToId } } } : {};
}

type SendResponse = { key?: { id?: string } };
const sentId = (res: SendResponse) => res.key?.id ?? null;

/** Sends a text message. Returns the WhatsApp message id. */
export async function sendText(
  instanceName: string,
  to: EvolutionRecipient,
  text: string,
  options?: EvolutionSendOptions
): Promise<string | null> {
  const res = await evo<SendResponse>("POST", `/message/sendText/${enc(instanceName)}`, {
    number: toNumber(to),
    text,
    linkPreview: true,
    ...quoted(options),
  });
  return sentId(res);
}

export type EvolutionMediaType = "image" | "video" | "audio" | "document";

/** Sends a file (raw bytes, base64-encoded on the wire). */
export async function sendMedia(
  instanceName: string,
  to: EvolutionRecipient,
  media: {
    mediaType: EvolutionMediaType;
    bytes: Buffer;
    mimeType: string;
    caption?: string;
    fileName?: string;
  },
  options?: EvolutionSendOptions
): Promise<string | null> {
  const res = await evo<SendResponse>("POST", `/message/sendMedia/${enc(instanceName)}`, {
    number: toNumber(to),
    mediatype: media.mediaType,
    mimetype: media.mimeType,
    media: media.bytes.toString("base64"),
    ...(media.caption ? { caption: media.caption } : {}),
    ...(media.fileName ? { fileName: media.fileName } : {}),
    ...quoted(options),
  });
  return sentId(res);
}

/**
 * Sends audio as a voice note (push-to-talk bubble with waveform). Evolution
 * transcodes to OGG/Opus itself, so any audio format works.
 */
export async function sendVoiceNote(
  instanceName: string,
  to: EvolutionRecipient,
  bytes: Buffer,
  options?: EvolutionSendOptions
): Promise<string | null> {
  const res = await evo<SendResponse>("POST", `/message/sendWhatsAppAudio/${enc(instanceName)}`, {
    number: toNumber(to),
    audio: bytes.toString("base64"),
    ...quoted(options),
  });
  return sentId(res);
}

/** Blue ticks on a contact's message. */
export async function markRead(
  instanceName: string,
  from: EvolutionRecipient,
  messageId: string
): Promise<void> {
  await evo("POST", `/chat/markMessageAsRead/${enc(instanceName)}`, {
    readMessages: [{ remoteJid: toJid(from), fromMe: false, id: messageId }],
  });
}

/**
 * Shows "typing…" for `delayMs`. Evolution holds the request open for the whole
 * delay and then sends "paused" — call it detached.
 */
export async function sendTyping(
  instanceName: string,
  to: EvolutionRecipient,
  delayMs: number
): Promise<void> {
  await evo("POST", `/chat/sendPresence/${enc(instanceName)}`, {
    number: toNumber(to),
    presence: "composing",
    delay: delayMs,
  });
}

// ─── Inbound media ───────────────────────────────────────────────────────────

/**
 * Downloads an inbound message's media by its message id. Evolution looks the
 * message up in its own database (DATABASE_SAVE_DATA_NEW_MESSAGE must be on),
 * decrypts the WhatsApp media and returns it base64-encoded.
 */
export async function downloadMessageMedia(
  instanceName: string,
  messageId: string
): Promise<{ bytes: Buffer; mimeType: string }> {
  const res = await evo<{ base64?: string; mimetype?: string }>(
    "POST",
    `/chat/getBase64FromMediaMessage/${enc(instanceName)}`,
    { message: { key: { id: messageId } }, convertToMp4: false }
  );
  if (!res.base64) {
    throw new EvolutionApiError(`no media returned for message ${messageId}`, 404);
  }
  return {
    bytes: Buffer.from(res.base64, "base64"),
    mimeType: res.mimetype || "application/octet-stream",
  };
}
