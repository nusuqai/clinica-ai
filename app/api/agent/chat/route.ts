import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getHostClinic } from "@/lib/auth";
import { webAgentReply, guestWebAgentReply } from "@/server/services/channels/web";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Web chat (text) — synchronous JSON (no SSE). Runs the common agent brain and
 * returns the reply in one response; the widget shows a typing indicator while it
 * waits. A signed-in member chats with their clinic's agent; an anonymous visitor
 * on a clinic host chats as a guest (info-only). On the root domain there is no
 * clinic to chat with.
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let body: { message?: string; conversationId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const message = body.message?.trim();
  if (!message) return NextResponse.json({ error: "Empty message" }, { status: 400 });

  const clinic = user ? null : await getHostClinic();
  if (!user && !clinic) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = user
      ? await webAgentReply(user.id, message)
      : await guestWebAgentReply({ id: clinic!.id, slug: clinic!.slug }, body.conversationId ?? null, message);
    return NextResponse.json(result);
  } catch (e) {
    console.error("[web-chat] reply failed:", e);
    return NextResponse.json({ error: "خطأ غير متوقع" }, { status: 500 });
  }
}
