/**
 * WhatsApp Cloud API client (Meta official).
 *
 * Every outbound call — free-form replies, template sends, and template
 * management — goes through here. Credentials are always passed in by the
 * caller (loaded per-clinic from `lib/meta/whatsapp-config.ts`); nothing here
 * reaches for env or a default number.
 */

/** Graph API version. Meta supports each for ~2 years; bump when the App
 *  Dashboard starts showing a newer one. */
const GRAPH_VERSION = process.env.META_GRAPH_VERSION ?? "v23.0";
const GRAPH_BASE = "https://graph.facebook.com";

/** Credentials for sending to a recipient (the sender id goes in the URL). */
export interface WhatsAppCredentials {
  phoneNumberId: string;
  /** System user token. The dashboard's temporary token expires after 24h. */
  accessToken: string;
}

/**
 * A Cloud API rejection, with Meta's numeric code preserved. `code` is worth
 * branching on: 131047 means the 24-hour customer service window has closed
 * and only an approved template will get through.
 */
export class WhatsAppApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: number,
  ) {
    super(message);
    this.name = "WhatsAppApiError";
  }

  /** Window expired — free-form text is refused, a template is required. */
  get isOutsideServiceWindow(): boolean {
    return this.code === 131047;
  }
}

/** Cloud API wants digits only: country code, no "+", spaces or dashes. */
function normalisePhone(phone: string): string {
  return phone.replace(/\D/g, "");
}

/**
 * The agent (and templates) speak Markdown, but WhatsApp does not render it —
 * a `[label](url)` link shows up literally, brackets and all. Convert the
 * common Markdown constructs to WhatsApp's own formatting so replies read
 * cleanly. WhatsApp auto-links bare URLs, so links become plain text.
 */
export function markdownToWhatsApp(text: string): string {
  return (
    text
      // Images `![alt](url)` → just the url.
      .replace(/!\[[^\]]*\]\((\S+?)\)/g, "$1")
      // Links `[label](url)`: drop the brackets. If the label is the url (or a
      // trimmed variant of it), keep only the url; otherwise "label: url".
      .replace(/\[([^\]]+)\]\((\S+?)\)/g, (_m, label: string, url: string) => {
        const l = label.trim();
        return l === url || l === url.replace(/^https?:\/\//, "") ? url : `${l}: ${url}`;
      })
      // Bold `**text**` / `__text__` → WhatsApp bold `*text*`.
      .replace(/\*\*([^*]+)\*\*/g, "*$1*")
      .replace(/__([^_]+)__/g, "*$1*")
      // Strikethrough `~~text~~` → WhatsApp `~text~`.
      .replace(/~~([^~]+)~~/g, "~$1~")
      // Headings `## text` → plain (WhatsApp has no headings).
      .replace(/^#{1,6}\s+/gm, "")
  );
}

interface GraphRequest {
  path: string;
  accessToken: string;
  method?: "GET" | "POST" | "DELETE";
  body?: Record<string, unknown>;
  query?: Record<string, string>;
}

async function graphFetch({
  path,
  accessToken,
  method = "POST",
  body,
  query,
}: GraphRequest): Promise<Record<string, unknown>> {
  const url = new URL(`${GRAPH_BASE}/${GRAPH_VERSION}/${path}`);
  for (const [k, v] of Object.entries(query ?? {})) url.searchParams.set(k, v);

  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;

  if (!res.ok) {
    const error = json.error as { message?: string; code?: number } | undefined;
    throw new WhatsAppApiError(
      error?.message ?? `WhatsApp Cloud API ${res.status}`,
      res.status,
      error?.code,
    );
  }

  return json;
}

/** POSTs to the sender's `/messages` endpoint. */
function sendMessage(
  creds: WhatsAppCredentials,
  message: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  return graphFetch({
    path: `${creds.phoneNumberId}/messages`,
    accessToken: creds.accessToken,
    body: { messaging_product: "whatsapp", ...message },
  });
}

/**
 * How to address an outbound message. A classic contact is reached by phone
 * (`to`); a contact whose phone is hidden behind a WhatsApp username is reached
 * by their Business-Scoped User ID (`recipient`) — Meta's send API accepts the
 * BSUID there instead of a phone. A plain string is treated as a phone number
 * for backward compatibility.
 */
export type WhatsAppRecipient = string | { phone?: string | null; userId?: string | null };

/** Builds the addressing field(s) for a send. Prefers phone when available. */
function recipientAddress(recipient: WhatsAppRecipient): Record<string, string> {
  const r = typeof recipient === "string" ? { phone: recipient } : recipient;
  if (r.phone) return { to: normalisePhone(r.phone) };
  if (r.userId) return { recipient: r.userId };
  // No phone and no BSUID — nothing to send to. Surface it rather than POST a
  // malformed body that Meta would reject with an opaque error.
  throw new WhatsAppApiError(
    "outbound message has no recipient (neither phone nor BSUID)",
    400,
  );
}

