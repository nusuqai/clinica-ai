import { notFound } from "next/navigation";
import { requireActiveMember } from "@/lib/auth";
import { getClinicInfo } from "@/server/services/clinicInfo";
import PageHeader from "@/components/admin/page-header";
import ClinicInfoForm, { type ClinicInfoView } from "./_components/clinic-info-form";

export default async function AdminSettingsPage() {
  const { clinic } = await requireActiveMember(["ADMIN"]);
  const info = await getClinicInfo(clinic.id);
  if (!info) notFound();

  const view: ClinicInfoView = {
    name: info.name,
    description: info.description,
    phones: info.phones.map((p) => ({
      type: p.type,
      number: p.number,
      label: p.label,
      isPrimary: p.isPrimary,
    })),
    socials: info.socials.map((s) => ({ platform: s.platform, url: s.url })),
  };

  return (
    <div>
      <PageHeader title="معلومات العيادة" subtitle="النبذة، الأرقام العامة، وحسابات التواصل" />
      <ClinicInfoForm info={view} />
    </div>
  );
}
