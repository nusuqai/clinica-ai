import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { getWebhookConfig, setWebhook } from "@/lib/evolution";

async function assertAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const profile = await prisma.profile.findUnique({
    where: { id: user.id },
    select: { role: true },
  });
  return profile?.role === "ADMIN" ? user : null;
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
