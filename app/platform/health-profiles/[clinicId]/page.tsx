import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { requirePlatformAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { countAnswersByQuestion, getClinicForm } from "@/server/services/health-profile";
import HealthProfileBuilder from "./_components/health-profile-builder";

interface PageProps {
  params: Promise<{ clinicId: string }>;
}

export default async function PlatformHealthProfileBuilderPage({ params }: PageProps) {
  await requirePlatformAdmin();
  const { clinicId } = await params;
  const clinic = await prisma.clinic.findUnique({
    where: { id: clinicId },
    select: { id: true, name: true },
  });
  if (!clinic) notFound();

  const [sections, answerCounts] = await Promise.all([
    getClinicForm(clinicId, { includeArchived: true }),
    countAnswersByQuestion(clinicId),
  ]);

  return (
    <div>
      <Link
        href="/platform/health-profiles"
        className="mb-6 inline-flex items-center gap-1.5 font-sans text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowRight className="h-4 w-4" />
        كل العيادات
      </Link>
      <div className="mb-6">
        <h1 className="font-heading text-2xl font-bold text-foreground">
          ملف المريض — {clinic.name}
        </h1>
        <p className="mt-1 font-sans text-sm text-muted-foreground">
          حذف سؤال أو قسم أُجيب عليه يؤرشفه بدلاً من حذفه: يختفي من النموذج وتبقى إجابات المرضى
          السابقة محفوظة ومقروءة. تعديل نص سؤال لا يغيّر ما رآه المرضى عند إجابتهم.
        </p>
      </div>
      <HealthProfileBuilder clinicId={clinic.id} sections={sections} answerCounts={answerCounts} />
    </div>
  );
}
