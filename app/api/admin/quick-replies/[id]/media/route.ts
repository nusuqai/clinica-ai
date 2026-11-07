import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { can, getClinicContext } from "@/lib/auth";
import { getPatientMediaSignedUrl } from "@/lib/supabase/storage";

export const runtime = "nodejs";

/**
 * A quick reply's image, for the pool preview and for "copy into the composer".
 * 302s to a short-lived signed URL; clinic-scoped, `messages` holders only.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  const ctx = await getClinicContext();
  if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!can(ctx, "messages")) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const qr = await prisma.quickReply.findFirst({
    where: { id, clinicId: ctx.clinic.id },
    select: { mediaPath: true },
  });
  if (!qr?.mediaPath) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const url = await getPatientMediaSignedUrl(qr.mediaPath);
  if (!url) return NextResponse.json({ error: "media_unavailable" }, { status: 502 });
  return NextResponse.redirect(url);
}
