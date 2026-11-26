"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useFieldArray, useForm, useWatch, type Control } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, Trash2 } from "lucide-react";
import Modal from "@/components/admin/modal";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Label } from "@/components/ui/label";
import { createServiceAction, updateServiceAction } from "@/server/actions/catalog";
import {
  serviceFormSchema,
  serviceFormToInput,
  type ServiceFormValues,
} from "@/lib/validations/catalog";
import {
  PRICING_TYPES,
  PRICING_TYPE_LABEL,
  SERVICE_KINDS,
  SERVICE_KIND_LABEL,
  pricingUsesPrice,
  pricingUsesUnits,
} from "@/lib/catalog";
import { CURRENCY_LABEL } from "@/lib/currency";
import { practitionerName } from "@/lib/doctor-title";
import type { CategoryView, PractitionerOption, ServiceView } from "@/server/services/catalog";

export interface BranchOption {
  id: string;
  name: string;
  isActive: boolean;
}

const KIND_OPTIONS = SERVICE_KINDS.map((k) => ({ value: k, label: SERVICE_KIND_LABEL[k] }));
const PRICING_OPTIONS = PRICING_TYPES.map((p) => ({ value: p, label: PRICING_TYPE_LABEL[p] }));

const str = (n: number | null | undefined) => (n == null ? "" : String(n));

function formFromService(
  service: ServiceView | null,
  branches: BranchOption[],
  practitioners: PractitionerOption[],
  limited: boolean,
  defaultCategoryId: string
): ServiceFormValues {
  return {
    categoryId: service?.categoryId ?? defaultCategoryId,
    name: service?.name ?? "",
    description: service?.description ?? "",
    prepInstructions: service?.prepInstructions ?? "",
    agentNotes: service?.agentNotes ?? "",
    kind: service?.kind ?? "PROCEDURE",
    pricingType: service?.pricingType ?? "FIXED",
    price: str(service?.price),
    unitLabel: service?.unitLabel ?? "",
    durationMin: str(service?.durationMin),
    bookable: service?.bookable ?? true,
    operationChecklist: (service?.operationChecklist ?? []).join("\n"),
    postOpInstructions: service?.postOpInstructions ?? "",
    preCheckServiceId: service?.preCheckServiceId ?? "",
    preCheckFeeDeducted: service?.preCheckFeeDeducted ?? false,
    // A branch-limited member can only create for their own branches.
    allBranches: service?.allBranches ?? !limited,
    partial: service?.access === "partial",
    branches: branches.map((b) => {
      const row = service?.branches.find((r) => r.branchId === b.id);
      return { branchId: b.id, on: !!row, price: str(row?.price) };
    }),
    tiers:
      service?.tiers.map((t) => ({
        minQty: String(t.minQty),
        maxQty: str(t.maxQty),
        price: String(t.price),
      })) ?? [],
    doctors: practitioners.map((p) => {
      const row = service?.doctors.find((r) => r.doctorId === p.id);
      return {
        doctorId: p.id,
        on: !!row,
        price: str(row?.price),
        durationMin: str(row?.durationMin),
      };
    }),
  };
}

