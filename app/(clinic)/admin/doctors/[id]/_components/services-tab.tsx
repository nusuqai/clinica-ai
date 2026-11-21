"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { setDoctorServicesAction } from "@/server/actions/catalog";
import { durationText, pricingUsesPrice, servicePriceText } from "@/lib/catalog";
import type { CategoryView, DoctorServiceView, ServiceView } from "@/server/services/catalog";

interface Row {
  on: boolean;
  price: string;
  durationMin: string;
}

const MONEY = /^\d+(\.\d{1,2})?$/;
const INT = /^[1-9]\d*$/;

/**
 * What this practitioner provides. Ticking a service makes them bookable for
 * it; price / duration are optional overrides of the service's own values.
 */
export default function DoctorServicesTab({
  doctorId,
  doctorBranchIds,
  categories,
  services,
  assigned,
  canManageCatalog,
}: {
  doctorId: string;
  doctorBranchIds: string[];
  categories: CategoryView[];
  /** Every service the member can see. */
  services: ServiceView[];
  assigned: DoctorServiceView[];
  /** Holds "services": show the link to the catalog. */
  canManageCatalog: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const initial = useMemo(() => {
    const byId = new Map(assigned.map((a) => [a.serviceId, a]));
    const rows: Record<string, Row> = {};
    for (const s of services) {
      const a = byId.get(s.id);
      rows[s.id] = {
        on: !!a,
        price: a?.price != null ? String(a.price) : "",
        durationMin: a?.durationMin != null ? String(a.durationMin) : "",
      };
    }
    return rows;
  }, [services, assigned]);
  const [rows, setRows] = useState(initial);

  // Inactive services are listed only while still assigned, so they can be removed.
  const grouped = categories
    .map((c) => ({
      category: c,
      items: services.filter((s) => s.categoryId === c.id && (s.isActive || initial[s.id]?.on)),
    }))
    .filter((g) => g.items.length > 0);

  const dirty = JSON.stringify(rows) !== JSON.stringify(initial);
  const selectedCount = Object.values(rows).filter((r) => r.on).length;

  function patch(id: string, change: Partial<Row>) {
    setRows((prev) => ({ ...prev, [id]: { ...prev[id], ...change } }));
  }

  function offeredInDoctorBranches(s: ServiceView): boolean {
    return s.allBranches || s.branches.some((b) => doctorBranchIds.includes(b.branchId));
  }

  function save() {
    setError(null);
    const payload: { serviceId: string; price: number | null; durationMin: number | null }[] = [];
    for (const s of services) {
      const r = rows[s.id];
      if (!r?.on) continue;
      const price = r.price.trim();
      const dur = r.durationMin.trim();
      if (price && !MONEY.test(price)) return setError(`سعر غير صحيح للخدمة «${s.name}».`);
      if (dur && !INT.test(dur)) return setError(`مدة غير صحيحة للخدمة «${s.name}».`);
      payload.push({
        serviceId: s.id,
        price: price ? Number(price) : null,
        durationMin: dur ? Number(dur) : null,
      });
    }
    startTransition(async () => {
      const res = await setDoctorServicesAction(doctorId, payload);
      if (res.error) setError(res.error);
      else {
        toast.success("تم حفظ الخدمات");
        router.refresh();
      }
    });
  }

  if (services.length === 0) {
    return (
      <Card className="py-16 text-center">
        <p className="font-sans text-muted-foreground">لا توجد خدمات في العيادة بعد.</p>
        {canManageCatalog && (
          <Button asChild className="mt-4">
            <Link href="/admin/services">إضافة الخدمات</Link>
          </Button>
        )}
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {error && <Alert variant="destructive">{error}</Alert>}
      {selectedCount === 0 && <Alert>لن يظهر للحجز حتى تُسند له خدمة واحدة على الأقل.</Alert>}

      {grouped.map(({ category, items }) => (
        <Card key={category.id} className="overflow-hidden">
          <div className="border-b border-border bg-muted/40 px-5 py-2.5">
            <h3 className="font-heading font-bold text-foreground">{category.name}</h3>
          </div>
          <div className="divide-y divide-border">
            {items.map((s) => {
              const r = rows[s.id];
              const id = `svc-${s.id}`;
              return (
                <div key={s.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3">
                  <div className="flex min-w-52 flex-1 items-start gap-2.5">
                    <Checkbox
                      id={id}
                      checked={r.on}
                      onCheckedChange={(c) => patch(s.id, { on: c === true })}
                      className="mt-0.5"
                    />
                    <div className="min-w-0">
                      <label
                        htmlFor={id}
                        className="flex flex-wrap items-center gap-2 font-sans font-medium text-foreground"
                      >
                        {s.name}
                        {!s.isActive && <Badge variant="neutral">معطّلة</Badge>}
                        {r.on && !offeredInDoctorBranches(s) && (
                          <Badge variant="warning">غير متاحة في فروعه</Badge>
                        )}
                      </label>
                      <p className="mt-0.5 font-sans text-xs text-muted-foreground">
                        {servicePriceText(s)}
                        {s.durationMin ? ` · ${durationText(s.durationMin)}` : ""}
                      </p>
                    </div>
                  </div>
                  {r.on && (
                    <div className="flex items-center gap-2">
                      {pricingUsesPrice(s.pricingType) && (
                        <Input
                          type="number"
                          dir="ltr"
                          min={0}
                          step="0.01"
                          value={r.price}
                          onChange={(e) => patch(s.id, { price: e.target.value })}
                          placeholder="سعر خاص"
                          aria-label={`سعر خاص للخدمة ${s.name}`}
                          className="h-9 w-32"
                        />
                      )}
                      <Input
                        type="number"
                        dir="ltr"
                        min={1}
                        value={r.durationMin}
                        onChange={(e) => patch(s.id, { durationMin: e.target.value })}
                        placeholder="مدة خاصة (د)"
                        aria-label={`مدة خاصة للخدمة ${s.name}`}
                        className="h-9 w-32"
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </Card>
      ))}

      <div className="flex items-center gap-3">
        <Button onClick={save} loading={isPending} disabled={!dirty}>
          {isPending ? "جارٍ الحفظ..." : "حفظ الخدمات"}
        </Button>
        <span className="font-sans text-sm text-muted-foreground">
          {selectedCount} خدمة مختارة · السعر والمدة الخاصان اختياريان
        </span>
      </div>
    </div>
  );
}
