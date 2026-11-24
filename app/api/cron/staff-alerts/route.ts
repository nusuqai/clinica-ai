import { NextRequest, NextResponse } from "next/server";
import { runStaffAlertSweep } from "@/server/services/staff/notifications";
import { runDataReportSweep } from "@/server/services/exports/delivery";

export const runtime = "nodejs";
export const maxDuration = 120;
export const dynamic = "force-dynamic";

/**
 * Team-alert sweep (#89). Supabase pg_cron POSTs here every minute (see
 * prisma/sql/staff-alerts-pgcron.sql): it queues due conversation reminders,
 * then sends ONE grouped WhatsApp message to each member whose oldest unsent
 * alert has waited their clinic's batch window. It also runs the scheduled
 * patient-data report (queue due clinics, send waiting Excel files). Gated by the CRON_SECRET bearer
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
  const alerts = await runStaffAlertSweep();
  // A report failure must not hide the alerts result (and vice versa).
  const reports = await runDataReportSweep().catch((err) => {
    console.error("[data-report] sweep failed", err);
    return { error: true };
  });
  return NextResponse.json({ ...alerts, reports });
}
