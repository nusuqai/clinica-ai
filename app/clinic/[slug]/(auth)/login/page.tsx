import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { ClinicLoginForm } from "../_components/clinic-login-form";

export default async function ClinicLoginPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const clinic = await prisma.clinic.findFirst({
    where: { slug, isActive: true },
    select: { name: true },
  });
  if (!clinic) notFound();

  return <ClinicLoginForm slug={slug} clinicName={clinic.name} />;
}
