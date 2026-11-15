// Local stand-in for the Supabase pg_cron debounce job (prisma/sql/debounce-pgcron.sql).
//
// pg_cron lives in Supabase and can only reach a public URL, so during local
// development nothing drains the debounce queue and WhatsApp messages never get
// an agent reply. This loop does what the cron does: POST the processor route
// every few seconds with the CRON_SECRET bearer token.
//
//   npm run cron:dev            (alongside `npm run dev`)
//
// Env (loaded from .env.local by the npm script):
//   CRON_SECRET          required — same value the route checks
//   DEV_CRON_URL         default http://localhost:3000/api/cron/process-debounce
//   DEV_CRON_INTERVAL_MS default 15000

const url = process.env.DEV_CRON_URL || "http://localhost:3000/api/cron/process-debounce";
const intervalMs = Number(process.env.DEV_CRON_INTERVAL_MS) || 15000;
const secret = process.env.CRON_SECRET;

if (!secret) {
  console.error("[cron:dev] CRON_SECRET is not set in .env.local");
  process.exit(1);
}

let running = false;

async function tick() {
  // Skip a tick if the previous run (LLM + WhatsApp sends) is still going.
  if (running) return;
  running = true;
  const started = Date.now();
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${secret}` },
      body: "{}",
    });
    const body = await res.text();
    const time = new Date().toLocaleTimeString();
    if (!res.ok) {
      console.error(`[cron:dev] ${time} ${res.status} ${body.slice(0, 200)}`);
    } else if (!body.includes('"claimed":0')) {
      // Quiet while idle; log only ticks that actually answered something.
      console.log(`[cron:dev] ${time} ${body} (${Date.now() - started}ms)`);
    }
  } catch (err) {
    console.error(`[cron:dev] ${url} unreachable — is \`npm run dev\` running? (${err.message})`);
  } finally {
    running = false;
  }
}

console.log(`[cron:dev] POST ${url} every ${intervalMs / 1000}s — Ctrl+C to stop`);
void tick();
setInterval(tick, intervalMs);
