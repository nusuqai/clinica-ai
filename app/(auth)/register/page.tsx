import { notFound } from "next/navigation";
import { getHostClinic } from "@/lib/auth";
import { RegisterForm } from "../_components/register-form";

// Self sign-up only exists inside a clinic — an account is always created as a
// patient OF a clinic. The middleware already keeps this off the root domain.
export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ phone?: string }>;
}) {
  const { phone } = await searchParams;
  const clinic = await getHostClinic();
  if (!clinic) notFound();

  return <RegisterForm clinicName={clinic.name} initialPhone={phone ?? ""} />;
}
