import { redirect } from "next/navigation";

// Credentials, templates and the setup guide now live in the platform console.
// What remains on the clinic side is reminders/feedback automation plus a
// read-only connection status, so the sidebar parent lands on automation.
export default async function WhatsAppIndexPage() {
  redirect(`/admin/whatsapp/automation`);
}
