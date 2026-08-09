import { NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { getActiveClinicContext } from "@/lib/auth";
import { getConnectionState } from "@/lib/evolution";

export async function GET() {
  const ctx = await getActiveClinicContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (ctx.role !== Role.ADMIN) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    const state = await getConnectionState();
    return NextResponse.json(state);
  } catch {
    return NextResponse.json({ state: "close" });
  }
}
