import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { streamWebVoiceAgent } from "@/server/services/agentRunner";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Max accepted recording size (~25 MB, matching the storage bucket limit). */
const MAX_AUDIO_BYTES = 25 * 1024 * 1024;

/**
 * Web chat voice turn (issue #49): accepts a recorded audio blob (multipart
 * form field `audio`), transcribes it, and streams the agent reply as SSE —
 * same event protocol as `/api/agent/chat`, plus a `transcript` event.
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
  }

  const file = form.get("audio");
  if (!(file instanceof Blob) || file.size === 0) {
    return NextResponse.json({ error: "Empty audio" }, { status: 400 });
  }
  if (file.size > MAX_AUDIO_BYTES) {
    return NextResponse.json({ error: "Audio too large" }, { status: 413 });
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  const mimeType = file.type || "audio/webm";

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: unknown) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      try {
        for await (const ev of streamWebVoiceAgent(user.id, { bytes, mimeType })) {
          send(ev);
        }
      } catch (e) {
        send({ type: "error", message: e instanceof Error ? e.message : "خطأ غير متوقع" });
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
