import Link from "next/link";
import { BookOpen } from "lucide-react";
import { requirePlatformAdmin } from "@/lib/auth";
import { getPlatformWhatsappOverview } from "@/server/services/whatsappOverview";
import WhatsappManager from "./_components/whatsapp-manager";
import { Card } from "@/components/ui/card";

// WhatsApp onboarding for every clinic, in one place. A clinic admin can see
// whether their clinic is connected, but only a platform admin sets it up.
export default async function PlatformWhatsappPage() {
  await requirePlatformAdmin();
  const overview = await getPlatformWhatsappOverview();
  const appUrl = process.env.APP_URL ?? "";

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-heading text-2xl font-bold text-foreground">واتساب العيادات</h1>
        <Link
          href="/platform/whatsapp/guide"
          className="inline-flex items-center gap-2 text-sm text-accent hover:underline"
        >
          <BookOpen className="h-4 w-4" />
          دليل الإعداد
        </Link>
      </div>

      <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Card className="p-5">
          <p className="font-heading text-2xl font-bold text-foreground" dir="ltr">
            {overview.configuredCount}
          </p>
          <p className="mt-1 font-sans text-sm text-muted-foreground">عيادات متصلة بواتساب</p>
        </Card>
        <Card className="p-5">
          <p className="font-heading text-2xl font-bold text-foreground" dir="ltr">
            {overview.clinics.length - overview.configuredCount}
          </p>
          <p className="mt-1 font-sans text-sm text-muted-foreground">عيادات بانتظار الإعداد</p>
        </Card>
      </div>

      <div className="space-y-4">
        {overview.clinics.map((c) => (
          <Card key={c.clinicId} className="p-5">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="font-heading font-semibold text-foreground">{c.name}</p>
                <p className="font-sans text-xs text-muted-foreground" dir="ltr">
                  /{c.slug}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-4 text-sm">
                <span
                  className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                    c.numbers.some((n) => !n.unlinkedAt)
                      ? "bg-emerald-500/10 text-emerald-600"
                      : "bg-muted text-muted-foreground"
                  }`}
                >
                  {c.numbers.some((n) => !n.unlinkedAt)
                    ? `${c.numbers.filter((n) => !n.unlinkedAt).length} رقم متصل`
                    : "غير متصل"}
                </span>
                {c.numbers.map((n) => (
                  <span
                    key={n.id}
                    className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                      n.provider === "META_CLOUD"
                        ? "bg-sky-500/10 text-sky-600"
                        : "bg-amber-500/10 text-amber-600"
                    }`}
                    dir="ltr"
                  >
                    {n.provider === "META_CLOUD"
                      ? `Cloud API · ${n.phoneNumberId}`
                      : n.phone
                        ? `+${n.phone}`
                        : "WhatsApp Web"}
                    {n.isPrimary ? " ★" : ""}
                    {n.unlinkedAt ? " · مفصول" : ""}
                  </span>
                ))}
              </div>
            </div>
            <WhatsappManager
              clinicId={c.clinicId}
              numbers={c.numbers}
              branches={c.branches}
              appUrl={appUrl}
            />
          </Card>
        ))}
        {overview.clinics.length === 0 && (
          <p className="font-sans text-sm text-muted-foreground">لا توجد عيادات.</p>
        )}
      </div>
    </div>
  );
}
