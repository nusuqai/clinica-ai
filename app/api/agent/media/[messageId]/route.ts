import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";
import { getPatientMediaSignedUrl } from "@/lib/supabase/storage";
import type { AgentMessageMetadata } from "@/agent/types";

export const runtime = "nodejs";

/**
 * Owner playback for a web voice message (issue #49). Lets the signed-in user
 * replay their own recording after a reload — an `<audio src>` here 302s to a
 * short-lived signed URL, so the private object streams without exposing its
 * path. Scoped to the message's own conversation owner; anything else 404s.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ messageId: string }> }
) {
  const { messageId } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const message = await prisma.message.findFirst({
    where: { id: messageId, conversation: { userId: user.id } },
    select: { metadata: true },
  });
  const voice = (message?.metadata as AgentMessageMetadata | null)?.voice;
  if (!voice?.storagePath) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const url = await getPatientMediaSignedUrl(voice.storagePath);
  if (!url) return NextResponse.json({ error: "media_unavailable" }, { status: 502 });

  return NextResponse.redirect(url);
}
