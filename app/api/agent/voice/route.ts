import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getHostClinic } from "@/lib/auth";
import { webVoiceReply, guestWebVoiceReply } from "@/server/services/channels/web";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Max accepted recording size (~25 MB, matching the storage bucket limit). */
const MAX_AUDIO_BYTES = 25 * 1024 * 1024;

/**
 * Web chat voice turn (issue #49): accepts a recorded audio blob (multipart form
 * field `audio`), transcribes it, runs the common agent brain, and returns the
 * reply as JSON (no SSE) — `{ transcript, reply, audioMessageId, handoff, … }`.
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Same guest model as /api/agent/chat: a signed-in member speaks to their
  // clinic's agent; an anonymous visitor on a clinic host speaks as a guest
  // (clinic resolved from the host). The root domain has no clinic to speak to.
  const clinic = user ? null : await getHostClinic();
  if (!user && !clinic) {
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
  const conversationId = (form.get("conversationId") as string | null) ?? null;

  try {
    const result = user
      ? await webVoiceReply(user.id, { bytes, mimeType })
      : await guestWebVoiceReply({ id: clinic!.id, slug: clinic!.slug }, conversationId, {
          bytes,
          mimeType,
        });
    return NextResponse.json(result);
  } catch (e) {
    console.error("[web-voice] reply failed:", e);
    return NextResponse.json({ error: "خطأ غير متوقع" }, { status: 500 });
  }
}
