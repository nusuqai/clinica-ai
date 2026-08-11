import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { ClinicRegisterForm } from "../_components/clinic-register-form";

export default async function ClinicRegisterPage({
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

  return <ClinicRegisterForm slug={slug} clinicName={clinic.name} />;
}
