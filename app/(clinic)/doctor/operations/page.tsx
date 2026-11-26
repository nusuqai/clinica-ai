import { redirect } from "next/navigation";
import { requireClinicMember } from "@/lib/auth";
import { getDoctorByProfileId } from "@/server/services/doctors";
import { listOperations } from "@/server/services/operations";
import { OPEN_OPERATION_STATUSES } from "@/lib/operations";
import OperationsTable from "@/components/operations/operations-table";

// The surgeon's own operations, read only — the front desk runs the cases.
export default async function DoctorOperationsPage() {
  const ctx = await requireClinicMember(["DOCTOR"]);
  const doctor = await getDoctorByProfileId(ctx.user.id, ctx.clinic.id);
  if (!doctor) redirect("/doctor");

  const [open, past] = await Promise.all([
    listOperations(ctx.clinic.id, null, { doctorId: doctor.id, statuses: OPEN_OPERATION_STATUSES }),
    listOperations(
      ctx.clinic.id,
      null,
      { doctorId: doctor.id, statuses: ["CLOSED", "CANCELLED"] },
      { take: 30 }
    ),
  ]);

  return (
    <div>
      <div className="mb-6">
        <h1 className="font-heading text-2xl font-bold text-foreground">العمليات</h1>
        <p className="mt-1 font-sans text-sm text-muted-foreground">
          العمليات التي أنت الجرّاح فيها — يرتّبها فريق العيادة.
        </p>
      </div>
      <OperationsTable
        items={open.items}
        basePath={null}
        showMoney={false}
        emptyMessage="لا توجد عمليات قادمة"
      />
      {past.items.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-4 font-heading text-lg font-bold text-foreground">السابقة</h2>
          <OperationsTable items={past.items} basePath={null} showMoney={false} />
        </section>
      )}
    </div>
  );
}
