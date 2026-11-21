"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { CreditType } from "@prisma/client";
import { Plus, Trash2 } from "lucide-react";
import Modal from "@/components/admin/modal";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { FormField } from "@/components/ui/form-field";
import { Label } from "@/components/ui/label";
import { createPackageAction, updatePackageAction } from "@/server/actions/catalog";
import { CREDIT_TYPE_LABEL } from "@/lib/packages";
import { CURRENCY_LABEL } from "@/lib/currency";
import type { CategoryView } from "@/server/services/catalog";
import type { PackageView } from "@/server/services/packages";

export interface PackageServiceOption {
  id: string;
  name: string;
  categoryId: string;
  isActive: boolean;
  unitLabel: string | null;
}

export interface PackageBranchOption {
  id: string;
  name: string;
  isActive: boolean;
}

interface LineState {
  creditType: CreditType;
  quantity: string;
  /** "category" = every service of a category; "services" = picked ones. */
  coverage: "category" | "services";
  categoryId: string;
  serviceIds: string[];
}

interface FormState {
  categoryId: string;
  name: string;
  price: string;
  validityDays: string;
  description: string;
  terms: string;
  agentNotes: string;
  allBranches: boolean;
  branches: Record<string, { on: boolean; price: string }>;
  items: LineState[];
}

const CREDIT_OPTIONS = (["UNITS", "SESSIONS"] as CreditType[]).map((c) => ({
  value: c,
  label: CREDIT_TYPE_LABEL[c],
}));
const COVERAGE_OPTIONS = [
  { value: "category", label: "كل خدمات تصنيف" },
  { value: "services", label: "خدمات محددة" },
];
const VALIDITY_PRESETS = [
  { days: 30, label: "شهر" },
  { days: 90, label: "3 شهور" },
  { days: 180, label: "6 شهور" },
  { days: 270, label: "9 شهور" },
  { days: 365, label: "سنة" },
];

function initial(
  pkg: PackageView | null,
  branches: PackageBranchOption[],
  limited: boolean,
  defaultCategoryId: string
): FormState {
  return {
    categoryId: pkg?.categoryId ?? defaultCategoryId,
    name: pkg?.name ?? "",
    price: pkg ? String(pkg.price) : "",
    validityDays: pkg ? String(pkg.validityDays) : "90",
    description: pkg?.description ?? "",
    terms: pkg?.terms ?? "",
    agentNotes: pkg?.agentNotes ?? "",
    allBranches: pkg?.allBranches ?? !limited,
    branches: Object.fromEntries(
      branches.map((b) => {
        const row = pkg?.branches.find((r) => r.branchId === b.id);
        return [b.id, { on: !!row, price: row?.price != null ? String(row.price) : "" }];
      })
    ),
    items: pkg?.items.map((i) => ({
      creditType: i.creditType,
      quantity: String(i.quantity),
      coverage: i.categoryId ? "category" : "services",
      categoryId: i.categoryId ?? defaultCategoryId,
      serviceIds: i.serviceIds,
    })) ?? [
      {
        creditType: "UNITS",
        quantity: "",
        coverage: "category",
        categoryId: defaultCategoryId,
        serviceIds: [],
      },
    ],
  };
}

