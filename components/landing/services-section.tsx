"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { Clock, Package, Sparkles, Tag } from "lucide-react";
import { toast } from "sonner";
import type { PricingType } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { Spinner } from "@/components/ui/spinner";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { publicServiceProvidersAction, requestMyPackageAction } from "@/server/actions/patient";
import { durationText, servicePriceText } from "@/lib/catalog";
import { formatFee } from "@/lib/currency";
import { BookAppointmentModal } from "./book-appointment-modal";

/** A service as the public landing shows it (never carries AI-only notes). */
export interface LandingService {
  id: string;
  name: string;
  categoryId: string;
  categoryName: string;
  pricingType: PricingType;
  unitLabel: string | null;
  description: string | null;
  durationMin: number | null;
  bookable: boolean;
  price: number | null;
  offer: { label: string; price: number | null; endsAt: string | null } | null;
  tiers: { minQty: number; maxQty: number | null; price: number }[];
}

export interface LandingPackage {
  id: string;
  name: string;
  categoryName: string;
  description: string | null;
  terms: string | null;
  includes: string[];
  price: number;
  validityDays: number;
  branches: { id: string; name: string }[];
}

const ALL = "all";
const shortDay = (key: string) => key.split("-").reverse().slice(0, 2).join("/");

/**
 * The clinic's catalog on its landing page: services by category with their
 * price and live offer, a "book" button (pick the practitioner → the booking
 * modal with the service preselected), and the prepaid packages, which a
 * signed-in patient can request.
 */