/** Cloud API caps a text body at 4096 characters. */
const MAX_BODY_LENGTH = 4096;

/**
 * Splits an over-long reply on paragraph/line boundaries where possible, so a
 * verbose agent answer arrives as several messages instead of being rejected.
 */
function chunkText(text: string): string[] {
  if (text.length <= MAX_BODY_LENGTH) return [text];

  const chunks: string[] = [];
  let rest = text;
  while (rest.length > MAX_BODY_LENGTH) {
    const slice = rest.slice(0, MAX_BODY_LENGTH);
    // Prefer a paragraph break, then any line break, then a hard cut.
    const cut = Math.max(slice.lastIndexOf("\n\n"), slice.lastIndexOf("\n"));
    const at = cut > MAX_BODY_LENGTH / 2 ? cut : MAX_BODY_LENGTH;
    chunks.push(rest.slice(0, at).trim());
    rest = rest.slice(at).trim();
  }
  if (rest) chunks.push(rest);
  return chunks;
}

/**
 * Sends a free-form text message. Only works inside the 24-hour customer
 * service window — outside it Meta rejects the call with code 131047 and an
 * approved template is the only option.
 */
export async function sendTextMessage(
  recipient: WhatsAppRecipient,
  text: string,
  creds: WhatsAppCredentials,
): Promise<void> {
  const address = recipientAddress(recipient);
  for (const body of chunkText(markdownToWhatsApp(text))) {
    await sendMessage(creds, {
      recipient_type: "individual",
      ...address,
      type: "text",
      text: { preview_url: true, body },
    });
  }
}

/**
 * Sends an approved template. Unlike free-form text this is allowed outside the
 * 24-hour window — it is the only thing that is. `variables` fill the body's
 * `{{1}}`, `{{2}}`… placeholders in order.
 */
export async function sendTemplateMessage(
  recipient: WhatsAppRecipient,
  template: { name: string; languageCode: string; variables?: string[] },
  creds: WhatsAppCredentials,
): Promise<void> {
  const components =
    template.variables && template.variables.length > 0
      ? [
          {
            type: "body",
            parameters: template.variables.map((text) => ({
              type: "text",
              text,
            })),
          },
        ]
      : undefined;

  await sendMessage(creds, {
    ...recipientAddress(recipient),
    type: "template",
    template: {
      name: template.name,
      language: { code: template.languageCode },
      ...(components ? { components } : {}),
    },
  });
}

/**
 * Marks the contact's message as read (blue ticks) and raises the "typing…"
 * indicator in one call. Meta clears it when our reply arrives, or after
 * ~25 seconds — there is nothing to hold open or cancel.
 */
export async function markReadAndStartTyping(
  messageId: string,
  creds: WhatsAppCredentials,
): Promise<void> {
  await graphFetch({
    path: `${creds.phoneNumberId}/messages`,
    accessToken: creds.accessToken,
    body: {
      messaging_product: "whatsapp",
      status: "read",
      message_id: messageId,
      typing_indicator: { type: "text" },
    },
  });
}

// ─── Template management (WABA node) ─────────────────────────────────────────

export type TemplateStatus =
  | "APPROVED"
  | "PENDING"
  | "REJECTED"
  | "PAUSED"
  | "DISABLED"
  | (string & {});

export type TemplateCategory = "MARKETING" | "UTILITY" | "AUTHENTICATION";

/** A button attached to a template. We support the three most common types. */
export type TemplateButtonType = "QUICK_REPLY" | "URL" | "PHONE_NUMBER";

export interface TemplateButton {
  type: TemplateButtonType;
  text: string;
  /** For URL buttons. */
  url?: string;
  /** For PHONE_NUMBER buttons. */
  phoneNumber?: string;
}

export interface MessageTemplate {
  id: string;
  name: string;
  status: TemplateStatus;
  category: string;
  language: string;
  /** Optional TEXT header ("title"), with `{{n}}` placeholders left in. */
  headerText: string;
  /** The BODY component text, with `{{n}}` placeholders left in. */
  bodyText: string;
  /** Optional FOOTER text. */
  footerText: string;
  /** Buttons on the template (empty if none). */
  buttons: TemplateButton[];
  /** Number of `{{n}}` placeholders in the body — how many inputs to render. */
  variableCount: number;
}

interface RawButton {
  type?: string;
  text?: string;
  url?: string;
  phone_number?: string;
}

interface RawComponent {
  type?: string;
  format?: string;
  text?: string;
  buttons?: RawButton[];
}

