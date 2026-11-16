import { serve } from "inngest/next";
import { inngest } from "@/lib/inngest/client";
import { appointmentNotify, appointmentsSweep } from "@/lib/inngest/functions/appointments";
import { whatsappHistoryImport } from "@/lib/inngest/functions/evolutionSync";

// A history-import step pages through one whole chat (Evolution reads + inserts),
// which can outrun Vercel's default function timeout on a busy chat.
export const maxDuration = 300;

// The single endpoint Inngest calls back to run every function. Inngest Cloud
// (or the local `npx inngest-cli dev`) auto-discovers the functions listed here.
export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [appointmentsSweep, appointmentNotify, whatsappHistoryImport],
});
