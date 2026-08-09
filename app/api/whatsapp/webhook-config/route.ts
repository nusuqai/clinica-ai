import { NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { getActiveClinicContext } from "@/lib/auth";
import { getWebhookConfig, setWebhook } from "@/lib/evolution";

async function assertAdmin() {
  const ctx = await getActiveClinicContext();
  return ctx && ctx.role === Role.ADMIN ? ctx : null;
}

const WEBHOOK_PATH = "/api/whatsapp/webhook";

// GET — returns current webhook config + whether it matches the expected URL
export async function GET() {
  const admin = await assertAdmin();
  if (!admin)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const config = await getWebhookConfig();
    const expectedUrl = `${process.env.APP_URL}${WEBHOOK_PATH}`;
    return NextResponse.json({
      configured: config?.url === expectedUrl && config?.enabled,
      currentUrl: config?.url ?? null,
      expectedUrl,
    });
  } catch {
    return NextResponse.json(
      { configured: false, currentUrl: null },
      { status: 200 },
    );
  }
}

// POST — sets the webhook URL to APP_URL/api/whatsapp/webhook
export async function POST() {
  const admin = await assertAdmin();
  if (!admin)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const webhookUrl = `${process.env.APP_URL}${WEBHOOK_PATH}`;
  await setWebhook(webhookUrl);
  return NextResponse.json({ ok: true, webhookUrl });
}
