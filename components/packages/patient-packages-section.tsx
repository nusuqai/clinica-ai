"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { CalendarClock, ChevronDown, CreditCard, MapPin, Package, Plus } from "lucide-react";
import { toast } from "sonner";
import type { PackagePaymentStatus, PatientPackageStatus } from "@prisma/client";
import Modal from "@/components/admin/modal";
import { Alert } from "@/components/ui/alert";
import { Badge, type BadgeVariant } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FormField } from "@/components/ui/form-field";
import { Progress } from "@/components/ui/progress";
import {
  adjustBalanceAction,
  cancelPatientPackageAction,
  confirmPackagePaymentAction,
  extendPackageAction,
  quotePackageAction,
  sellPackageAction,
} from "@/server/actions/catalog";
import {
  LEDGER_TYPE_LABEL,
  PATIENT_PACKAGE_STATUS_LABEL,
  PAYMENT_STATUS_LABEL,
  creditLineText,
} from "@/lib/packages";
import { formatFee } from "@/lib/currency";
import type { PackageQuote, PatientPackageView } from "@/server/services/packages";

const STATUS_VARIANT: Record<PatientPackageStatus, BadgeVariant> = {
  ACTIVE: "success",
  USED_UP: "muted",
  EXPIRED: "neutral",
  CANCELLED: "danger",
};
const PAYMENT_VARIANT: Record<PackagePaymentStatus, BadgeVariant> = {
  PAID: "info",
  UNPAID: "warning",
};

const shortDay = (key: string) => key.split("-").reverse().join("/");
const fmtDate = (d: Date) =>
  new Date(d).toLocaleDateString("ar-EG", { day: "numeric", month: "short", year: "numeric" });

export interface SellablePackage {
  id: string;
  name: string;
  allBranches: boolean;
  branchIds: string[];
}

export default function PatientPackagesSection({
  patientId,
  packages,
  sellable,
  branches,
  names,
  appointmentBasePath = "/admin/appointments",
}: {
  patientId: string;
  packages: PatientPackageView[];
  sellable: SellablePackage[];
  /** Branches the member may sell in. */
  branches: { id: string; name: string }[];
  names: { categories: Record<string, string>; services: Record<string, string> };
  appointmentBasePath?: string;
}) {
  const [sellOpen, setSellOpen] = useState(false);
  const [showClosed, setShowClosed] = useState(false);
  const open = packages.filter((p) => p.status === "ACTIVE");
  const closed = packages.filter((p) => p.status !== "ACTIVE");

  return (
    <section className="mt-8">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-heading text-lg font-bold text-foreground">الباقات</h2>
        <Button size="sm" onClick={() => setSellOpen(true)} disabled={sellable.length === 0}>
          <Plus />
          بيع باقة
        </Button>
      </div>

      {packages.length === 0 ? (
        <Card className="py-10 text-center">
          <p className="font-sans text-sm text-muted-foreground">لا توجد باقات لهذا المريض.</p>
        </Card>
      ) : (
        <div className="space-y-3">
          {open.map((p) => (
            <PackageCard
              key={p.id}
              pkg={p}
              names={names}
              appointmentBasePath={appointmentBasePath}
            />
          ))}
          {closed.length > 0 && (
            <Button variant="ghost" size="sm" onClick={() => setShowClosed((v) => !v)}>
              <ChevronDown className={showClosed ? "rotate-180" : undefined} />
              {showClosed ? "إخفاء" : "عرض"} الباقات المنتهية والمستهلكة ({closed.length})
            </Button>
          )}
          {showClosed &&
            closed.map((p) => (
              <PackageCard
                key={p.id}
                pkg={p}
                names={names}
                appointmentBasePath={appointmentBasePath}
              />
            ))}
        </div>
      )}

      <SellPackageModal
        open={sellOpen}
        onClose={() => setSellOpen(false)}
        patientId={patientId}
        sellable={sellable}
        branches={branches}
        names={names}
      />
    </section>
  );
}

