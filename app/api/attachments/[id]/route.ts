import { NextResponse } from "next/server";
import { getClinicContext } from "@/lib/auth";
import { getPatientMediaSignedUrl } from "@/lib/supabase/storage";
import { getAttachment } from "@/server/services/attachments";
import { authorizeAppointmentView } from "@/server/services/appointmentAccess";

export const runtime = "nodejs";

/**
 * Read one visit attachment. Returns a 302 to a short-lived signed URL so an
 * `<img>`/link with `src="/api/attachments/<id>"` loads the private object
 * without ever exposing the storage path.
 *
 * Authorized by the same rule as the appointment page: ADMIN (any in clinic),
 * the treating DOCTOR, or the PATIENT it belongs to. Anyone else 403s; an
 * attachment from another clinic 404s.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const ctx = await getClinicContext();
  if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const att = await getAttachment(id, ctx.clinic.id);
  if (!att) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const access = await authorizeAppointmentView(att.appointmentId);
  if (!access.ok || !access.canViewRecords)
    return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const url = await getPatientMediaSignedUrl(att.storagePath);
  if (!url) return NextResponse.json({ error: "media_unavailable" }, { status: 502 });

  return NextResponse.redirect(url);
}
