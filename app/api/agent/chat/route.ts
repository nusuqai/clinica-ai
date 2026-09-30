import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getHostClinic } from "@/lib/auth";
import { streamWebAgent, streamGuestWebAgent } from "@/server/services/agentRunner";
import type { AgentStreamEvent } from "@/agent";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
  if (!message)
    return NextResponse.json({ error: "Empty message" }, { status: 400 });

  // Signed-in members chat with their clinic's agent; an anonymous visitor on a
  // clinic host chats as a guest (info-only, told to register before booking —
  // see GUEST_WEB_GUIDE). The guest's clinic comes from the host, since a guest
  // has no membership to resolve it from; on the root domain there is no clinic,
  // so there is nothing to chat with.
  const clinic = user ? null : await getHostClinic();
  if (!user && !clinic) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const run = (): AsyncGenerator<AgentStreamEvent> =>
    user
      ? streamWebAgent(user.id, message)
      : streamGuestWebAgent({ id: clinic!.id, slug: clinic!.slug }, body.conversationId ?? null, message);

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: unknown) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      try {
        for await (const ev of run()) {
          send(ev);
        }
      } catch (e) {
        send({
          type: "error",
          message: e instanceof Error ? e.message : "خطأ غير متوقع",
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