function PackageCard({
  pkg,
  names,
  appointmentBasePath,
}: {
  pkg: PatientPackageView;
  names: { categories: Record<string, string>; services: Record<string, string> };
  appointmentBasePath: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [ledgerOpen, setLedgerOpen] = useState(false);
  const [dialog, setDialog] = useState<null | "adjust" | "extend" | "cancel">(null);
  const canManage = pkg.manageable;
  const active = pkg.status === "ACTIVE";

  function run(fn: () => Promise<{ error?: string }>, success: string) {
    startTransition(async () => {
      const res = await fn();
      if (res.error) toast.error(res.error);
      else {
        toast.success(success);
        router.refresh();
      }
    });
  }

  const lookup = {
    category: (id: string) => names.categories[id],
    service: (id: string) => names.services[id],
  };

  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Package className="h-4 w-4 text-primary" />
            <span className="font-sans font-semibold text-foreground">{pkg.name}</span>
            <Badge variant={STATUS_VARIANT[pkg.status]}>
              {PATIENT_PACKAGE_STATUS_LABEL[pkg.status]}
            </Badge>
            <Badge variant={PAYMENT_VARIANT[pkg.paymentStatus]}>
              {PAYMENT_STATUS_LABEL[pkg.paymentStatus]}
            </Badge>
            {pkg.source === "OFFER" && <Badge variant="violet">هدية عرض</Badge>}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 font-sans text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <MapPin className="h-3.5 w-3.5" />
              {pkg.branchName}
            </span>
            <span className="flex items-center gap-1">
              <CalendarClock className="h-3.5 w-3.5" />
              صالحة حتى {shortDay(pkg.expiresOn)}
            </span>
            <span className="flex items-center gap-1">
              <CreditCard className="h-3.5 w-3.5" />
              {formatFee(pkg.pricePaid)}
              {pkg.pricePaid !== pkg.basePrice && ` (بدلاً من ${formatFee(pkg.basePrice)})`}
              {pkg.offerLabel && ` · ${pkg.offerLabel}`}
            </span>
            <span>اشتُريت {fmtDate(pkg.purchasedAt)}</span>
          </div>
        </div>

        {canManage && (
          <div className="flex flex-wrap gap-1">
            {pkg.paymentStatus === "UNPAID" && pkg.status !== "CANCELLED" && (
              <Button
                size="sm"
                variant="success"
                disabled={isPending}
                onClick={() => run(() => confirmPackagePaymentAction(pkg.id), "تم تأكيد الدفع")}
              >
                تأكيد الدفع
              </Button>
            )}
            {(active || pkg.status === "USED_UP") && (
              <Button size="sm" variant="outline" onClick={() => setDialog("adjust")}>
                تعديل الرصيد
              </Button>
            )}
            {pkg.status !== "CANCELLED" && (
              <Button size="sm" variant="outline" onClick={() => setDialog("extend")}>
                تمديد
              </Button>
            )}
            {pkg.status !== "CANCELLED" && (
              <Button size="sm" variant="ghost-destructive" onClick={() => setDialog("cancel")}>
                إلغاء
              </Button>
            )}
          </div>
        )}
      </div>

      <div className="mt-4 space-y-3">
        {pkg.balances.map((b) => {
          const remaining = Math.max(0, b.total - b.used);
          const unit = b.creditType === "SESSIONS" ? "جلسة" : "وحدة";
          return (
            <div key={b.id}>
              <div className="mb-1 flex flex-wrap items-center justify-between gap-2 font-sans text-sm">
                <span className="text-foreground">
                  {creditLineText({ ...b, quantity: b.total }, lookup)}
                </span>
                <span className="text-muted-foreground">
                  متبقٍ <span className="font-semibold text-foreground">{remaining}</span> من{" "}
                  {b.total} {unit}
                  {b.reserved > 0 && ` · ${b.reserved} محجوزة لمواعيد قادمة`}
                </span>
              </div>
              <Progress value={b.total ? (b.used / b.total) * 100 : 0} />
            </div>
          );
        })}
      </div>

      <Button variant="ghost" size="sm" className="mt-3" onClick={() => setLedgerOpen((v) => !v)}>
        <ChevronDown className={ledgerOpen ? "rotate-180" : undefined} />
        سجل الحركات ({pkg.ledger.length})
      </Button>
      {ledgerOpen && (
        <div className="mt-2 divide-y divide-border rounded-lg border border-border">
          {pkg.ledger.map((l) => (
            <div
              key={l.id}
              className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 font-sans text-xs"
            >
              <span className="w-28 text-muted-foreground">{fmtDate(l.createdAt)}</span>
              <Badge variant="outline">{LEDGER_TYPE_LABEL[l.type]}</Badge>
              <span
                dir="ltr"
                className={
                  l.quantity < 0 ? "text-red-600" : l.quantity > 0 ? "text-emerald-600" : ""
                }
              >
                {l.quantity > 0 ? `+${l.quantity}` : l.quantity}
              </span>
              {l.serviceName && <span className="text-foreground">{l.serviceName}</span>}
              {l.note && <span className="text-muted-foreground">{l.note}</span>}
              {l.appointmentId && (
                <Link
                  href={`${appointmentBasePath}/${l.appointmentId}`}
                  className="text-primary hover:underline"
                >
                  الموعد
                </Link>
              )}
            </div>
          ))}
        </div>
      )}

      {dialog === "adjust" && (
        <AdjustModal pkg={pkg} onClose={() => setDialog(null)} lookup={lookup} />
      )}
      {dialog === "extend" && <ExtendModal pkg={pkg} onClose={() => setDialog(null)} />}
      {dialog === "cancel" && <CancelModal pkg={pkg} onClose={() => setDialog(null)} />}
    </Card>
  );
}

