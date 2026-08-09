import Link from "next/link";
import { BookOpen } from "lucide-react";
import { requireActiveMember } from "@/lib/auth";
import PageHeader from "@/components/admin/page-header";
import ConnectionConfig from "@/components/admin/whatsapp/connection-config";
import { getWhatsappConfigStatus } from "@/lib/meta/whatsapp-config";

export default async function WhatsAppConfigurationPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { clinic } = await requireActiveMember(["ADMIN"]);
  const config = await getWhatsappConfigStatus(clinic.id);
  const appUrl = process.env.APP_URL ?? "";

  return (
    <div>
      <PageHeader
        title="إعدادات واتساب"
        subtitle="أدخل بيانات WhatsApp Cloud API الخاصة بالعيادة، واربط الويبهوك"
      />
      <div className="max-w-xl space-y-4">
        <Link
          href={`/clinic/${slug}/admin/whatsapp/guide`}
          className="inline-flex items-center gap-2 text-sm text-accent hover:underline"
        >
          <BookOpen className="w-4 h-4" />
          لا تعرف من أين تحصل على هذه القيم؟ اطّلع على دليل الإعداد
        </Link>
        <ConnectionConfig initialConfig={config} appUrl={appUrl} />
      </div>
    </div>
  );
}
