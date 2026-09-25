import { requireClinicMember } from "@/lib/auth";
import { listPatientRecords } from "@/server/services/treatments";
import RecordTimeline from "@/components/medical/record-timeline";
import PageHeader from "@/components/admin/page-header";

// The patient's own clinical history.
//
// CLINIC-SCOPED BY THE HOST. requireClinicMember resolves the clinic from the
// subdomain this request came in on, and that clinic id is what the query
// filters by — so signing in at demo.clinica-ai.nusuqai.com shows demo's
// records, and only those. The same account at another clinic's subdomain gets
// that clinic's history instead; neither page can leak the other's, because the
// clinic is never taken from a parameter the visitor controls.
export default async function PatientRecordsPage() {
  const ctx = await requireClinicMember(["PATIENT"]);

  const records = await listPatientRecords({
    clinicId: ctx.clinic.id,
    patientId: ctx.user.id,
  });

  return (
    <div>
      <PageHeader
        title="سجلي العلاجي"
        subtitle={`تاريخ زياراتك في ${ctx.clinic.name} — ${records.length} زيارة`}
      />

      <RecordTimeline records={records} emptyMessage="لا يوجد سجل علاجي بعد" />
    </div>
  );
}
