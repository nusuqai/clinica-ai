import { BadgeCheck, CheckCircle2, LifeBuoy, Star } from "lucide-react";
import { requirePermission } from "@/lib/auth";
import PageHeader from "@/components/admin/page-header";
import { getWhatsappNumbers } from "@/lib/meta/whatsapp-config";
import { prisma } from "@/lib/prisma";
import {
  deleteEvolutionNumberAction,
  disconnectEvolutionAction,
  getEvolutionStatusAction,
  getNumberRemovalImpactAction,
  setNumberBranchAction,
  setPrimaryNumberAction,
  startEvolutionAction,
  stopEvolutionHistoryAction,
  syncEvolutionHistoryAction,
} from "@/server/actions/whatsapp";
import WhatsappNumbers, { MakePrimaryButton } from "@/components/admin/whatsapp/whatsapp-numbers";
import { Card } from "@/components/ui/card";

/**
 * A clinic's own WhatsApp numbers page.
 *
 *  - WhatsApp Web (Evolution) numbers are self-service: the clinic links as many
 *    of its phones as it needs by scanning a QR, and can resync or unlink each.
 *  - The official Cloud API number needs a Meta business setup and app secrets,
 *    so it stays platform-admin work — the clinic sees its status and how to
 *    reach Clinica support. Never shows any Meta token.
 *  - Any number can be made the main one (the fallback sender).
 */
export default async function WhatsAppConnectionPage() {
  const { clinic, branchIds } = await requirePermission("whatsapp");
  // Clinic-wide managers (branchIds null) see and place every number; a
  // branch-limited one only their branches' numbers, and only into them.
  const clinicWide = branchIds === null;
  const [allNumbers, branches] = await Promise.all([
    getWhatsappNumbers(clinic.id),
    prisma.branch.findMany({
      where: { clinicId: clinic.id, ...(clinicWide ? {} : { id: { in: [...branchIds] } }) },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);
  const numbers = clinicWide
    ? allNumbers
    : allNumbers.filter((n) => n.branchId && branchIds.includes(n.branchId));
  const owners = [...(clinicWide ? [{ id: null, name: "العيادة (كل الفروع)" }] : []), ...branches];
  const official = numbers.find((n) => n.provider === "META_CLOUD") ?? null;

  return (
    <div>
      <PageHeader
        title="اتصال واتساب"
        subtitle="أرقام واتساب عيادتك — اربط رقمًا أو أكثر بمسح رمز QR من هاتف العيادة"
      />
      <div className="max-w-xl space-y-6">
        {official ? (
          <Card className="space-y-4 p-5">
            <div className="flex flex-wrap items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-emerald-600" />
              <span className="font-sans text-sm font-semibold text-foreground">
                واتساب الرسمي (WhatsApp Business API)
              </span>
              {official.isPrimary && (
                <span className="flex items-center gap-1 rounded-full bg-accent/10 px-2 py-0.5 text-xs font-medium text-accent">
                  <Star className="h-3 w-3" />
                  الرقم الرئيسي
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              آخر تحديث: <span dir="ltr">{official.updatedAt.toLocaleDateString("en-GB")}</span>
            </p>
            <p className="text-xs text-muted-foreground">
              تابع لـ:{" "}
              <span className="font-medium text-foreground">
                {official.branchName ?? "العيادة"}
              </span>
            </p>
            {!official.isPrimary && clinicWide && (
              <MakePrimaryButton configId={official.id} setPrimary={setPrimaryNumberAction} />
            )}
            <SupportNote>
              الربط الرسمي يُدار من خلال فريق دعم Clinica. لتغيير الرقم أو تعديل أي إعداد في
              الاتصال، تواصل مع فريق الدعم وسنتولّى ذلك عنك.
            </SupportNote>
          </Card>
        ) : null}

        <WhatsappNumbers
          numbers={numbers}
          owners={owners}
          canSetPrimary={clinicWide}
          actions={{
            start: startEvolutionAction,
            status: getEvolutionStatusAction,
            sync: syncEvolutionHistoryAction,
            stopSync: stopEvolutionHistoryAction,
            disconnect: disconnectEvolutionAction,
            remove: deleteEvolutionNumberAction,
            setPrimary: setPrimaryNumberAction,
            impact: getNumberRemovalImpactAction,
            setBranch: setNumberBranchAction,
          }}
        />

        {!official && clinicWide && (
          <Card className="space-y-2 p-5">
            <h2 className="flex items-center gap-2 font-sans text-sm font-semibold text-foreground">
              <BadgeCheck className="h-4 w-4 text-accent" />
              تفضّل الربط الرسمي؟
            </h2>
            <p className="text-xs leading-relaxed text-muted-foreground">
              واتساب الرسمي (WhatsApp Business API من ميتا) أكثر استقرارًا، لا يعرّض رقمك للحظر،
              ويدعم القوالب المعتمدة لإرسال التذكيرات في أي وقت. يحتاج إعداده حسابًا تجاريًا لدى
              ميتا.
            </p>
            <SupportNote>تواصل مع فريق دعم Clinica وسنجهّز لك الربط الرسمي بالكامل.</SupportNote>
          </Card>
        )}
      </div>
    </div>
  );
}

function SupportNote({ children }: { children: React.ReactNode }) {
  return (
    <p className="flex gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs leading-relaxed text-muted-foreground">
      <LifeBuoy className="mt-0.5 h-4 w-4 shrink-0" />
      <span>{children}</span>
    </p>
  );
}
