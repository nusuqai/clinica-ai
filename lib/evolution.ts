const BASE_URL = process.env.EVOLUTION_API_URL!;
const API_KEY = process.env.EVOLUTION_API_KEY!;
const INSTANCE = process.env.EVOLUTION_INSTANCE_NAME!;

function headers() {
  return {
    "Content-Type": "application/json",
    apikey: API_KEY,
  };
}

export type ConnectionStateValue = "open" | "close" | "connecting";

export interface ConnectionState {
  state: ConnectionStateValue;
}

export interface QRCodeData {
  base64?: string; // full data URI or base64 string
  code?: string; // raw QR code string (fallback)
}

export async function getConnectionState(): Promise<ConnectionState> {
  const res = await fetch(`${BASE_URL}/instance/connectionState/${INSTANCE}`, {
    headers: headers(),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Evolution API ${res.status}`);
  const data = await res.json();
  const state: ConnectionStateValue = data.instance?.state ?? "close";
  return { state };
}

export async function getQRCode(): Promise<QRCodeData> {
  const res = await fetch(`${BASE_URL}/instance/connect/${INSTANCE}`, {
    headers: headers(),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Evolution API ${res.status}`);
  const data = await res.json();
  return {
    base64: data.base64 ?? undefined,
    code: data.code ?? undefined,
  };
}

export async function sendTextMessage(
  phone: string,
  text: string,
): Promise<void> {
  const res = await fetch(`${BASE_URL}/message/sendText/${INSTANCE}`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ number: phone, text }),
  });
  if (!res.ok) throw new Error(`Evolution API send ${res.status}`);
}

export async function disconnectInstance(): Promise<void> {
  const res = await fetch(`${BASE_URL}/instance/logout/${INSTANCE}`, {
    method: "DELETE",
    headers: headers(),
  });
  if (!res.ok) throw new Error(`Evolution API logout ${res.status}`);
}

export interface WebhookConfig {
  url: string;
  enabled: boolean;
  events: string[];
}

export async function getWebhookConfig(): Promise<WebhookConfig | null> {
  const res = await fetch(`${BASE_URL}/webhook/find/${INSTANCE}`, {
    headers: headers(),
    cache: "no-store",
  });
  if (!res.ok) return null;
  const data = await res.json();
  // Evolution API v2 returns { webhook: { url, enabled, events } }
  const cfg = data.webhook ?? data;
  return {
    url: cfg.url ?? "",
    enabled: cfg.enabled ?? false,
    events: cfg.events ?? [],
  };
}

export async function setWebhook(webhookUrl: string): Promise<void> {
  const res = await fetch(`${BASE_URL}/webhook/set/${INSTANCE}`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({
      webhook: {
        enabled: true,
        url: webhookUrl,
        webhookByEvents: false,
        webhookBase64: false,
        events: ["MESSAGES_UPSERT"],
      },
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Evolution API setWebhook ${res.status}: ${body}`);
  }
}
