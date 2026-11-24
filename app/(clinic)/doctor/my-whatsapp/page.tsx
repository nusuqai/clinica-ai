import { redirect } from "next/navigation";
import { requireClinicMember, roleHome } from "@/lib/auth";
import { getMyWhatsappStateAction } from "@/server/actions/staff-assistant";
import PageHeader from "@/components/admin/page-header";
import MyWhatsappCard from "@/components/staff-assistant/my-whatsapp-card";

// A doctor links their own WhatsApp here (#89).
export default async function MyWhatsappPage() {
  const ctx = await requireClinicMember();
  const state = await getMyWhatsappStateAction();
  if (!state) redirect(roleHome(ctx.role));
  return (
    <div className="max-w-3xl">
      <PageHeader
        title="واتساب الخاص بي"
        subtitle="اربط رقمك لتدير العيادة بالمحادثة وتصلك تنبيهاتها على واتساب"
      />
      <MyWhatsappCard initial={state} />
    </div>
  );
}
