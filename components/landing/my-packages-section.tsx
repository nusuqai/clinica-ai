import { CalendarClock, MapPin, Package } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { PAYMENT_STATUS_LABEL, creditLineText } from "@/lib/packages";
import type { PatientPackageView } from "@/server/services/packages";

const shortDay = (key: string) => key.split("-").reverse().join("/");
const fmtDate = (d: Date) =>
  new Date(d).toLocaleDateString("ar-EG", { day: "numeric", month: "short" });

/** The signed-in patient's active packages: what's left, until when, recent use. */
export function MyPackagesSection({
  packages,
  names,
}: {
  packages: PatientPackageView[];
  names: { categories: Record<string, string>; services: Record<string, string> };
}) {
  const active = packages.filter((p) => p.status === "ACTIVE");
  if (active.length === 0) return null;
  const lookup = {
    category: (id: string) => names.categories[id],
    service: (id: string) => names.services[id],
  };
  return (
    <section className="bg-background px-6 pb-4 pt-10">
      <div className="mx-auto max-w-7xl">
        <h2 className="mb-5 flex items-center gap-2 font-heading text-2xl font-bold text-primary">
          <Package className="h-6 w-6" />
          باقاتي
        </h2>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {active.map((p) => {
            const uses = p.ledger.filter((l) => l.type === "CONSUME").slice(0, 3);
            return (
              <div key={p.id} className="rounded-2xl border border-border bg-white p-5">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-heading text-base font-bold text-text">{p.name}</p>
                  {p.paymentStatus === "UNPAID" && (
                    <Badge variant="warning">{PAYMENT_STATUS_LABEL.UNPAID}</Badge>
                  )}
                </div>
                <div className="mt-1 flex flex-wrap gap-x-4 font-sans text-xs text-text/50">
                  <span className="flex items-center gap-1">
                    <MapPin className="h-3.5 w-3.5" />
                    {p.branchName}
                  </span>
                  <span className="flex items-center gap-1">
                    <CalendarClock className="h-3.5 w-3.5" />
                    صالحة حتى {shortDay(p.expiresOn)}
                  </span>
                </div>
                <div className="mt-4 space-y-3">
                  {p.balances.map((b) => {
                    const remaining = Math.max(0, b.total - b.used);
                    return (
                      <div key={b.id}>
                        <div className="mb-1 flex justify-between gap-2 font-sans text-sm">
                          <span className="text-text/70">
                            {creditLineText({ ...b, quantity: b.total }, lookup)}
                          </span>
                          <span className="font-semibold text-text">
                            متبقٍ {remaining} {b.creditType === "SESSIONS" ? "جلسة" : "وحدة"}
                          </span>
                        </div>
                        <Progress value={b.total ? (remaining / b.total) * 100 : 0} />
                      </div>
                    );
                  })}
                </div>
                {uses.length > 0 && (
                  <div className="mt-3 border-t border-border pt-3 font-sans text-xs text-text/60">
                    {uses.map((u) => (
                      <p key={u.id}>
                        {fmtDate(u.createdAt)} · {u.serviceName ?? "استخدام"} · {-u.quantity}
                      </p>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
