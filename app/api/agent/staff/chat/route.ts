import { NextRequest, NextResponse } from "next/server";
import { getClinicContext } from "@/lib/auth";
import { isTeamRole } from "@/server/services/staff/access";
import { staffWebReply } from "@/server/services/channels/web";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Team assistant on the dashboard bubble (#89) — text turn, synchronous JSON.
 * The clinic comes from the host and the member from the session; whether the
 * assistant is open to them (clinic switch + member flag) is decided by the
 * agent brain, which answers with a notice when it isn't.
 */
export async function POST(request: NextRequest) {
  const ctx = await getClinicContext();
  if (!ctx || ctx.viaPlatformAdmin || !isTeamRole(ctx.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { message?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const message = body.message?.trim();
  if (!message) return NextResponse.json({ error: "Empty message" }, { status: 400 });

  try {
    const result = await staffWebReply(
      { id: ctx.clinic.id, slug: ctx.clinic.slug },
      ctx.user.id,
      message
    );
    return NextResponse.json(result);
  } catch (e) {
    console.error("[staff-chat] reply failed:", e);
    return NextResponse.json({ error: "خطأ غير متوقع" }, { status: 500 });
  }
}
