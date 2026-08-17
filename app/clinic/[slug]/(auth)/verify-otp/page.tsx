import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { otpCooldownRemaining } from "@/server/services/otpThrottle";
import { ClinicVerifyOtpForm } from "../_components/clinic-verify-otp-form";

export default async function ClinicVerifyOtpPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ email?: string }>;
}) {
  const { slug } = await params;
  const { email } = await searchParams;

  const clinic = await prisma.clinic.findFirst({
    where: { slug, isActive: true },
    select: { name: true },
  });
  if (!clinic) notFound();

  // No email in the URL means the user reached this page without starting a
  // signup — send them back to register.
  if (!email) redirect(`/clinic/${slug}/register`);

  // Seconds left on the resend cooldown, computed from the last-sent time in the
  // DB — so a page refresh shows the true remaining time, not a fresh 60s.
  const resendIn = await otpCooldownRemaining(email);

  return (
    <ClinicVerifyOtpForm
      slug={slug}
      clinicName={clinic.name}
      email={email}
      initialResendIn={resendIn}
    />
  );
}
