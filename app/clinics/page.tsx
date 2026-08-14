import { redirect } from "next/navigation";
import { getCurrentUser, redirectToUserClinic } from "@/lib/auth";

// /clinics is a routing helper, not a page: signed-in users are sent to their
// clinic (platform admins to /platform); everyone else to the master landing.
export default async function ClinicsIndexPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/");
  await redirectToUserClinic(user.id, user.profile.isPlatformAdmin);
}
