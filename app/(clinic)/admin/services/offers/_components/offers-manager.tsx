"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CalendarRange, Copy, MapPin, Pencil, Plus, Tag, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Badge, type BadgeVariant } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { Hint } from "@/components/ui/tooltip";
import {
  deleteOfferAction,
  duplicateOfferAction,
  setOfferActiveAction,
} from "@/server/actions/catalog";
import { OFFER_STATUS_LABEL, OFFER_TYPE_LABEL, type OfferStatus } from "@/lib/offers";
import { formatFee } from "@/lib/currency";
import type { CategoryView } from "@/server/services/catalog";
import type { OfferView } from "@/server/services/offers";
import OfferFormModal, { type OfferBranchOption, type TargetOption } from "./offer-form-modal";

const STATUS_VARIANT: Record<OfferStatus, BadgeVariant> = {
  ACTIVE: "success",
  SCHEDULED: "info",
  PAUSED: "neutral",
  EXPIRED: "muted",
};

const FILTERS: { key: "all" | OfferStatus; label: string }[] = [
  { key: "all", label: "الكل" },
  { key: "ACTIVE", label: "فعّال" },
  { key: "SCHEDULED", label: "مجدول" },
  { key: "PAUSED", label: "موقوف" },
  { key: "EXPIRED", label: "منتهٍ" },
];

function valueText(o: OfferView): string {
  switch (o.type) {
    case "PERCENT_OFF":
      return `${o.value}%`;
    case "AMOUNT_OFF":
      return `- ${formatFee(o.value ?? 0)}`;
    case "FIXED_PRICE":
      return formatFee(o.value ?? 0);
    case "BUY_X_GET_Y":
      return `${o.buyQty} + ${o.getQty} هدية`;
    case "BONUS_UNITS":
      return `+ ${o.value} وحدة`;
  }
}

const shortDay = (key: string) => key.split("-").reverse().join("/");

