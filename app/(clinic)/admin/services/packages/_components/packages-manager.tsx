"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CalendarClock, Layers, MapPin, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { Hint } from "@/components/ui/tooltip";
import { deletePackageAction, setPackageActiveAction } from "@/server/actions/catalog";
import { formatFee } from "@/lib/currency";
import { creditLineText } from "@/lib/packages";
import type { CategoryView } from "@/server/services/catalog";
import type { PackageView } from "@/server/services/packages";
import PackageFormModal, {
  type PackageBranchOption,
  type PackageServiceOption,
} from "./package-form-modal";

export default function PackagesManager({
  packages,
  categories,
  services,
  branches,
  limited,
}: {
  packages: PackageView[];
  categories: CategoryView[];
  services: PackageServiceOption[];
  branches: PackageBranchOption[];
  limited: boolean;
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const [isPending, startTransition] = useTransition();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<PackageView | null>(null);

  const names = useMemo(
    () => ({
      category: new Map(categories.map((c) => [c.id, c.name])),
      service: new Map(services.map((s) => [s.id, s.name])),
      branch: new Map(branches.map((b) => [b.id, b.name])),
    }),
    [categories, services, branches]
  );
  const activeCategories = categories.filter((c) => c.isActive);

  function run(fn: () => Promise<{ error?: string }>) {
    startTransition(async () => {
      const res = await fn();
      if (res.error) toast.error(res.error);
      else router.refresh();
    });
  }

  const grouped = categories
    .map((c) => ({ category: c, items: packages.filter((p) => p.categoryId === c.id) }))
    .filter((g) => g.items.length > 0);

  return (
    <div>
      <div className="mb-4 flex justify-end">
        <Button
          onClick={() => {
            setEditing(null);
            setFormOpen(true);
          }}
          disabled={activeCategories.length === 0}
        >
          <Plus />
          إضافة باقة
        </Button>
      </div>

      {packages.length === 0 ? (
        <Card className="py-16 text-center">
          <p className="font-sans text-muted-foreground">
            {activeCategories.length === 0
              ? "أضف تصنيفاً وخدمات أولاً من تبويب الخدمات، ثم أنشئ الباقات."
              : "لا توجد باقات بعد. مثال: «1500 نبضة لمدة 3 شهور» أو «10 جلسات علاج طبيعي»."}
          </p>
        </Card>
      ) : (
        <div className="space-y-5">
          {grouped.map(({ category, items }) => (
            <Card key={category.id} className="overflow-hidden">
              <div className="flex items-center gap-2 border-b border-border bg-muted/40 px-5 py-3">
                <h2 className="font-heading font-bold text-foreground">{category.name}</h2>
                <Badge variant="muted">{items.length}</Badge>
              </div>
              <div className="divide-y divide-border">
                {items.map((p) => (
                  <div key={p.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-sans font-medium text-foreground">{p.name}</span>
                        <Badge variant="accent">{formatFee(p.price)}</Badge>
                        {!p.isActive && <Badge variant="neutral">معطّلة</Badge>}
                        {p.soldCount > 0 && <Badge variant="muted">بيعت {p.soldCount} مرة</Badge>}
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 font-sans text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Layers className="h-3.5 w-3.5" />
                          {p.items
                            .map((i) =>
                              creditLineText(i, {
                                category: (id) => names.category.get(id),
                                service: (id) => names.service.get(id),
                              })
                            )
                            .join(" + ")}
                        </span>
                        <span className="flex items-center gap-1">
                          <CalendarClock className="h-3.5 w-3.5" />
                          صالحة {p.validityDays} يوماً
                        </span>
                        <span className="flex items-center gap-1">
                          <MapPin className="h-3.5 w-3.5" />
                          {p.allBranches
                            ? "كل الفروع"
                            : p.branches
                                .map((b) => names.branch.get(b.branchId))
                                .filter(Boolean)
                                .join("، ") || "فروع أخرى"}
                        </span>
                      </div>
                    </div>
                    <div className="flex flex-shrink-0 items-center gap-1">
                      <Hint label={p.access === "full" ? "تعديل" : "تعديل ما يخص فروعك"}>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label="تعديل"
                          className="hover:bg-primary/10 hover:text-primary"
                          onClick={() => {
                            setEditing(p);
                            setFormOpen(true);
                          }}
                        >
                          <Pencil />
                        </Button>
                      </Hint>
                      {p.access === "full" && (
                        <>
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={isPending}
                            onClick={() => run(() => setPackageActiveAction(p.id, !p.isActive))}
                          >
                            {p.isActive ? "تعطيل" : "تفعيل"}
                          </Button>
                          <Hint
                            label={p.soldCount > 0 ? "بيعت لمرضى — عطّلها بدلاً من حذفها" : "حذف"}
                          >
                            <span>
                              <Button
                                variant="ghost-destructive"
                                size="icon"
                                aria-label="حذف"
                                disabled={isPending || p.soldCount > 0}
                                onClick={async () => {
                                  const deleted = await confirm({
                                    title: "حذف الباقة",
                                    description: <>هل تريد حذف الباقة «{p.name}»؟</>,
                                    warning: "سيتم حذفها نهائياً ولا يمكن التراجع.",
                                    onConfirm: () => deletePackageAction(p.id),
                                  });
                                  if (deleted) startTransition(() => router.refresh());
                                }}
                              >
                                <Trash2 />
                              </Button>
                            </span>
                          </Hint>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          ))}
        </div>
      )}

      <PackageFormModal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        pkg={editing}
        categories={categories}
        services={services}
        branches={branches}
        limited={limited}
      />
    </div>
  );
}