function useSubmit(onDone: () => void) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const submit = (fn: () => Promise<{ error?: string }>, success: string) => {
    setError(null);
    startTransition(async () => {
      const res = await fn();
      if (res.error) setError(res.error);
      else {
        toast.success(success);
        onDone();
        router.refresh();
      }
    });
  };
  return { error, isPending, submit };
}

function AdjustModal({
  pkg,
  onClose,
  lookup,
}: {
  pkg: PatientPackageView;
  onClose: () => void;
  lookup: {
    category: (id: string) => string | undefined;
    service: (id: string) => string | undefined;
  };
}) {
  const [balanceId, setBalanceId] = useState(pkg.balances[0]?.id ?? "");
  const [direction, setDirection] = useState<"add" | "remove">("add");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const { error, isPending, submit } = useSubmit(onClose);
  return (
    <Modal open onClose={onClose} title={`تعديل رصيد «${pkg.name}»`}>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          const n = Number(amount);
          submit(
            () => adjustBalanceAction({ balanceId, delta: direction === "add" ? n : -n, note }),
            "تم تعديل الرصيد"
          );
        }}
      >
        {error && <Alert variant="destructive">{error}</Alert>}
        {pkg.balances.length > 1 && (
          <FormField
            type="select"
            label="الرصيد"
            value={balanceId}
            onValueChange={setBalanceId}
            options={pkg.balances.map((b) => ({
              value: b.id,
              label: creditLineText({ ...b, quantity: b.total }, lookup),
            }))}
          />
        )}
        <div className="flex gap-3">
          <FormField
            type="select"
            label="العملية"
            value={direction}
            onValueChange={(v) => setDirection(v as "add" | "remove")}
            options={[
              { value: "add", label: "إضافة" },
              { value: "remove", label: "خصم" },
            ]}
            className="w-36"
          />
          <FormField
            type="number"
            label="الكمية"
            min={1}
            value={amount}
            onValueChange={setAmount}
            className="flex-1"
          />
        </div>
        <FormField type="textarea" rows={2} label="السبب *" value={note} onValueChange={setNote} />
        <Button type="submit" loading={isPending} className="w-full">
          حفظ
        </Button>
      </form>
    </Modal>
  );
}

function ExtendModal({ pkg, onClose }: { pkg: PatientPackageView; onClose: () => void }) {
  const [expiresOn, setExpiresOn] = useState(pkg.expiresOn);
  const [note, setNote] = useState("");
  const { error, isPending, submit } = useSubmit(onClose);
  return (
    <Modal
      open
      onClose={onClose}
      title={`تمديد «${pkg.name}»`}
      description={
        pkg.status === "EXPIRED" ? "تمديد باقة منتهية يعيد تفعيلها برصيدها المتبقي." : undefined
      }
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          submit(
            () => extendPackageAction({ patientPackageId: pkg.id, expiresOn, note }),
            "تم تحديث تاريخ الانتهاء"
          );
        }}
      >
        {error && <Alert variant="destructive">{error}</Alert>}
        <FormField
          type="date"
          label="آخر يوم صلاحية"
          value={expiresOn}
          onValueChange={setExpiresOn}
        />
        <FormField type="textarea" rows={2} label="السبب *" value={note} onValueChange={setNote} />
        <Button type="submit" loading={isPending} className="w-full">
          حفظ
        </Button>
      </form>
    </Modal>
  );
}

function CancelModal({ pkg, onClose }: { pkg: PatientPackageView; onClose: () => void }) {
  const [note, setNote] = useState("");
  const { error, isPending, submit } = useSubmit(onClose);
  return (
    <Modal open onClose={onClose} title={`إلغاء «${pkg.name}»`}>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          submit(
            () => cancelPatientPackageAction({ patientPackageId: pkg.id, note }),
            "تم إلغاء الباقة"
          );
        }}
      >
        {error && <Alert variant="destructive">{error}</Alert>}
        <p className="font-sans text-sm text-red-600">
          لن يتمكن المريض من استخدام الرصيد المتبقي بعد الإلغاء. يُسجَّل الإلغاء في سجل الحركات.
        </p>
        <FormField type="textarea" rows={2} label="السبب *" value={note} onValueChange={setNote} />
        <Button type="submit" variant="destructive" loading={isPending} className="w-full">
          إلغاء الباقة
        </Button>
      </form>
    </Modal>
  );
}

