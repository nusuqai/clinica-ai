import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowRight, Phone } from "lucide-react";
import { requireClinicMember } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { authorizePatientHistory } from "@/server/services/treatmentAccess";
import { listPatientRecords } from "@/server/services/treatments";
import RecordTimeline from "@/components/medical/record-timeline";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function DoctorPatientHistoryPage({ params }: PageProps) {
  const { id } = await params;
  await requireClinicMember(["DOCTOR"]);

  // The read rule decides whether this doctor may see this patient at all — a
  // patient they have never had an appointment with is a 404, not an empty page.
  const access = await authorizePatientHistory(id);
  if (!access.ok) notFound();

  const [patient, records] = await Promise.all([
    prisma.profile.findUnique({ where: { id }, select: { fullName: true, phone: true } }),
    listPatientRecords({ clinicId: access.clinicId, patientId: id }),
  ]);
  if (!patient) notFound();

  return (
    <div>
      <Link
        href="/doctor/patients"
        className="mb-6 inline-flex items-center gap-1.5 font-sans text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowRight className="h-4 w-4" />
        العودة إلى المرضى
      </Link>

      <div className="mb-6 flex flex-wrap items-center gap-4 rounded-2xl border border-border bg-card p-5">
        <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl bg-accent/10">
          <span className="font-sans text-lg font-bold text-accent">
            {patient.fullName.charAt(0)}
          </span>
        </div>
        <div className="min-w-0">
          <h1 className="font-heading text-xl font-bold text-foreground">{patient.fullName}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-3 font-sans text-sm text-muted-foreground">
            {patient.phone && (
              <span className="flex items-center gap-1.5" dir="ltr">
                <Phone className="h-3.5 w-3.5" />
                {patient.phone}
              </span>
            )}
            <span>{records.length} زيارة مسجّلة</span>
          </div>
        </div>
      </div>

      <h2 className="mb-4 font-heading text-lg font-bold text-foreground">السجل العلاجي</h2>
      <RecordTimeline records={records} emptyMessage="لا يوجد سجل علاجي لهذا المريض بعد" />
    </div>
  );
}
