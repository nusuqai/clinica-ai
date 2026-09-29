import { NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getClinicContext } from "@/lib/auth";
import { getPatientMediaSignedUrl } from "@/lib/supabase/storage";
import type { AgentMessageMetadata } from "@/agent/types";

export const runtime = "nodejs";

/**
 * Staff playback for a message's voice audio (issue #49). Returns a 302 to a
 * short-lived signed URL so an `<audio src="/api/admin/media/<id>">` element
 * streams the private object without ever exposing the storage path.
 *
 * Authorized to clinic staff (ADMIN/DOCTOR) and scoped to their clinic — a
 * message from another clinic 404s.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ messageId: string }> }
) {
  const { messageId } = await params;

  const ctx = await getClinicContext();
  if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (ctx.role !== Role.ADMIN && ctx.role !== Role.DOCTOR) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const message = await prisma.message.findFirst({
    where: { id: messageId, clinicId: ctx.clinic.id },
    select: { metadata: true },
  });
  const meta = message?.metadata as AgentMessageMetadata | null;
  // A message carries either a voice note or a (image/video/document/sticker)
  // attachment — both live in the same private bucket.
  const storagePath = meta?.voice?.storagePath ?? meta?.media?.storagePath;
  if (!storagePath) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const url = await getPatientMediaSignedUrl(storagePath);
  if (!url) return NextResponse.json({ error: "media_unavailable" }, { status: 502 });

  return NextResponse.redirect(url);
}
