import { notFound, redirect } from "next/navigation";
import { getHostClinic } from "@/lib/auth";
import { otpCooldownRemaining } from "@/server/services/otpThrottle";
import { VerifyOtpForm } from "../_components/verify-otp-form";

export default async function VerifyOtpPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string }>;
}) {
  const { email } = await searchParams;

  const clinic = await getHostClinic();
  if (!clinic) notFound();

  // No email in the URL means the user reached this page without starting a
  // signup — send them back to register.
  if (!email) redirect("/register");

  // Seconds left on the resend cooldown, computed from the last-sent time in the
  // DB — so a page refresh shows the true remaining time, not a fresh 60s.
  const resendIn = await otpCooldownRemaining(email);

  return <VerifyOtpForm clinicName={clinic.name} email={email} initialResendIn={resendIn} />;
}