export default function PackageFormModal({
  open,
  onClose,
  pkg,
  categories,
  services,
  branches,
  limited,
}: {
  open: boolean;
  onClose: () => void;
  pkg: PackageView | null;
  categories: CategoryView[];
  services: PackageServiceOption[];
  branches: PackageBranchOption[];
  limited: boolean;
}) {
  const router = useRouter();
  const defaultCategoryId = categories.find((c) => c.isActive)?.id ?? "";
  const [state, setState] = useState<FormState>(() =>
    initial(pkg, branches, limited, defaultCategoryId)
  );
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const partial = pkg?.access === "partial";

  useEffect(() => {
    if (!open) return;
    setState(initial(pkg, branches, limited, defaultCategoryId));
    setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, pkg?.id]);

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) =>
    setState((p) => ({ ...p, [k]: v }));
  const setLine = (i: number, patch: Partial<LineState>) =>
    setState((p) => ({
      ...p,
      items: p.items.map((l, j) => (j === i ? { ...l, ...patch } : l)),
    }));
  const setBranch = (id: string, patch: Partial<{ on: boolean; price: string }>) =>
    setState((p) => ({ ...p, branches: { ...p.branches, [id]: { ...p.branches[id], ...patch } } }));

  const categoryOptions = categories
    .filter((c) => c.isActive || c.id === pkg?.categoryId)
    .map((c) => ({ value: c.id, label: c.name }));

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const n = (v: string) => (v.trim() === "" ? null : Number(v));
    const payload = {
      categoryId: state.categoryId,
      name: state.name,
      description: state.description,
      terms: state.terms,
      agentNotes: state.agentNotes,
      price: Number(state.price || "NaN"),
      validityDays: Number(state.validityDays || "NaN"),
      allBranches: state.allBranches,
      branches: Object.entries(state.branches)
        .filter(([, b]) => (state.allBranches ? b.price.trim() !== "" : b.on))
        .map(([branchId, b]) => ({ branchId, price: n(b.price) })),
      items: state.items.map((l) => ({
        creditType: l.creditType,
        quantity: Number(l.quantity || "NaN"),
        categoryId: l.coverage === "category" ? l.categoryId || null : null,
        serviceIds: l.coverage === "services" ? l.serviceIds : [],
      })),
    };
    if (!Number.isFinite(payload.price)) return setError("أدخل سعر الباقة.");
    if (!Number.isFinite(payload.validityDays)) return setError("أدخل مدة الصلاحية بالأيام.");
    if (payload.items.some((i) => !Number.isFinite(i.quantity)))
      return setError("أدخل كمية كل رصيد في الباقة.");
    startTransition(async () => {
      const res = pkg
        ? await updatePackageAction(pkg.id, payload)
        : await createPackageAction(payload);
      if (res.error) setError(res.error);
      else {
        onClose();
        router.refresh();
      }
    });
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={pkg ? "تعديل الباقة" : "إضافة باقة"}
      description="التعديل يسري على المشتريات الجديدة فقط؛ ما اشتراه المرضى سابقاً لا يتغير."
      width="max-w-3xl"
    >
      <form onSubmit={submit} noValidate className="space-y-5">
        {error && <Alert variant="destructive">{error}</Alert>}
        {partial && (
          <Alert>هذه الباقة مشتركة مع فروع أخرى، لذلك يمكنك تعديل أسعار فروعك فقط.</Alert>
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormField
            label="اسم الباقة *"
            placeholder="مثال: 1500 نبضة"
            value={state.name}
            onValueChange={(v) => set("name", v)}
            disabled={partial}
          />
          <FormField
            type="select"
            label="التصنيف *"
            options={categoryOptions}
            value={state.categoryId}
            onValueChange={(v) => set("categoryId", v)}
            disabled={partial}
          />
          <FormField
            type="number"
            label={`السعر (${CURRENCY_LABEL}) *`}
            min={0}
            step="0.01"
            value={state.price}
            onValueChange={(v) => set("price", v)}
            disabled={partial}
          />
          <div className="space-y-1.5">
            <FormField
              type="number"
              label="الصلاحية (بالأيام) *"
              min={1}
              value={state.validityDays}
              onValueChange={(v) => set("validityDays", v)}
              disabled={partial}
            />
            {!partial && (
              <div className="flex flex-wrap gap-1">
                {VALIDITY_PRESETS.map((p) => (
                  <Button
                    key={p.days}
                    type="button"
                    size="sm"
                    variant={state.validityDays === String(p.days) ? "default" : "outline"}
                    onClick={() => set("validityDays", String(p.days))}
                  >
                    {p.label}
                  </Button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Credit lines */}
        <div className="space-y-3 rounded-xl border border-border p-4">
          <Label className="font-sans text-sm font-medium text-foreground">ماذا تشمل الباقة</Label>
          <p className="font-sans text-xs text-muted-foreground">
            وحدات (مثل النبضات): يُخصم عند كل زيارة العدد المستخدم فعلياً. جلسات: تُحجز جلسة عند
            الحجز وتُخصم عند الإتمام. يمكن جمع أكثر من رصيد في باقة واحدة.
          </p>
          {state.items.map((line, i) => (
            <div key={i} className="space-y-3 rounded-lg border border-border bg-muted/20 p-3">
              <div className="flex flex-wrap items-end gap-3">
                <FormField
                  type="select"
                  label="النوع"
                  options={CREDIT_OPTIONS}
                  value={line.creditType}
                  onValueChange={(v) => setLine(i, { creditType: v as CreditType })}
                  className="w-48"
                  disabled={partial}
                />
                <FormField
                  type="number"
                  label={line.creditType === "SESSIONS" ? "عدد الجلسات" : "عدد الوحدات"}
                  min={1}
                  value={line.quantity}
                  onValueChange={(v) => setLine(i, { quantity: v })}
                  className="w-36"
                  disabled={partial}
                />
                <FormField
                  type="select"
                  label="تُستخدم في"
                  options={COVERAGE_OPTIONS}
                  value={line.coverage}
                  onValueChange={(v) => setLine(i, { coverage: v as LineState["coverage"] })}
                  className="w-44"
                  disabled={partial}
                />
                {line.coverage === "category" && (
                  <FormField
                    type="select"
                    label="التصنيف"
                    options={categoryOptions}
                    value={line.categoryId}
                    onValueChange={(v) => setLine(i, { categoryId: v })}
                    className="w-44"
                    disabled={partial}
                  />
                )}
                {!partial && state.items.length > 1 && (
                  <Button
                    type="button"
                    variant="ghost-destructive"
                    size="icon"
                    aria-label="حذف الرصيد"
                    onClick={() =>
                      setState((p) => ({ ...p, items: p.items.filter((_, j) => j !== i) }))
                    }
                  >
                    <Trash2 />
                  </Button>
                )}
              </div>
              {line.coverage === "services" && (
                <div className="flex flex-wrap gap-x-5 gap-y-2">
                  {services.map((s) => (
                    <label
                      key={s.id}
                      className="flex cursor-pointer items-center gap-2 font-sans text-sm text-foreground"
                    >
                      <Checkbox
                        checked={line.serviceIds.includes(s.id)}
                        disabled={partial}
                        onCheckedChange={(c) =>
                          setLine(i, {
                            serviceIds:
                              c === true
                                ? [...line.serviceIds, s.id]
                                : line.serviceIds.filter((x) => x !== s.id),
                          })
                        }
                      />
                      {s.name}
                    </label>
                  ))}
                </div>
              )}
            </div>
          ))}
          {!partial && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                setState((p) => ({
                  ...p,
                  items: [
                    ...p.items,
                    {
                      creditType: "SESSIONS",
                      quantity: "",
                      coverage: "services",
                      categoryId: defaultCategoryId,
                      serviceIds: [],
                    },
                  ],
                }))
              }
            >
              <Plus />
              إضافة رصيد آخر
            </Button>
          )}
        </div>

        {/* Branches */}
        <div className="space-y-3 rounded-xl border border-border p-4">
          <Label className="font-sans text-sm font-medium text-foreground">الفروع</Label>
          {!limited && !partial && (
            <FormField
              type="switch"
              label="تُباع في كل الفروع"
              checked={state.allBranches}
              onCheckedChange={(c) => set("allBranches", c)}
            />
          )}
          <p className="font-sans text-xs text-muted-foreground">
            الباقة تُستخدم فقط في الفرع الذي اشتُريت منه.
            {state.allBranches
              ? " أدخل سعراً أمام الفرع فقط إن كان مختلفاً."
              : " اختر الفروع، ويمكن تحديد سعر خاص لكل فرع."}
          </p>
          <div className="space-y-2">
            {branches.map((b) => (
              <div key={b.id} className="flex flex-wrap items-center gap-3">
                {state.allBranches ? (
                  <span className="min-w-40 flex-1 font-sans text-sm">{b.name}</span>
                ) : (
                  <label className="flex min-w-40 flex-1 cursor-pointer items-center gap-2 font-sans text-sm">
                    <Checkbox
                      checked={state.branches[b.id]?.on ?? false}
                      onCheckedChange={(c) => setBranch(b.id, { on: c === true })}
                    />
                    {b.name}
                  </label>
                )}
                {(state.allBranches || state.branches[b.id]?.on) && (
                  <FormField
                    type="number"
                    min={0}
                    step="0.01"
                    placeholder={state.allBranches ? "السعر الأساسي" : "سعر الفرع (اختياري)"}
                    value={state.branches[b.id]?.price ?? ""}
                    onValueChange={(v) => setBranch(b.id, { price: v })}
                    className="w-44"
                    controlClassName="h-9"
                  />
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4">
          <FormField
            type="textarea"
            rows={2}
            label="وصف الباقة"
            hint="يظهر للمريض في الموقع وعبر المساعد الذكي."
            value={state.description}
            onValueChange={(v) => set("description", v)}
            disabled={partial}
          />
          <FormField
            type="textarea"
            rows={2}
            label="الشروط"
            placeholder="مثال: تُستخدم خلال مدة الصلاحية فقط، ولا تُمدد أو تُسترد بعد الشراء."
            hint="تُعرض للمريض قبل الشراء."
            value={state.terms}
            onValueChange={(v) => set("terms", v)}
            disabled={partial}
          />
          <FormField
            type="textarea"
            rows={2}
            label="ملاحظات للمساعد الذكي"
            hint="تعليمات داخلية للمساعد فقط ولا تُعرض للمريض."
            value={state.agentNotes}
            onValueChange={(v) => set("agentNotes", v)}
            disabled={partial}
          />
        </div>

        <div className="flex gap-3 pt-1">
          <Button type="submit" loading={isPending} className="flex-1">
            {isPending ? "جارٍ الحفظ..." : pkg ? "حفظ التعديلات" : "إضافة الباقة"}
          </Button>
          <Button type="button" variant="outline" onClick={onClose}>
            إلغاء
          </Button>
        </div>
      </form>
    </Modal>
  );
}
