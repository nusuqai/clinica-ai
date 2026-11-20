"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Clock,
  FolderTree,
  LayoutTemplate,
  MapPin,
  Pencil,
  Plus,
  Search,
  Trash2,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { Hint } from "@/components/ui/tooltip";
import { deleteServiceAction, setServiceActiveAction } from "@/server/actions/catalog";
import { SERVICE_KIND_LABEL, durationText, servicePriceText } from "@/lib/catalog";
import type { CategoryView, PractitionerOption, ServiceView } from "@/server/services/catalog";
import CategoriesModal from "./categories-modal";
import TemplatesModal from "./templates-modal";
import ServiceFormModal, { type BranchOption } from "./service-form-modal";

export default function ServicesManager({
  categories,
  services,
  branches,
  practitioners,
  limited,
}: {
  categories: CategoryView[];
  services: ServiceView[];
  /** The branches the member manages (all of them when not limited). */
  branches: BranchOption[];
  practitioners: PractitionerOption[];
  /** The member is limited to some branches: no category edits, own branches only. */
  limited: boolean;
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const [isPending, startTransition] = useTransition();
  const [query, setQuery] = useState("");
  const [categoriesOpen, setCategoriesOpen] = useState(false);
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<ServiceView | null>(null);
  const [newCategoryId, setNewCategoryId] = useState("");

  const branchName = useMemo(() => new Map(branches.map((b) => [b.id, b.name])), [branches]);

  const grouped = useMemo(() => {
    const q = query.trim().toLowerCase();
    const visible = q ? services.filter((s) => s.name.toLowerCase().includes(q)) : services;
    return categories
      .map((c) => ({ category: c, items: visible.filter((s) => s.categoryId === c.id) }))
      .filter((g) => g.items.length > 0 || (!q && g.category.isActive));
  }, [categories, services, query]);

  const activeCategories = categories.filter((c) => c.isActive);

  function openCreate(categoryId = "") {
    setEditing(null);
    setNewCategoryId(categoryId || activeCategories[0]?.id || "");
    setFormOpen(true);
  }
  function openEdit(s: ServiceView) {
    setEditing(s);
    setFormOpen(true);
  }

  function runAction(fn: () => Promise<{ error?: string } | void>) {
    startTransition(async () => {
      const res = await fn();
      if (res && "error" in res && res.error) toast.error(res.error);
      else router.refresh();
    });
  }

  async function handleDelete(s: ServiceView) {
    const deleted = await confirm({
      title: "حذف الخدمة",
      description: <>هل تريد حذف الخدمة «{s.name}»؟</>,
      warning: "سيتم حذفها نهائياً ولا يمكن التراجع.",
      onConfirm: () => deleteServiceAction(s.id),
    });
    if (deleted) startTransition(() => router.refresh());
  }

  function branchSummary(s: ServiceView): string {
    if (s.allBranches) return "كل الفروع";
    const names = s.branches.map((b) => branchName.get(b.branchId)).filter(Boolean);
    const hidden = s.branches.length - names.length;
    const shown = names.slice(0, 2).join("، ");
    const more = names.length - 2 + hidden;
    return more > 0 ? `${shown || "فروع أخرى"} +${more}` : shown;
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative min-w-52 flex-1">
          <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="ابحث باسم الخدمة"
            className="ps-9"
          />
        </div>
        {!limited && (
          <Button variant="outline" onClick={() => setCategoriesOpen(true)}>
            <FolderTree />
            التصنيفات
          </Button>
        )}
        {!limited && (
          <Button variant="outline" onClick={() => setTemplatesOpen(true)}>
            <LayoutTemplate />
            قوالب جاهزة
          </Button>
        )}
        <Button onClick={() => openCreate()} disabled={activeCategories.length === 0}>
          <Plus />
          إضافة خدمة
        </Button>
      </div>

      {categories.length === 0 ? (
        <Card className="py-16 text-center">
          <p className="font-sans text-muted-foreground">
            {limited
              ? "لا توجد تصنيفات بعد. يضيفها من يدير كل فروع العيادة."
              : "ابدأ بإضافة تصنيف (مثال: ليزر، حشو، تغذية)، ثم أضف خدماتك داخله."}
          </p>
          {!limited && (
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              <Button onClick={() => setTemplatesOpen(true)}>
                <LayoutTemplate />
                ابدأ بقالب جاهز
              </Button>
              <Button variant="outline" onClick={() => setCategoriesOpen(true)}>
                <Plus />
                إضافة تصنيف
              </Button>
            </div>
          )}
        </Card>
      ) : grouped.length === 0 ? (
        <Card className="py-16 text-center">
          <p className="font-sans text-muted-foreground">لا توجد خدمات مطابقة.</p>
        </Card>
      ) : (
        <div className="space-y-5">
          {grouped.map(({ category, items }) => (
            <Card key={category.id} className="overflow-hidden">
              <div className="flex items-center justify-between gap-3 border-b border-border bg-muted/40 px-5 py-3">
                <div className="flex items-center gap-2">
                  <h2 className="font-heading font-bold text-foreground">{category.name}</h2>
                  <Badge variant="muted">{items.length}</Badge>
                  {!category.isActive && <Badge variant="neutral">تصنيف معطّل</Badge>}
                </div>
                {category.isActive && (
                  <Button variant="ghost" size="sm" onClick={() => openCreate(category.id)}>
                    <Plus />
                    خدمة
                  </Button>
                )}
              </div>

              {items.length === 0 ? (
                <p className="px-5 py-6 font-sans text-sm text-muted-foreground">
                  لا توجد خدمات في هذا التصنيف بعد.
                </p>
              ) : (
                <div className="divide-y divide-border">
                  {items.map((s) => (
                    <div
                      key={s.id}
                      className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-sans font-medium text-foreground">{s.name}</span>
                          <Badge variant="outline">{SERVICE_KIND_LABEL[s.kind]}</Badge>
                          {!s.isActive && <Badge variant="neutral">معطّلة</Badge>}
                          {!s.bookable && <Badge variant="warning">لا تُحجز مباشرة</Badge>}
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 font-sans text-xs text-muted-foreground">
                          <span className="font-medium text-foreground">{servicePriceText(s)}</span>
                          {s.durationMin && (
                            <span className="flex items-center gap-1">
                              <Clock className="h-3.5 w-3.5" />
                              {durationText(s.durationMin)}
                            </span>
                          )}
                          <span className="flex items-center gap-1">
                            <MapPin className="h-3.5 w-3.5" />
                            {branchSummary(s)}
                          </span>
                          <span className="flex items-center gap-1">
                            <Users className="h-3.5 w-3.5" />
                            {s.doctors.length === 0
                              ? "لا يقدّمها أحد بعد"
                              : `${s.doctors.length} مقدم خدمة`}
                          </span>
                        </div>
                      </div>

                      <div className="flex flex-shrink-0 items-center gap-1">
                        <Hint label={s.access === "full" ? "تعديل" : "تعديل ما يخص فروعك"}>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => openEdit(s)}
                            aria-label="تعديل"
                            className="hover:bg-primary/10 hover:text-primary"
                          >
                            <Pencil />
                          </Button>
                        </Hint>
                        {s.access === "full" && (
                          <>
                            <Button
                              variant="ghost"
                              size="sm"
                              disabled={isPending}
                              onClick={() =>
                                runAction(() => setServiceActiveAction(s.id, !s.isActive))
                              }
                            >
                              {s.isActive ? "تعطيل" : "تفعيل"}
                            </Button>
                            <Hint
                              label={s.used ? "مستخدمة في حجوزات — عطّلها بدلاً من حذفها" : "حذف"}
                            >
                              <span>
                                <Button
                                  variant="ghost-destructive"
                                  size="icon"
                                  disabled={isPending || s.used}
                                  onClick={() => handleDelete(s)}
                                  aria-label="حذف"
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
              )}
            </Card>
          ))}
        </div>
      )}

      {!limited && <TemplatesModal open={templatesOpen} onClose={() => setTemplatesOpen(false)} />}
      {!limited && (
        <CategoriesModal
          open={categoriesOpen}
          onClose={() => setCategoriesOpen(false)}
          categories={categories}
        />
      )}
      <ServiceFormModal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        service={editing}
        categories={categories}
        branches={branches}
        practitioners={practitioners}
        limited={limited}
        defaultCategoryId={newCategoryId}
      />
    </div>
  );
}
