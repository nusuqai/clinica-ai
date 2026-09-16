import { getHostClinicOrNotFound } from "@/lib/auth";
import { LoginForm } from "../_components/login-form";

// One login page for every host. On a clinic's subdomain it signs in against
// that clinic; on the root domain it signs into the platform and routes the user
// on to their own clinic.
export default async function LoginPage() {
  const clinic = await getHostClinicOrNotFound();
  return <LoginForm clinicName={clinic?.name ?? null} />;
}
