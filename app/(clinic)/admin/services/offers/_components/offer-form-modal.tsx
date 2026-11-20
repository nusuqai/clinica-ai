"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { OfferType } from "@prisma/client";
import Modal from "@/components/admin/modal";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { FormField } from "@/components/ui/form-field";
import { Label } from "@/components/ui/label";
import { createOfferAction, updateOfferAction } from "@/server/actions/catalog";
import { OFFER_TYPES, OFFER_TYPE_LABEL, suggestOfferLabel } from "@/lib/offers";
import { CURRENCY_LABEL } from "@/lib/currency";
import type { CategoryView } from "@/server/services/catalog";
import type { OfferView } from "@/server/services/offers";

export interface TargetOption {
  id: string;
  name: string;
  categoryId: string;
  isActive: boolean;
}

export interface OfferBranchOption {
  id: string;
  name: string;
  isActive: boolean;
  /** Inside the member's scope (always true for all-branch members). */
  mine: boolean;
}

interface FormState {
  name: string;
  label: string;
  /** The label was typed by hand — stop auto-suggesting. */
  labelTouched: boolean;
  type: OfferType;
  value: string;
  buyQty: string;
  getQty: string;
  rewardValidityDays: string;
  startsAt: string;
  endsAt: string;
  isActive: boolean;
  allBranches: boolean;
  branchIds: string[];
  serviceIds: string[];
  packageIds: string[];
  categoryIds: string[];
}

const TYPE_OPTIONS = OFFER_TYPES.map((t) => ({ value: t, label: OFFER_TYPE_LABEL[t] }));
const str = (n: number | null | undefined) => (n == null ? "" : String(n));
const numOrNull = (v: string) => (v.trim() === "" ? null : Number(v));

function initialState(offer: OfferView | null, limited: boolean): FormState {
  return {
    name: offer?.name ?? "",
    label: offer?.label ?? "",
    labelTouched: !!offer,
    type: offer?.type ?? "PERCENT_OFF",
    value: str(offer?.value),
    buyQty: str(offer?.buyQty ?? 1),
    getQty: str(offer?.getQty ?? 1),
    rewardValidityDays: str(offer?.rewardValidityDays ?? 90),
    startsAt: offer?.startsAt ?? "",
    endsAt: offer?.endsAt ?? "",
    isActive: offer?.isActive ?? true,
    allBranches: offer?.allBranches ?? !limited,
    branchIds: offer?.branchIds ?? [],
    serviceIds: offer?.serviceIds ?? [],
    packageIds: offer?.packageIds ?? [],
    categoryIds: offer?.categoryIds ?? [],
  };
}

function toggle(list: string[], id: string, on: boolean): string[] {
  return on ? [...new Set([...list, id])] : list.filter((x) => x !== id);
}

