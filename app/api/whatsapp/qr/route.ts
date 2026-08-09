import { NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { getActiveClinicContext } from "@/lib/auth";
import { getQRCode } from "@/lib/evolution";

export async function GET() {
  const ctx = await getActiveClinicContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (ctx.role !== Role.ADMIN) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    const qr = await getQRCode();
    return NextResponse.json(qr);
  } catch {
    return NextResponse.json({ error: "Failed to fetch QR" }, { status: 502 });
  }
}