export default function OffersManager({
  offers,
  categories,
  services,
  packages,
  branches,
  limited,
  today,
}: {
  offers: OfferView[];
  categories: CategoryView[];
  services: TargetOption[];
  packages: TargetOption[];
  branches: OfferBranchOption[];
  limited: boolean;
  today: string;
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const [isPending, startTransition] = useTransition();
  const [filter, setFilter] = useState<"all" | OfferStatus>("all");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<OfferView | null>(null);

  const names = useMemo(
    () => ({
      category: new Map(categories.map((c) => [c.id, c.name])),
      service: new Map(services.map((s) => [s.id, s.name])),
      package: new Map(packages.map((p) => [p.id, p.name])),
      branch: new Map(branches.map((b) => [b.id, b.name])),
    }),
    [categories, services, packages, branches]
  );

  const visible = filter === "all" ? offers : offers.filter((o) => o.status === filter);

  function run(fn: () => Promise<{ error?: string }>, success?: string) {
    startTransition(async () => {
      const res = await fn();
      if (res.error) toast.error(res.error);
      else {
        if (success) toast.success(success);
        router.refresh();
      }
    });
  }

  function targetsText(o: OfferView): string {
    const parts = [
      ...o.categoryIds.map((id) => `تصنيف ${names.category.get(id) ?? "—"}`),
      ...o.serviceIds.map((id) => names.service.get(id) ?? "خدمة"),
      ...o.packageIds.map((id) => names.package.get(id) ?? "باقة"),
    ];
    return parts.length > 3
      ? `${parts.slice(0, 3).join("، ")} +${parts.length - 3}`
      : parts.join("، ");
  }

  function datesText(o: OfferView): string {
    if (!o.startsAt && !o.endsAt) return "دائم";
    if (o.startsAt && o.endsAt) return `${shortDay(o.startsAt)} → ${shortDay(o.endsAt)}`;
    return o.startsAt ? `من ${shortDay(o.startsAt)}` : `حتى ${shortDay(o.endsAt!)}`;
  }

  async function handleDelete(o: OfferView) {
    const deleted = await confirm({
      title: "حذف العرض",
      description: <>هل تريد حذف العرض «{o.name}»؟</>,
      warning: "سيتم حذفه نهائياً ولا يمكن التراجع.",
      onConfirm: () => deleteOfferAction(o.id),
    });
    if (deleted) startTransition(() => router.refresh());
  }

  const nothingToTarget = services.length + packages.length + categories.length === 0;

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-1">
          {FILTERS.map((f) => (
            <Button
              key={f.key}
              size="sm"
              variant={filter === f.key ? "default" : "outline"}
              onClick={() => setFilter(f.key)}
            >
              {f.label}
            </Button>
          ))}
        </div>
        <Button
          onClick={() => {
            setEditing(null);
            setFormOpen(true);
          }}
          disabled={nothingToTarget}
        >
          <Plus />
          إضافة عرض
        </Button>
      </div>

      {visible.length === 0 ? (
        <Card className="py-16 text-center">
          <p className="font-sans text-muted-foreground">
            {offers.length === 0
              ? nothingToTarget
                ? "أضف خدماتك أولاً، ثم أنشئ العروض عليها."
                : "لا توجد عروض بعد. أنشئ عرضاً بخصم أو سعر خاص أو جلسة هدية."
              : "لا توجد عروض بهذه الحالة."}
          </p>
        </Card>
      ) : (
        <Card className="divide-y divide-border">
          {visible.map((o) => (
            <div key={o.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-4">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-sans font-medium text-foreground">{o.name}</span>
                  <Badge variant={STATUS_VARIANT[o.status]}>{OFFER_STATUS_LABEL[o.status]}</Badge>
                  <Badge variant="accent">{valueText(o)}</Badge>
                  {o.usageCount > 0 && <Badge variant="muted">استُخدم {o.usageCount} مرة</Badge>}
                </div>
                <p className="mt-0.5 font-sans text-sm text-muted-foreground">
                  «{o.label}» · {OFFER_TYPE_LABEL[o.type]}
                </p>
                <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 font-sans text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Tag className="h-3.5 w-3.5" />
                    {targetsText(o)}
                  </span>
                  <span className="flex items-center gap-1">
                    <CalendarRange className="h-3.5 w-3.5" />
                    {datesText(o)}
                  </span>
                  <span className="flex items-center gap-1">
                    <MapPin className="h-3.5 w-3.5" />
                    {o.allBranches
                      ? "كل الفروع"
                      : o.branchIds.map((id) => names.branch.get(id) ?? "—").join("، ")}
                  </span>
                </div>
              </div>

              {o.editable ? (
                <div className="flex flex-shrink-0 items-center gap-1">
                  <Hint label={o.isActive ? "إيقاف العرض" : "تشغيل العرض"}>
                    <span className="me-2 flex items-center">
                      <Switch
                        checked={o.isActive}
                        disabled={isPending}
                        aria-label={o.isActive ? "إيقاف العرض" : "تشغيل العرض"}
                        onCheckedChange={(c) => run(() => setOfferActiveAction(o.id, c))}
                      />
                    </span>
                  </Hint>
                  <Hint label="تعديل">
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="تعديل"
                      className="hover:bg-primary/10 hover:text-primary"
                      onClick={() => {
                        setEditing(o);
                        setFormOpen(true);
                      }}
                    >
                      <Pencil />
                    </Button>
                  </Hint>
                  <Hint label="نسخ العرض (يُنشأ موقوفاً)">
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="نسخ"
                      disabled={isPending}
                      onClick={() => run(() => duplicateOfferAction(o.id), "تم إنشاء نسخة موقوفة")}
                    >
                      <Copy />
                    </Button>
                  </Hint>
                  <Hint label={o.usageCount > 0 ? "مستخدم — أوقفه بدلاً من حذفه" : "حذف"}>
                    <span>
                      <Button
                        variant="ghost-destructive"
                        size="icon"
                        aria-label="حذف"
                        disabled={isPending || o.usageCount > 0}
                        onClick={() => handleDelete(o)}
                      >
                        <Trash2 />
                      </Button>
                    </span>
                  </Hint>
                </div>
              ) : (
                <Badge variant="outline">يديره مسؤول كل الفروع</Badge>
              )}
            </div>
          ))}
        </Card>
      )}

      <OfferFormModal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        offer={editing}
        categories={categories}
        services={services}
        packages={packages}
        branches={branches}
        limited={limited}
        today={today}
      />
    </div>
  );
}
