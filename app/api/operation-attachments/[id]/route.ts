import { NextResponse } from "next/server";
import { can, getClinicContext } from "@/lib/auth";
import { getPatientMediaSignedUrl } from "@/lib/supabase/storage";
import { getOperationAttachment, operationInScope } from "@/server/services/operations";

export const runtime = "nodejs";

/**
 * Read one operation-case file: a 302 to a short-lived signed URL. Only team
 * members holding the operations permission (within their branch scope).
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await getClinicContext();
  if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!can(ctx, "operations")) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const att = await getOperationAttachment(id, ctx.clinic.id);
  if (!att || !operationInScope(ctx.branchIds, att.operation.branchId))
    return NextResponse.json({ error: "not_found" }, { status: 404 });

  const url = await getPatientMediaSignedUrl(att.storagePath);
  if (!url) return NextResponse.json({ error: "media_unavailable" }, { status: 502 });
  return NextResponse.redirect(url);
}