export function ServicesSection({
  services,
  packages,
  isAuthenticated,
  isPatient,
  appointmentsHref,
  loginHref,
  registerHref,
}: {
  services: LandingService[];
  packages: LandingPackage[];
  isAuthenticated: boolean;
  isPatient: boolean;
  appointmentsHref?: string;
  loginHref?: string;
  registerHref?: string;
}) {
  const categories = useMemo(
    () => [...new Map(services.map((s) => [s.categoryId, s.categoryName])).entries()],
    [services]
  );
  const [category, setCategory] = useState(ALL);
  const [picking, setPicking] = useState<LandingService | null>(null);
  const [booking, setBooking] = useState<{
    doctor: { id: string; name: string; specialty: string };
    serviceId: string;
  } | null>(null);
  const [requesting, setRequesting] = useState<LandingPackage | null>(null);

  if (services.length === 0 && packages.length === 0) return null;
  const visible = category === ALL ? services : services.filter((s) => s.categoryId === category);

  return (
    <section id="services" className="bg-muted px-6 py-20">
      <div className="mx-auto max-w-7xl">
        <div className="mb-10 text-center">
          <h2 className="font-heading text-3xl font-extrabold text-primary lg:text-4xl">
            خدماتنا وأسعارها
          </h2>
          <p className="mt-3 font-sans text-base text-text/60">اختر الخدمة واحجز موعدك مباشرة</p>
        </div>

        {categories.length > 1 && (
          <ToggleGroup
            type="single"
            value={category}
            onValueChange={(v) => v && setCategory(v)}
            className="mb-8 flex flex-wrap justify-center gap-2"
          >
            <ToggleGroupItem value={ALL} className="rounded-full px-4">
              الكل
            </ToggleGroupItem>
            {categories.map(([id, name]) => (
              <ToggleGroupItem key={id} value={id} className="rounded-full px-4">
                {name}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((s) => {
            const priceText = servicePriceText(s);
            const offerPrice =
              s.offer?.price != null
                ? s.pricingType === "PER_UNIT"
                  ? `${formatFee(s.offer.price)} / ${s.unitLabel ?? "وحدة"}`
                  : formatFee(s.offer.price)
                : null;
            return (
              <div
                key={s.id}
                className="flex flex-col rounded-2xl border border-border bg-white p-5"
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="font-heading text-base font-bold text-text">{s.name}</p>
                  {categories.length > 1 && (
                    <Badge variant="muted" className="shrink-0">
                      {s.categoryName}
                    </Badge>
                  )}
                </div>
                {s.description && (
                  <p className="mt-1 line-clamp-2 font-sans text-sm text-text/60">
                    {s.description}
                  </p>
                )}
                <div className="mt-3 flex flex-col gap-1 font-sans text-sm">
                  {s.price == null &&
                  (s.pricingType === "FIXED" || s.pricingType === "PER_UNIT") ? (
                    <span className="text-text/60">السعر حسب الطبيب</span>
                  ) : (
                    <span
                      className={
                        offerPrice ? "text-text/40 line-through" : "font-semibold text-text"
                      }
                    >
                      {priceText}
                    </span>
                  )}
                  {s.offer && (
                    <span className="flex flex-wrap items-center gap-1.5 text-accent">
                      <Tag className="h-3.5 w-3.5" />
                      {offerPrice && <span className="font-semibold">{offerPrice}</span>}
                      <span>{s.offer.label}</span>
                      {s.offer.endsAt && (
                        <span className="text-xs text-text/50">حتى {shortDay(s.offer.endsAt)}</span>
                      )}
                    </span>
                  )}
                  {s.durationMin && (
                    <span className="flex items-center gap-1.5 text-xs text-text/50">
                      <Clock className="h-3.5 w-3.5" />
                      {durationText(s.durationMin)}
                    </span>
                  )}
                </div>
                {s.bookable && (
                  <Button onClick={() => setPicking(s)} className="mt-4 w-full">
                    احجز الخدمة
                  </Button>
                )}
              </div>
            );
          })}
        </div>

        {packages.length > 0 && (
          <div className="mt-14">
            <h3 className="mb-6 flex items-center justify-center gap-2 font-heading text-2xl font-bold text-primary">
              <Package className="h-6 w-6" />
              الباقات
            </h3>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {packages.map((p) => (
                <div
                  key={p.id}
                  className="flex flex-col rounded-2xl border border-accent/30 bg-white p-5"
                >
                  <p className="font-heading text-base font-bold text-text">{p.name}</p>
                  <p className="mt-1 font-sans text-sm text-text/60">{p.includes.join(" + ")}</p>
                  <p className="mt-3 font-sans text-lg font-bold text-accent">
                    {formatFee(p.price)}
                  </p>
                  <p className="font-sans text-xs text-text/50">
                    صالحة {p.validityDays} يوماً من الشراء
                  </p>
                  {p.description && (
                    <p className="mt-2 font-sans text-xs text-text/60">{p.description}</p>
                  )}
                  <Button
                    variant="outline"
                    onClick={() => setRequesting(p)}
                    className="mt-4 w-full"
                  >
                    اطلب الباقة
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {picking && (
        <ProviderPicker
          service={picking}
          onClose={() => setPicking(null)}
          onPick={(doctor) => {
            setBooking({ doctor, serviceId: picking.id });
            setPicking(null);
          }}
        />
      )}
      {booking && (
        <BookAppointmentModal
          doctor={booking.doctor}
          initialServiceIds={[booking.serviceId]}
          isAuthenticated={isAuthenticated}
          isPatient={isPatient}
          appointmentsHref={appointmentsHref}
          loginHref={loginHref}
          registerHref={registerHref}
          onClose={() => setBooking(null)}
        />
      )}
      {requesting && (
        <RequestPackageDialog
          pkg={requesting}
          canRequest={isAuthenticated && isPatient}
          loginHref={loginHref}
          onClose={() => setRequesting(null)}
        />
      )}
    </section>
  );
}

function ProviderPicker({
  service,
  onClose,
  onPick,
}: {
  service: LandingService;
  onClose: () => void;
  onPick: (doctor: { id: string; name: string; specialty: string }) => void;
}) {
  const [providers, setProviders] = useState<Awaited<
    ReturnType<typeof publicServiceProvidersAction>
  > | null>(null);
  useEffect(() => {
    let live = true;
    publicServiceProvidersAction(service.id).then((list) => {
      if (!live) return;
      // A single practitioner: go straight to booking.
      if (list.length === 1)
        onPick({ id: list[0].id, name: list[0].name, specialty: list[0].specialty });
      else setProviders(list);
    });
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [service.id]);
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="w-[calc(100%-2rem)] max-w-md rounded-2xl bg-white">
        <DialogTitle className="font-heading text-lg font-bold text-text">
          {service.name}
        </DialogTitle>
        <DialogDescription className="font-sans text-sm text-text/60">
          اختر من يقدّم لك الخدمة
        </DialogDescription>
        {!providers ? (
          <div className="flex justify-center py-6">
            <Spinner className="text-accent" />
          </div>
        ) : providers.length === 0 ? (
          <Alert>لا يوجد من يقدّم هذه الخدمة حالياً.</Alert>
        ) : (
          <div className="flex flex-col gap-2">
            {providers.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => onPick({ id: p.id, name: p.name, specialty: p.specialty })}
                className="flex flex-col items-start rounded-xl border border-border px-4 py-3 text-start transition-colors hover:border-accent hover:bg-accent/5"
              >
                <span className="flex items-center gap-2 font-sans text-sm font-semibold text-text">
                  <Sparkles className="h-4 w-4 text-accent" />
                  {p.name}
                </span>
                <span className="font-sans text-xs text-text/50">
                  {[p.specialty, p.branches.join("، ")].filter(Boolean).join(" · ")}
                </span>
              </button>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function RequestPackageDialog({
  pkg,
  canRequest,
  loginHref = "/login",
  onClose,
}: {
  pkg: LandingPackage;
  canRequest: boolean;
  loginHref?: string;
  onClose: () => void;
}) {
  const [branchId, setBranchId] = useState(pkg.branches[0]?.id ?? "");
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [isPending, startTransition] = useTransition();
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="w-[calc(100%-2rem)] max-w-md rounded-2xl bg-white">
        <DialogTitle className="font-heading text-lg font-bold text-text">{pkg.name}</DialogTitle>
        <DialogDescription className="font-sans text-sm text-text/60">
          {pkg.includes.join(" + ")} · {formatFee(pkg.price)} · صالحة {pkg.validityDays} يوماً
        </DialogDescription>
        {done ? (
          <div className="flex flex-col gap-3">
            <Alert variant="success">
              تم تسجيل طلبك. يمكنك استخدام الباقة في حجوزاتك من الآن، ويُدفع المبلغ في العيادة.
            </Alert>
            <Button onClick={onClose}>إغلاق</Button>
          </div>
        ) : !canRequest ? (
          <div className="flex flex-col gap-3">
            <p className="font-sans text-sm text-text/70">سجّل دخولك كمريض لطلب الباقة.</p>
            <Link
              href={loginHref}
              className="block w-full rounded-xl bg-primary py-3 text-center font-medium text-white hover:opacity-90"
            >
              تسجيل الدخول
            </Link>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {pkg.terms && (
              <p className="rounded-xl bg-muted px-3 py-2 font-sans text-xs text-text/70">
                الشروط: {pkg.terms}
              </p>
            )}
            {pkg.branches.length > 1 && (
              <label className="flex flex-col gap-1.5 font-sans text-sm text-text">
                الفرع (تُستخدم الباقة فيه فقط)
                <select
                  value={branchId}
                  onChange={(e) => setBranchId(e.target.value)}
                  className="h-10 rounded-lg border border-border bg-white px-3"
                >
                  {pkg.branches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {error && <Alert variant="destructive">{error}</Alert>}
            <Button
              loading={isPending}
              onClick={() =>
                startTransition(async () => {
                  setError("");
                  const res = await requestMyPackageAction(pkg.id, branchId);
                  if (res.ok) {
                    setDone(true);
                    toast.success("تم طلب الباقة");
                  } else setError(res.error ?? "تعذّر طلب الباقة");
                })
              }
            >
              تأكيد طلب الباقة
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