export default function OfferFormModal({
  open,
  onClose,
  offer,
  categories,
  services,
  packages,
  branches,
  limited,
  today,
}: {
  open: boolean;
  onClose: () => void;
  offer: OfferView | null;
  categories: CategoryView[];
  services: TargetOption[];
  packages: TargetOption[];
  branches: OfferBranchOption[];
  limited: boolean;
  today: string;
}) {
  const router = useRouter();
  const [state, setState] = useState<FormState>(() => initialState(offer, limited));
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (!open) return;
    setState(initialState(offer, limited));
    setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, offer?.id]);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setState((prev) => {
      const next = { ...prev, [key]: value };
      if (!next.labelTouched) {
        next.label = suggestOfferLabel({
          type: next.type,
          value: numOrNull(next.value),
          buyQty: numOrNull(next.buyQty),
          getQty: numOrNull(next.getQty),
        });
      }
      return next;
    });
  }

  const forServices = state.type !== "BONUS_UNITS";
  const forPackages = state.type !== "BUY_X_GET_Y";
  const allowCategories = state.type !== "FIXED_PRICE";
  const ownBranches = branches.filter((b) => b.mine);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const payload = {
      name: state.name,
      label: state.label,
      type: state.type,
      value: numOrNull(state.value),
      buyQty: numOrNull(state.buyQty),
      getQty: numOrNull(state.getQty),
      rewardValidityDays: numOrNull(state.rewardValidityDays),
      startsAt: state.startsAt || null,
      endsAt: state.endsAt || null,
      isActive: state.isActive,
      allBranches: state.allBranches,
      branchIds: state.branchIds,
      // Drop targets the chosen type can't use.
      targets: {
        serviceIds: forServices ? state.serviceIds : [],
        packageIds: forPackages ? state.packageIds : [],
        categoryIds: allowCategories ? state.categoryIds : [],
      },
    };
    startTransition(async () => {
      const res = offer
        ? await updateOfferAction(offer.id, payload)
        : await createOfferAction(payload);
      if (res.error) setError(res.error);
      else {
        onClose();
        router.refresh();
      }
    });
  }

  const valueField = (() => {
    switch (state.type) {
      case "PERCENT_OFF":
        return { label: "نسبة الخصم (%)", step: "1", placeholder: "20" };
      case "AMOUNT_OFF":
        return { label: `قيمة الخصم (${CURRENCY_LABEL})`, step: "0.01", placeholder: "300" };
      case "FIXED_PRICE":
        return { label: `السعر الخاص (${CURRENCY_LABEL})`, step: "0.01", placeholder: "1100" };
      case "BONUS_UNITS":
        return { label: "عدد الوحدات الإضافية", step: "1", placeholder: "500" };
      default:
        return null;
    }
  })();

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={offer ? "تعديل العرض" : "إضافة عرض"}
      description="لا يمكن تطبيق عرضين على نفس الخدمة أو الباقة في نفس الفترة ونفس الفرع."
      width="max-w-3xl"
    >
      <form onSubmit={submit} noValidate className="space-y-5">
        {error && <Alert variant="destructive">{error}</Alert>}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormField
            label="اسم العرض (داخلي) *"
            placeholder="مثال: الجمعة البيضاء 2026"
            value={state.name}
            onValueChange={(v) => set("name", v)}
          />
          <FormField
            type="select"
            label="نوع العرض"
            options={TYPE_OPTIONS}
            value={state.type}
            onValueChange={(v) => set("type", v as OfferType)}
            disabled={!!offer && offer.usageCount > 0}
            hint={offer && offer.usageCount > 0 ? "لا يمكن تغيير نوع عرض مستخدم." : undefined}
          />
          {valueField && (
            <FormField
              type="number"
              label={valueField.label}
              min={0}
              step={valueField.step}
              placeholder={valueField.placeholder}
              value={state.value}
              onValueChange={(v) => set("value", v)}
            />
          )}
          {state.type === "BUY_X_GET_Y" && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <FormField
                  type="number"
                  label="جلسات مدفوعة"
                  min={1}
                  value={state.buyQty}
                  onValueChange={(v) => set("buyQty", v)}
                />
                <FormField
                  type="number"
                  label="جلسات هدية"
                  min={1}
                  value={state.getQty}
                  onValueChange={(v) => set("getQty", v)}
                />
              </div>
              <FormField
                type="number"
                label="صلاحية جلسات الهدية (بالأيام)"
                min={1}
                value={state.rewardValidityDays}
                onValueChange={(v) => set("rewardValidityDays", v)}
                hint="تُضاف الهدية لرصيد المريض بعد إتمام الجلسة المدفوعة."
              />
            </>
          )}
          <FormField
            label="نص العرض للمريض *"
            value={state.label}
            onValueChange={(v) => setState((p) => ({ ...p, label: v, labelTouched: true }))}
            hint="يظهر للمريض في الموقع وعبر المساعد الذكي بجوار السعر."
            className="sm:col-span-2"
          />
        </div>

        {/* Dates */}
        <div className="space-y-3 rounded-xl border border-border p-4">
          <Label className="font-sans text-sm font-medium text-foreground">مدة العرض</Label>
          <p className="font-sans text-xs text-muted-foreground">
            اترك التاريخين فارغين ليكون العرض دائماً. يبدأ العرض وينتهي تلقائياً حسب التواريخ.
            للخدمات يُحسب العرض حسب يوم الزيارة، وللباقات حسب يوم الشراء.
          </p>
          <div className="flex flex-wrap items-end gap-3">
            <FormField
              type="date"
              label="من"
              value={state.startsAt}
              onValueChange={(v) => set("startsAt", v)}
              className="w-48"
            />
            <FormField
              type="date"
              label="إلى"
              value={state.endsAt}
              min={state.startsAt || undefined}
              onValueChange={(v) => set("endsAt", v)}
              className="w-48"
            />
            {(state.startsAt || state.endsAt) && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setState((p) => ({ ...p, startsAt: "", endsAt: "" }))}
              >
                بدون تاريخ (دائم)
              </Button>
            )}
          </div>
          {state.endsAt && state.endsAt < today && (
            <p className="font-sans text-xs text-amber-600">
              تاريخ النهاية مضى — سيظهر العرض كمنتهٍ.
            </p>
          )}
          <FormField
            type="switch"
            label="العرض مُفعّل"
            checked={state.isActive}
            onCheckedChange={(c) => set("isActive", c)}
            hint="أوقفه في أي وقت وأعد تشغيله لاحقاً دون حذفه."
          />
        </div>

        {/* Branches */}
        <div className="space-y-3 rounded-xl border border-border p-4">
          <Label className="font-sans text-sm font-medium text-foreground">الفروع</Label>
          {!limited && (
            <FormField
              type="switch"
              label="في كل الفروع"
              checked={state.allBranches}
              onCheckedChange={(c) => set("allBranches", c)}
            />
          )}
          {!state.allBranches && (
            <div className="flex flex-wrap gap-x-5 gap-y-2">
              {ownBranches.map((b) => (
                <FormField
                  key={b.id}
                  type="checkbox"
                  label={b.isActive ? b.name : `${b.name} (معطّل)`}
                  checked={state.branchIds.includes(b.id)}
                  onCheckedChange={(c) => set("branchIds", toggle(state.branchIds, b.id, c))}
                />
              ))}
            </div>
          )}
        </div>

        {/* Targets */}
        <div className="space-y-4 rounded-xl border border-border p-4">
          <div>
            <Label className="font-sans text-sm font-medium text-foreground">يُطبَّق على</Label>
            <p className="mt-1 font-sans text-xs text-muted-foreground">
              {state.type === "BUY_X_GET_Y"
                ? "الخدمات فقط."
                : state.type === "BONUS_UNITS"
                  ? "الباقات فقط."
                  : state.type === "FIXED_PRICE"
                    ? "خدمات أو باقات محددة."
                    : "اختر تصنيفاً كاملاً (كل خدماته وباقاته) أو خدمات وباقات بعينها."}
            </p>
          </div>

          {allowCategories && categories.length > 0 && (
            <TargetGroup title="تصنيفات كاملة">
              {categories.map((c) => (
                <TargetCheck
                  key={c.id}
                  label={c.name}
                  checked={state.categoryIds.includes(c.id)}
                  onChange={(on) => set("categoryIds", toggle(state.categoryIds, c.id, on))}
                />
              ))}
            </TargetGroup>
          )}

          {forServices &&
            categories.map((c) => {
              const items = services.filter((s) => s.categoryId === c.id);
              if (items.length === 0) return null;
              const wholeCategory = allowCategories && state.categoryIds.includes(c.id);
              return (
                <TargetGroup key={c.id} title={`خدمات: ${c.name}`}>
                  {items.map((s) => (
                    <TargetCheck
                      key={s.id}
                      label={s.isActive ? s.name : `${s.name} (معطّلة)`}
                      checked={wholeCategory || state.serviceIds.includes(s.id)}
                      disabled={wholeCategory}
                      onChange={(on) => set("serviceIds", toggle(state.serviceIds, s.id, on))}
                    />
                  ))}
                </TargetGroup>
              );
            })}

          {forPackages && packages.length > 0 && (
            <TargetGroup title="الباقات">
              {packages.map((p) => {
                const wholeCategory = allowCategories && state.categoryIds.includes(p.categoryId);
                return (
                  <TargetCheck
                    key={p.id}
                    label={p.isActive ? p.name : `${p.name} (معطّلة)`}
                    checked={wholeCategory || state.packageIds.includes(p.id)}
                    disabled={wholeCategory}
                    onChange={(on) => set("packageIds", toggle(state.packageIds, p.id, on))}
                  />
                );
              })}
            </TargetGroup>
          )}
        </div>

        <div className="flex gap-3 pt-1">
          <Button type="submit" loading={isPending} className="flex-1">
            {isPending ? "جارٍ الحفظ..." : offer ? "حفظ التعديلات" : "إضافة العرض"}
          </Button>
          <Button type="button" variant="outline" onClick={onClose}>
            إلغاء
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function TargetGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-2 font-sans text-xs font-semibold text-muted-foreground">{title}</p>
      <div className="flex flex-wrap gap-x-5 gap-y-2">{children}</div>
    </div>
  );
}

function TargetCheck({
  label,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (on: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2 font-sans text-sm text-foreground">
      <Checkbox
        checked={checked}
        disabled={disabled}
        onCheckedChange={(c) => onChange(c === true)}
      />
      {label}
    </label>
  );
}
