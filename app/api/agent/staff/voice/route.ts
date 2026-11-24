import { NextRequest, NextResponse } from "next/server";
import { getClinicContext } from "@/lib/auth";
import { isTeamRole } from "@/server/services/staff/access";
import { staffWebVoiceReply } from "@/server/services/channels/web";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Max accepted recording size (~25 MB, matching the storage bucket limit). */
const MAX_AUDIO_BYTES = 25 * 1024 * 1024;

/** Team assistant on the dashboard bubble (#89) — voice turn (multipart `audio`). */
export async function POST(request: NextRequest) {
  const ctx = await getClinicContext();
  if (!ctx || ctx.viaPlatformAdmin || !isTeamRole(ctx.role)) {
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

  try {
    const result = await staffWebVoiceReply(
      { id: ctx.clinic.id, slug: ctx.clinic.slug },
      ctx.user.id,
      { bytes: Buffer.from(await file.arrayBuffer()), mimeType: file.type || "audio/webm" }
    );
    return NextResponse.json(result);
  } catch (e) {
    console.error("[staff-voice] reply failed:", e);
    return NextResponse.json({ error: "خطأ غير متوقع" }, { status: 500 });
  }
}
