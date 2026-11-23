import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { requirePlatformAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { formSummaryByClinic } from "@/server/services/health-profile";
import { Card } from "@/components/ui/card";

// Every clinic's patient health profile ("ملف المريض") form. Built by the
// platform team for now; each clinic starts with an empty form (no booking gate
// until a required question exists).
export default async function PlatformHealthProfilesPage() {
  await requirePlatformAdmin();
  const [clinics, summary] = await Promise.all([
    prisma.clinic.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true, slug: true, isActive: true },
    }),
    formSummaryByClinic(),
  ]);

  return (
    <div>
      <div className="mb-6">
        <h1 className="font-heading text-2xl font-bold text-foreground">ملفات المرضى</h1>
        <p className="mt-1 font-sans text-sm text-muted-foreground">
          أسئلة «ملف المريض» لكل عيادة. الأسئلة المطلوبة تُطلب من المريض قبل أول حجز له (من الموقع
          أو عبر المساعد الذكي).
        </p>
      </div>

      <div className="space-y-3">
        {clinics.map((c) => {
          const s = summary[c.id];
          return (
            <Link key={c.id} href={`/platform/health-profiles/${c.id}`} className="block">
              <Card className="flex flex-wrap items-center justify-between gap-3 p-5 transition-colors hover:border-primary/40">
                <div>
                  <p className="font-heading font-semibold text-foreground">
                    {c.name}
                    {!c.isActive && (
                      <span className="ms-2 font-sans text-xs text-muted-foreground">(موقوفة)</span>
                    )}
                  </p>
                  <p className="font-sans text-xs text-muted-foreground" dir="ltr">
                    /{c.slug}
                  </p>
                </div>
                <div className="flex items-center gap-3 font-sans text-sm text-muted-foreground">
                  {s && s.questions > 0 ? (
                    <span>
                      {s.sections} قسم · {s.questions} سؤال · {s.required} مطلوب
                    </span>
                  ) : (
                    <span>لا توجد أسئلة</span>
                  )}
                  <ChevronLeft className="h-4 w-4" />
                </div>
              </Card>
            </Link>
          );
        })}
        {clinics.length === 0 && (
          <p className="font-sans text-sm text-muted-foreground">لا توجد عيادات.</p>
        )}
      </div>
    </div>
  );
}
