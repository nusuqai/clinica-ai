import { serve } from "inngest/next";
import { inngest } from "@/lib/inngest/client";
import { appointmentNotify, appointmentsSweep } from "@/lib/inngest/functions/appointments";

// The single endpoint Inngest calls back to run every function. Inngest Cloud
// (or the local `npx inngest-cli dev`) auto-discovers the functions listed here.
export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [appointmentsSweep, appointmentNotify],
});