function SellPackageModal({
  open,
  onClose,
  patientId,
  sellable,
  branches,
  names,
}: {
  open: boolean;
  onClose: () => void;
  patientId: string;
  sellable: SellablePackage[];
  branches: { id: string; name: string }[];
  names: { categories: Record<string, string>; services: Record<string, string> };
}) {
  const [packageId, setPackageId] = useState("");
  const [branchId, setBranchId] = useState("");
  const [paid, setPaid] = useState(true);
  const [note, setNote] = useState("");
  const [quote, setQuote] = useState<PackageQuote | null>(null);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const { error, isPending, submit } = useSubmit(onClose);

  const pkg = sellable.find((p) => p.id === packageId);
  const branchOptions = useMemo(
    () => branches.filter((b) => !pkg || pkg.allBranches || pkg.branchIds.includes(b.id)),
    [branches, pkg]
  );

  useEffect(() => {
    if (!open) return;
    setPackageId(sellable[0]?.id ?? "");
    setNote("");
    setPaid(true);
  }, [open, sellable]);

  useEffect(() => {
    if (!branchOptions.some((b) => b.id === branchId)) setBranchId(branchOptions[0]?.id ?? "");
  }, [branchOptions, branchId]);

  useEffect(() => {
    setQuote(null);
    setQuoteError(null);
    if (!open || !packageId || !branchId) return;
    let live = true;
    quotePackageAction(packageId, branchId).then((res) => {
      if (!live) return;
      if ("quote" in res && res.quote) setQuote(res.quote);
      else setQuoteError(res.error ?? null);
    });
    return () => {
      live = false;
    };
  }, [open, packageId, branchId]);

  return (
    <Modal open={open} onClose={onClose} title="بيع باقة للمريض">
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          submit(
            () =>
              sellPackageAction({ patientId, packageId, branchId, paid, note: note || undefined }),
            "تم بيع الباقة"
          );
        }}
      >
        {error && <Alert variant="destructive">{error}</Alert>}
        <FormField
          type="select"
          label="الباقة"
          value={packageId}
          onValueChange={setPackageId}
          options={sellable.map((p) => ({ value: p.id, label: p.name }))}
        />
        <FormField
          type="select"
          label="الفرع"
          value={branchId}
          onValueChange={setBranchId}
          options={branchOptions.map((b) => ({ value: b.id, label: b.name }))}
          hint="تُستخدم الباقة في هذا الفرع فقط."
        />
        {quoteError && <Alert variant="destructive">{quoteError}</Alert>}
        {quote && (
          <div className="space-y-1 rounded-xl border border-border bg-muted/30 p-3 font-sans text-sm">
            <p>
              السعر: <span className="font-semibold">{formatFee(quote.price)}</span>
              {quote.discount > 0 && (
                <span className="text-muted-foreground line-through">
                  {" "}
                  {formatFee(quote.basePrice)}
                </span>
              )}
              {quote.offerLabel && <span className="text-accent"> · {quote.offerLabel}</span>}
            </p>
            <p className="text-muted-foreground">
              يشمل:{" "}
              {quote.items
                .map((i) =>
                  creditLineText(
                    {
                      ...i,
                      quantity: i.quantity + (i.creditType === "UNITS" ? quote.bonusUnits : 0),
                    },
                    { category: (id) => names.categories[id], service: (id) => names.services[id] }
                  )
                )
                .join(" + ")}
            </p>
            <p className="text-muted-foreground">صالحة حتى {shortDay(quote.expiresOn)}</p>
            {quote.terms && <p className="text-xs text-muted-foreground">الشروط: {quote.terms}</p>}
          </div>
        )}
        <FormField
          type="checkbox"
          label="تم استلام المبلغ"
          checked={paid}
          onCheckedChange={setPaid}
          hint="يمكن استخدام الباقة حتى قبل الدفع، وتأكيد الدفع لاحقاً."
        />
        <FormField label="ملاحظة (اختياري)" value={note} onValueChange={setNote} />
        <Button type="submit" loading={isPending} disabled={!quote} className="w-full">
          بيع الباقة
        </Button>
      </form>
    </Modal>
  );
}