/** Pulls the display-relevant pieces out of a template's components array. */
function extractComponents(components: RawComponent[] | undefined): {
  headerText: string;
  bodyText: string;
  footerText: string;
  buttons: TemplateButton[];
  variableCount: number;
} {
  const find = (type: string) =>
    components?.find((c) => c.type?.toUpperCase() === type);

  const header = find("HEADER");
  // Only TEXT headers carry text we can render; media headers have no `text`.
  const headerText =
    header?.format?.toUpperCase() === "TEXT" ? (header.text ?? "") : "";
  const bodyText = find("BODY")?.text ?? "";
  const footerText = find("FOOTER")?.text ?? "";

  const rawButtons = find("BUTTONS")?.buttons ?? [];
  const buttons: TemplateButton[] = rawButtons
    .map((b): TemplateButton | null => {
      const type = b.type?.toUpperCase();
      if (type === "QUICK_REPLY" || type === "URL" || type === "PHONE_NUMBER") {
        return {
          type,
          text: b.text ?? "",
          url: b.url,
          phoneNumber: b.phone_number,
        };
      }
      return null;
    })
    .filter((b): b is TemplateButton => b !== null);

  const matches = bodyText.match(/\{\{\s*\d+\s*\}\}/g);
  return {
    headerText,
    bodyText,
    footerText,
    buttons,
    variableCount: matches ? matches.length : 0,
  };
}

/** Lists all message templates for a WABA, with their approval status. */
export async function listMessageTemplates(
  accessToken: string,
  wabaId: string,
): Promise<MessageTemplate[]> {
  const json = await graphFetch({
    path: `${wabaId}/message_templates`,
    accessToken,
    method: "GET",
    query: { fields: "id,name,status,category,language,components", limit: "100" },
  });

  const data = Array.isArray(json.data) ? json.data : [];
  return data.map((raw) => {
    const t = raw as Record<string, unknown>;
    const { headerText, bodyText, footerText, buttons, variableCount } =
      extractComponents(t.components as RawComponent[] | undefined);
    return {
      id: String(t.id ?? ""),
      name: String(t.name ?? ""),
      status: String(t.status ?? "") as TemplateStatus,
      category: String(t.category ?? ""),
      language: String(t.language ?? ""),
      headerText,
      bodyText,
      footerText,
      buttons,
      variableCount,
    };
  });
}

export interface CreateTemplateInput {
  /** Lowercase letters, digits and underscores only (Meta requirement). */
  name: string;
  category: TemplateCategory;
  /** BCP-47-ish language code, e.g. `ar` or `en_US`. */
  language: string;
  /** Optional TEXT header ("title"). Kept static (no variables) for now. */
  headerText?: string;
  /** Body text; use `{{1}}`, `{{2}}`… for variables. */
  bodyText: string;
  /** Optional short footer line. */
  footerText?: string;
  /** Optional buttons (quick-reply / URL / phone). Kept static (no variables). */
  buttons?: TemplateButton[];
  /** Example values for each body variable — Meta requires them to review. */
  bodyExamples?: string[];
}

/** Maps our button shape to the Cloud API's component button shape. */
function toApiButton(b: TemplateButton): Record<string, unknown> {
  switch (b.type) {
    case "URL":
      return { type: "URL", text: b.text, url: b.url };
    case "PHONE_NUMBER":
      return { type: "PHONE_NUMBER", text: b.text, phone_number: b.phoneNumber };
    case "QUICK_REPLY":
    default:
      return { type: "QUICK_REPLY", text: b.text };
  }
}

/**
 * Submits a new template to Meta for approval. Approval happens asynchronously
 * (minutes to hours); the returned status is usually `PENDING`.
 */
export async function createMessageTemplate(
  accessToken: string,
  wabaId: string,
  input: CreateTemplateInput,
): Promise<{ id: string; status: string }> {
  // Component order matters to Meta: HEADER, BODY, FOOTER, BUTTONS.
  const components: Record<string, unknown>[] = [];
  if (input.headerText?.trim()) {
    components.push({
      type: "HEADER",
      format: "TEXT",
      text: input.headerText.trim(),
    });
  }
  components.push({
    type: "BODY",
    text: input.bodyText,
    ...(input.bodyExamples && input.bodyExamples.length > 0
      ? { example: { body_text: [input.bodyExamples] } }
      : {}),
  });
  if (input.footerText?.trim()) {
    components.push({ type: "FOOTER", text: input.footerText.trim() });
  }
  if (input.buttons && input.buttons.length > 0) {
    components.push({
      type: "BUTTONS",
      buttons: input.buttons.map(toApiButton),
    });
  }

  const json = await graphFetch({
    path: `${wabaId}/message_templates`,
    accessToken,
    body: {
      name: input.name,
      category: input.category,
      language: input.language,
      components,
    },
  });

  return { id: String(json.id ?? ""), status: String(json.status ?? "PENDING") };
}

/** Deletes a template by name (removes every language version). */
export async function deleteMessageTemplate(
  accessToken: string,
  wabaId: string,
  name: string,
): Promise<void> {
  await graphFetch({
    path: `${wabaId}/message_templates`,
    accessToken,
    method: "DELETE",
    query: { name },
  });
}
