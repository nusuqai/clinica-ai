import { CheckCircle2, XCircle } from "lucide-react";
import { requireClinicMember } from "@/lib/auth";
import PageHeader from "@/components/admin/page-header";
import { getWhatsappConfigStatus } from "@/lib/meta/whatsapp-config";

/**
 * Read-only WhatsApp status for a clinic admin. Connecting a clinic to Meta is
 * platform-admin work (see /platform/whatsapp), so nothing here is editable —
 * but the clinic still needs to answer "is our WhatsApp live?" without opening
 * a support ticket.
 *
 * Deliberately shows neither the access token nor the webhook/verify tokens:
 * those are Meta app secrets, and only whoever administers that app needs them.
 */
export default async function WhatsAppStatusPage() {
  const { clinic } = await requireClinicMember(["ADMIN"]);
  const config = await getWhatsappConfigStatus(clinic.id);

  return (
    <div>
      <PageHeader title="حالة اتصال واتساب" subtitle="يتولّى إعداد الاتصال بواتساب مسؤول المنصّة" />

      <div className="max-w-xl space-y-4">
        <div className="space-y-4 rounded-2xl border border-border bg-card p-5">
          <div className="flex items-center gap-2">
            {config ? (
              <>
                <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                <span className="font-sans text-sm font-semibold text-foreground">
                  واتساب متصل بهذه العيادة
                </span>
              </>
            ) : (
              <>
                <XCircle className="h-5 w-5 text-muted-foreground" />
                <span className="font-sans text-sm font-semibold text-foreground">
                  لم يُفعّل واتساب لهذه العيادة بعد
                </span>
              </>
            )}
          </div>

          {config && (
            <dl className="space-y-3 border-t border-border pt-4">
              <div>
                <dt className="font-sans text-xs text-muted-foreground">Phone Number ID</dt>
                <dd className="font-sans text-sm text-foreground" dir="ltr">
                  {config.phoneNumberId}
                </dd>
              </div>
              <div>
                <dt className="font-sans text-xs text-muted-foreground">آخر تحديث</dt>
                <dd className="font-sans text-sm text-foreground" dir="ltr">
                  {config.updatedAt.toLocaleDateString("en-GB")}
                </dd>
              </div>
            </dl>
          )}

          <p className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs leading-relaxed text-muted-foreground">
            {config
              ? "لتغيير رقم واتساب أو بيانات الاتصال، تواصل مع إدارة المنصّة."
              : "لتفعيل واتساب لعيادتك، تواصل مع إدارة المنصّة."}
          </p>
        </div>
      </div>
    </div>
  );
}
