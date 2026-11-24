import { NextRequest, NextResponse } from "next/server";
import { runStaffAlertSweep } from "@/server/services/staff/notifications";

export const runtime = "nodejs";
export const maxDuration = 120;
export const dynamic = "force-dynamic";

/**
 * Team-alert sweep (#89). Supabase pg_cron POSTs here every minute (see
 * prisma/sql/staff-alerts-pgcron.sql): it queues due conversation reminders,
 * then sends ONE grouped WhatsApp message to each member whose oldest unsent
 * alert has waited their clinic's batch window. Gated by the CRON_SECRET bearer
 * like the debounce processor (public in middleware, no Supabase session).
 */
export async function POST(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error("[staff-alerts] CRON_SECRET is not set — refusing to run");
    return NextResponse.json({ error: "not configured" }, { status: 503 });
  }
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const result = await runStaffAlertSweep();
  return NextResponse.json(result);
}
