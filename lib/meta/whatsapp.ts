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
  phone: string,
  text: string,
  creds: WhatsAppCredentials,
): Promise<void> {
  for (const body of chunkText(text)) {
    await sendMessage(creds, {
      recipient_type: "individual",
      to: normalisePhone(phone),
      type: "text",
      text: { preview_url: false, body },
    });
  }
}

/**
 * Sends an approved template. Unlike free-form text this is allowed outside the
 * 24-hour window — it is the only thing that is. `variables` fill the body's
 * `{{1}}`, `{{2}}`… placeholders in order.
 */
export async function sendTemplateMessage(
  phone: string,
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
    to: normalisePhone(phone),
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

export interface MessageTemplate {
  id: string;
  name: string;
  status: TemplateStatus;
  category: string;
  language: string;
  /** The BODY component text, with `{{n}}` placeholders left in. */
  bodyText: string;
  /** Number of `{{n}}` placeholders in the body — how many inputs to render. */
  variableCount: number;
}

interface RawComponent {
  type?: string;
  text?: string;
}

function extractBody(components: RawComponent[] | undefined): {
  bodyText: string;
  variableCount: number;
} {
  const body = components?.find((c) => c.type?.toUpperCase() === "BODY");
  const bodyText = body?.text ?? "";
  const matches = bodyText.match(/\{\{\s*\d+\s*\}\}/g);
  return { bodyText, variableCount: matches ? matches.length : 0 };
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
    const { bodyText, variableCount } = extractBody(
      t.components as RawComponent[] | undefined,
    );
    return {
      id: String(t.id ?? ""),
      name: String(t.name ?? ""),
      status: String(t.status ?? "") as TemplateStatus,
      category: String(t.category ?? ""),
      language: String(t.language ?? ""),
      bodyText,
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
  /** Body text; use `{{1}}`, `{{2}}`… for variables. */
  bodyText: string;
  /** Optional short footer line. */
  footerText?: string;
  /** Example values for each body variable — Meta requires them to review. */
  bodyExamples?: string[];
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
  const components: Record<string, unknown>[] = [
    {
      type: "BODY",
      text: input.bodyText,
      ...(input.bodyExamples && input.bodyExamples.length > 0
        ? { example: { body_text: [input.bodyExamples] } }
        : {}),
    },
  ];
  if (input.footerText?.trim()) {
    components.push({ type: "FOOTER", text: input.footerText.trim() });
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