export default function ServiceFormModal({
  open,
  onClose,
  service,
  categories,
  branches,
  practitioners,
  limited,
  defaultCategoryId,
  allServices,
}: {
  open: boolean;
  onClose: () => void;
  /** null = create. */
  service: ServiceView | null;
  categories: CategoryView[];
  /** The branches the editor manages. */
  branches: BranchOption[];
  practitioners: PractitionerOption[];
  /** The editor is limited to some branches. */
  limited: boolean;
  defaultCategoryId: string;
  /** Candidates for the pre-check (every service of the clinic). */
  allServices: ServiceView[];
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const form = useForm<ServiceFormValues>({
    resolver: zodResolver(serviceFormSchema),
    defaultValues: formFromService(service, branches, practitioners, limited, defaultCategoryId),
    mode: "onTouched",
  });
  const tiers = useFieldArray({ control: form.control, name: "tiers" });

  // Re-seed whenever the modal opens for another service (or for a new one).
  useEffect(() => {
    if (!open) return;
    form.reset(formFromService(service, branches, practitioners, limited, defaultCategoryId));
    setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, service?.id]);

  const pricingType = useWatch({ control: form.control, name: "pricingType" });
  const kind = useWatch({ control: form.control, name: "kind" });
  const isOperation = kind === "OPERATION";
  const preCheckServiceId = useWatch({ control: form.control, name: "preCheckServiceId" });
  // A pre-check must not itself need one, and can't be this service.
  const preCheckOptions = allServices
    .filter((s) => s.isActive && s.id !== service?.id && !s.preCheckServiceId)
    .map((s) => ({ value: s.id, label: s.name }));
  const usedAsPreCheck = !!service && allServices.some((s) => s.preCheckServiceId === service.id);
  const allBranches = useWatch({ control: form.control, name: "allBranches" });
  const partial = service?.access === "partial";
  const branchError =
    form.formState.errors.branches?.root?.message ??
    (form.formState.errors.branches as { message?: string } | undefined)?.message;
  const tiersError =
    form.formState.errors.tiers?.root?.message ??
    (form.formState.errors.tiers as { message?: string } | undefined)?.message;

  // Inactive categories stay selectable only for the service already in them.
  const categoryOptions = categories
    .filter((c) => c.isActive || c.id === service?.categoryId)
    .map((c) => ({ value: c.id, label: c.name }));

  const handleSubmit = form.handleSubmit((values) => {
    setError(null);
    const payload = serviceFormToInput(values);
    startTransition(async () => {
      const res = service
        ? await updateServiceAction(service.id, payload)
        : await createServiceAction(payload);
      if (res.error) setError(res.error);
      else {
        onClose();
        router.refresh();
      }
    });
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={service ? "تعديل الخدمة" : "إضافة خدمة"}
      width="max-w-3xl"
    >
      <form onSubmit={handleSubmit} noValidate className="space-y-5">
        {error && <Alert variant="destructive">{error}</Alert>}
        {partial && (
          <Alert>
            هذه الخدمة مشتركة مع فروع أخرى، لذلك يمكنك تعديل ما يخص فروعك فقط: السعر في فروعك ومن
            يقدّمها من فريقك.
          </Alert>
        )}

        {/* Basics */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormField
            control={form.control}
            name="name"
            label="اسم الخدمة *"
            placeholder="مثال: جلسة ليزر – الوجه"
            className="sm:col-span-2"
            disabled={partial}
          />
          <FormField
            control={form.control}
            name="categoryId"
            type="select"
            label="التصنيف *"
            placeholder="اختر التصنيف"
            options={categoryOptions}
            disabled={partial}
          />
          <FormField
            control={form.control}
            name="kind"
            type="select"
            label="نوع الخدمة"
            options={KIND_OPTIONS}
            hint="يساعد المساعد الذكي على التصرف الصحيح (مثل اقتراح كشف أولاً)."
            disabled={partial}
          />
        </div>

        {/* Pricing */}
        <div className="space-y-4 rounded-xl border border-border p-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <FormField
              control={form.control}
              name="pricingType"
              type="select"
              label="طريقة التسعير"
              options={PRICING_OPTIONS}
              disabled={partial}
            />
            {pricingUsesPrice(pricingType) && (
              <FormField
                control={form.control}
                name="price"
                type="number"
                inputMode="decimal"
                min={0}
                step="0.01"
                label={pricingType === "PER_UNIT" ? "سعر الوحدة" : "السعر"}
                placeholder="0"
                hint={`بال${CURRENCY_LABEL}. اتركه فارغاً إن كان السعر يختلف حسب الفرع أو مقدم الخدمة.`}
                disabled={partial}
              />
            )}
            {pricingUsesUnits(pricingType) && (
              <FormField
                control={form.control}
                name="unitLabel"
                label="اسم الوحدة *"
                placeholder="نبضة / وحدة / سن / مل"
                disabled={partial}
              />
            )}
            <FormField
              control={form.control}
              name="durationMin"
              type="number"
              inputMode="numeric"
              min={1}
              label="المدة (بالدقائق)"
              placeholder="30"
              hint="تحدد الوقت الذي تحجزه الخدمة في الجدول. فارغة = مدة الموعد الافتراضية."
              disabled={partial}
            />
          </div>

          {pricingType === "TIERED" && (
            <div className="space-y-2">
              <Label className="font-sans text-sm font-medium text-foreground">شرائح السعر</Label>
              <p className="font-sans text-xs text-muted-foreground">
                السعر الإجمالي لكل شريحة كمية. اترك «إلى» فارغة في آخر شريحة لتعني «فأكثر».
              </p>
              {tiers.fields.map((f, i) => (
                <div key={f.id} className="flex flex-wrap items-start gap-2">
                  <FormField
                    control={form.control}
                    name={`tiers.${i}.minQty`}
                    type="number"
                    min={1}
                    placeholder="من"
                    className="w-24"
                    disabled={partial}
                  />
                  <FormField
                    control={form.control}
                    name={`tiers.${i}.maxQty`}
                    type="number"
                    min={1}
                    placeholder="إلى"
                    className="w-24"
                    disabled={partial}
                  />
                  <FormField
                    control={form.control}
                    name={`tiers.${i}.price`}
                    type="number"
                    min={0}
                    step="0.01"
                    placeholder="السعر"
                    className="w-32"
                    disabled={partial}
                  />
                  {!partial && (
                    <Button
                      type="button"
                      variant="ghost-destructive"
                      size="icon"
                      aria-label="حذف الشريحة"
                      onClick={() => tiers.remove(i)}
                    >
                      <Trash2 />
                    </Button>
                  )}
                </div>
              ))}
              {tiersError && <p className="font-sans text-xs text-red-600">{tiersError}</p>}
              {!partial && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => tiers.append({ minQty: "", maxQty: "", price: "" })}
                >
                  <Plus />
                  إضافة شريحة
                </Button>
              )}
            </div>
          )}

          {isOperation ? (
            <p className="font-sans text-xs text-muted-foreground">
              العمليات لا يحجزها المريض بنفسه: عند سؤاله يفتح المساعد الذكي «طلب عملية» ويتواصل معه
              الفريق لتجهيزها وتحديد موعدها من صفحة العمليات.
            </p>
          ) : (
            <FormField
              control={form.control}
              name="bookable"
              type="switch"
              label="يمكن حجزها مباشرة"
              hint="أوقفها لخدمة تُعرض وتُسعَّر فقط ولا تُحجز بموعد (تُضاف أثناء الزيارة)."
              disabled={partial}
            />
          )}
        </div>

        {/* Branches */}
        <div className="space-y-3 rounded-xl border border-border p-4">
          <Label className="font-sans text-sm font-medium text-foreground">الفروع</Label>
          {!limited && !partial && (
            <FormField
              control={form.control}
              name="allBranches"
              type="switch"
              label="متاحة في كل الفروع"
            />
          )}
          <p className="font-sans text-xs text-muted-foreground">
            {allBranches
              ? "أدخل سعراً أمام الفرع فقط إن كان سعره مختلفاً عن السعر الأساسي."
              : "اختر الفروع التي تُقدَّم فيها الخدمة، ويمكن تحديد سعر خاص لكل فرع."}
          </p>
          {branches.length === 0 ? (
            <p className="font-sans text-sm text-muted-foreground">لا توجد فروع.</p>
          ) : (
            <div className="space-y-2">
              {branches.map((b, i) => (
                <BranchRow
                  key={b.id}
                  control={form.control}
                  index={i}
                  branch={b}
                  allBranches={allBranches}
                  showPrice={pricingUsesPrice(pricingType)}
                />
              ))}
            </div>
          )}
          {branchError && <p className="font-sans text-xs text-red-600">{branchError}</p>}
        </div>

        {/* Practitioners */}
        <div className="space-y-3 rounded-xl border border-border p-4">
          <Label className="font-sans text-sm font-medium text-foreground">من يقدّم الخدمة</Label>
          <p className="font-sans text-xs text-muted-foreground">
            اختر مقدمي الخدمة من الفريق الطبي. السعر والمدة اختياريان، ويُستخدمان بدلاً من قيم
            الخدمة عند الحجز مع هذا الشخص.
          </p>
          {practitioners.length === 0 ? (
            <p className="font-sans text-sm text-muted-foreground">لا يوجد أطباء بعد.</p>
          ) : (
            <div className="space-y-2">
              {practitioners.map((p, i) => (
                <PractitionerRow
                  key={p.id}
                  control={form.control}
                  index={i}
                  practitioner={p}
                  showPrice={pricingUsesPrice(pricingType)}
                />
              ))}
            </div>
          )}
        </div>

        {/* Pre-check */}
        {!isOperation && !usedAsPreCheck && (
          <div className="space-y-3 rounded-xl border border-border p-4">
            <Label className="font-sans text-sm font-medium text-foreground">
              يحتاج فحصاً مسبقاً
            </Label>
            <p className="font-sans text-xs text-muted-foreground">
              للخدمات التي يقرر الطبيب بعد الكشف هل تُعمل أم لا. عند الحجز يُضاف الفحص للموعد
              تلقائياً، وعند إتمام الزيارة يحدد الطبيب: وافق (يُحاسب على الاثنين) أو رفض (يُحاسب على
              الفحص فقط). بعد موافقة الطبيب مرة لا يُطلب الفحص لهذه الخدمة مرة أخرى.
            </p>
            <FormField
              control={form.control}
              name="preCheckServiceId"
              type="select"
              label="خدمة الفحص المسبق"
              placeholder="لا يحتاج فحصاً مسبقاً"
              options={[{ value: "_none", label: "لا يحتاج فحصاً مسبقاً" }, ...preCheckOptions]}
              disabled={partial}
            />
            {preCheckServiceId && preCheckServiceId !== "_none" && (
              <FormField
                control={form.control}
                name="preCheckFeeDeducted"
                type="switch"
                label="الفحص مجاني إذا تمت الخدمة"
                hint="عند موافقة الطبيب لا يُحاسب المريض على الفحص."
                disabled={partial}
              />
            )}
          </div>
        )}

        {/* Texts */}
        <div className="grid grid-cols-1 gap-4">
          <FormField
            control={form.control}
            name="description"
            type="textarea"
            rows={2}
            label="وصف الخدمة"
            hint="يظهر للمريض في الموقع وعبر المساعد الذكي."
            disabled={partial}
          />
          <FormField
            control={form.control}
            name="prepInstructions"
            type="textarea"
            rows={isOperation ? 4 : 2}
            label={isOperation ? "تعليمات ما قبل العملية" : "تعليمات قبل / بعد الزيارة"}
            hint={
              isOperation
                ? "تُنسخ في كل حالة جديدة من هذه العملية ويمكن إرسالها للمريض (مثال: الصيام 8 ساعات، إيقاف أدوية السيولة)."
                : "تُعرض للمريض عند الحجز."
            }
            disabled={partial}
          />
          {isOperation && (
            <>
              <FormField
                control={form.control}
                name="operationChecklist"
                type="textarea"
                rows={4}
                label="قائمة التجهيزات قبل العملية"
                hint="بند في كل سطر (مثال: صورة دم كاملة، رسم قلب، توقيع الإقرار). تُنسخ في كل حالة جديدة ويتابعها الفريق."
                disabled={partial}
              />
              <FormField
                control={form.control}
                name="postOpInstructions"
                type="textarea"
                rows={4}
                label="تعليمات ما بعد العملية"
                hint="تُرسل للمريض بعد العملية (العناية بالجرح، الأدوية، متى يعود للمتابعة)."
                disabled={partial}
              />
            </>
          )}
          <FormField
            control={form.control}
            name="agentNotes"
            type="textarea"
            rows={2}
            label="ملاحظات للمساعد الذكي"
            hint="تعليمات داخلية للمساعد فقط ولا تُعرض للمريض (مثال: اقترح كشفاً أولاً لمن يحجز لأول مرة)."
            disabled={partial}
          />
        </div>

        <div className="flex gap-3 pt-1">
          <Button type="submit" loading={isPending} className="flex-1">
            {isPending ? "جارٍ الحفظ..." : service ? "حفظ التعديلات" : "إضافة الخدمة"}
          </Button>
          <Button type="button" variant="outline" onClick={onClose}>
            إلغاء
          </Button>
        </div>
      </form>
    </Modal>
  );
}

/** One branch: a tick (specific branches only) and its optional price. */
function BranchRow({
  control,
  index,
  branch,
  allBranches,
  showPrice,
}: {
  control: Control<ServiceFormValues>;
  index: number;
  branch: BranchOption;
  allBranches: boolean;
  showPrice: boolean;
}) {
  const on = useWatch({ control, name: `branches.${index}.on` });
  const label = branch.isActive ? branch.name : `${branch.name} (معطّل)`;
  return (
    <div className="flex flex-wrap items-center gap-3">
      {allBranches ? (
        <span className="min-w-40 flex-1 font-sans text-sm text-foreground">{label}</span>
      ) : (
        <FormField
          control={control}
          name={`branches.${index}.on`}
          type="checkbox"
          label={label}
          className="min-w-40 flex-1"
        />
      )}
      {showPrice && (allBranches || on) && (
        <FormField
          control={control}
          name={`branches.${index}.price`}
          type="number"
          min={0}
          step="0.01"
          placeholder={allBranches ? "السعر الأساسي" : "سعر الفرع (اختياري)"}
          className="w-44"
          controlClassName="h-9"
        />
      )}
    </div>
  );
}

function PractitionerRow({
  control,
  index,
  practitioner,
  showPrice,
}: {
  control: Control<ServiceFormValues>;
  index: number;
  practitioner: PractitionerOption;
  showPrice: boolean;
}) {
  const on = useWatch({ control, name: `doctors.${index}.on` });
  const name = practitionerName(practitioner.fullName, practitioner.title);
  return (
    <div className="flex flex-wrap items-center gap-3">
      <FormField
        control={control}
        name={`doctors.${index}.on`}
        type="checkbox"
        label={practitioner.isActive ? name : `${name} (غير نشط)`}
        className="min-w-40 flex-1"
      />
      {on && (
        <>
          {showPrice && (
            <FormField
              control={control}
              name={`doctors.${index}.price`}
              type="number"
              min={0}
              step="0.01"
              placeholder="سعر خاص (اختياري)"
              className="w-40"
              controlClassName="h-9"
            />
          )}
          <FormField
            control={control}
            name={`doctors.${index}.durationMin`}
            type="number"
            min={1}
            placeholder="مدة خاصة (د)"
            className="w-32"
            controlClassName="h-9"
          />
        </>
      )}
    </div>
  );
}
