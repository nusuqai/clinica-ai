import { NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { getActiveClinicContext } from "@/lib/auth";
import { disconnectInstance } from "@/lib/evolution";

export async function POST() {
  const ctx = await getActiveClinicContext();
  if (!ctx)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (ctx.role !== Role.ADMIN)
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    await disconnectInstance();
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json(
      { error: "Failed to disconnect" },
      { status: 502 },
    );
  }
}
