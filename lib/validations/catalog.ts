import { z } from "zod";
import { CreditType, OfferType, PricingType, ServiceKind } from "@prisma/client";
import { pricingUsesPrice, pricingUsesUnits } from "@/lib/catalog";
import { parseChecklistText } from "@/lib/operations";

// Schemas for the service catalog (docs/services-and-packages.md).
//
// Two layers: the *form* schemas hold what the inputs hold (numbers as strings)
// for react-hook-form; the *input* schemas are what the server actions accept
// and re-validate — never trust the client's own validation.

// ─── Shared pieces ────────────────────────────────────────────────────────────

const uuid = z.uuid();

/** A money amount: >= 0, at most 2 decimals. */
const money = z
  .number()
  .min(0, "السعر لا يمكن أن يكون سالباً.")
  .max(99_999_999, "السعر كبير جداً.")
  .refine((n) => Number.isFinite(n), "سعر غير صالح.")
  .transform((n) => Math.round(n * 100) / 100);

const duration = z
  .number()
  .int("المدة بالدقائق يجب أن تكون رقماً صحيحاً.")
  .min(1, "المدة يجب أن تكون دقيقة واحدة على الأقل.")
  .max(24 * 60, "المدة طويلة جداً.");

const optionalText = z
  .string()
  .trim()
  .max(4000)
  .transform((v) => v || null)
  .nullable();

// ─── Category ─────────────────────────────────────────────────────────────────

export const categorySchema = z.object({
  name: z.string().trim().min(1, "أدخل اسم التصنيف.").max(80, "الاسم طويل جداً."),
});
export type CategoryValues = z.infer<typeof categorySchema>;

// ─── Service: server input ────────────────────────────────────────────────────

export const serviceInputSchema = z
  .object({
    categoryId: uuid,
    name: z.string().trim().min(1, "أدخل اسم الخدمة.").max(120, "الاسم طويل جداً."),
    description: optionalText,
    prepInstructions: optionalText,
    agentNotes: optionalText,
    kind: z.enum(ServiceKind),
    pricingType: z.enum(PricingType),
    price: money.nullable(),
    unitLabel: z
      .string()
      .trim()
      .max(30)
      .transform((v) => v || null)
      .nullable(),
    durationMin: duration.nullable(),
    bookable: z.boolean(),
    allBranches: z.boolean(),
    /** OPERATION only: pre-op checklist template + after-care text. */
    operationChecklist: z.array(z.string().trim().min(1).max(200)).max(50).default([]),
    postOpInstructions: optionalText.default(null),
    /** Pre-check: a service that must be done first (e.g. a كشف) — the
     *  practitioner then approves or declines this one at the visit. */
    preCheckServiceId: uuid.nullable().default(null),
    /** Approved → the pre-check's fee is not charged (deducted). */
    preCheckFeeDeducted: z.boolean().default(false),
    branches: z.array(z.object({ branchId: uuid, price: money.nullable() })).max(200),
    tiers: z
      .array(
        z.object({
          minQty: z.number().int().min(1, "الكمية تبدأ من 1."),
          maxQty: z.number().int().min(1).nullable(),
          price: money,
        })
      )
      .max(30),
    doctors: z
      .array(
        z.object({ doctorId: uuid, price: money.nullable(), durationMin: duration.nullable() })
      )
      .max(500),
  })
  .superRefine((v, ctx) => {
    if (pricingUsesUnits(v.pricingType) && !v.unitLabel) {
      ctx.addIssue({
        code: "custom",
        path: ["unitLabel"],
        message: "أدخل اسم الوحدة (مثال: نبضة).",
      });
    }
    if (v.pricingType === "TIERED") {
      if (v.tiers.length === 0) {
        ctx.addIssue({
          code: "custom",
          path: ["tiers"],
          message: "أضف شريحة سعر واحدة على الأقل.",
        });
      }
      const sorted = [...v.tiers].sort((a, b) => a.minQty - b.minQty);
      sorted.forEach((t, i) => {
        if (t.maxQty != null && t.maxQty < t.minQty) {
          ctx.addIssue({
            code: "custom",
            path: ["tiers"],
            message: "نهاية الشريحة يجب ألا تقل عن بدايتها.",
          });
        }
        const next = sorted[i + 1];
        if (next && (t.maxQty == null || t.maxQty >= next.minQty)) {
          ctx.addIssue({ code: "custom", path: ["tiers"], message: "الشرائح متداخلة." });
        }
      });
    }
    // "At least one branch" is enforced in the service layer: it doesn't apply to
    // a member who only edits their own branches' part of a shared service.
    const dupBranch = new Set(v.branches.map((b) => b.branchId)).size !== v.branches.length;
    const dupDoctor = new Set(v.doctors.map((d) => d.doctorId)).size !== v.doctors.length;
    if (dupBranch) ctx.addIssue({ code: "custom", path: ["branches"], message: "فرع مكرر." });
    if (dupDoctor) ctx.addIssue({ code: "custom", path: ["doctors"], message: "مقدم خدمة مكرر." });
  })
  .transform((v) => ({
    ...v,
    // Drop what the pricing type doesn't use, so stale values never linger.
    price: pricingUsesPrice(v.pricingType) ? v.price : null,
    unitLabel: pricingUsesUnits(v.pricingType) ? v.unitLabel : null,
    tiers: v.pricingType === "TIERED" ? [...v.tiers].sort((a, b) => a.minQty - b.minQty) : [],
    // An operation is never booked by a patient — the team arranges it.
    bookable: v.kind === "OPERATION" ? false : v.bookable,
    operationChecklist: v.kind === "OPERATION" ? v.operationChecklist : [],
    postOpInstructions: v.kind === "OPERATION" ? v.postOpInstructions : null,
    preCheckFeeDeducted: v.preCheckServiceId ? v.preCheckFeeDeducted : false,
  }));
export type ServiceInput = z.output<typeof serviceInputSchema>;

/** What a practitioner provides — the doctor-side editor of DoctorService. */
export const doctorServicesInputSchema = z
  .array(z.object({ serviceId: uuid, price: money.nullable(), durationMin: duration.nullable() }))
  .max(500)
  .refine((v) => new Set(v.map((s) => s.serviceId)).size === v.length, "خدمة مكررة.");
export type DoctorServicesInput = z.output<typeof doctorServicesInputSchema>;

// ─── Service: form (strings) ──────────────────────────────────────────────────

/** "" or a non-negative number with up to 2 decimals. */
const moneyText = z
  .string()
  .trim()
  .refine((v) => v === "" || /^\d+(\.\d{1,2})?$/.test(v), "أدخل سعراً صحيحاً.");
/** "" or a positive whole number. */
const intText = z
  .string()
  .trim()
  .refine((v) => v === "" || /^[1-9]\d*$/.test(v), "أدخل رقماً صحيحاً.");

export const serviceFormSchema = z
  .object({
    categoryId: z.string().min(1, "اختر التصنيف."),
    name: z.string().trim().min(1, "أدخل اسم الخدمة.").max(120, "الاسم طويل جداً."),
    description: z.string(),
    prepInstructions: z.string(),
    agentNotes: z.string(),
    kind: z.enum(ServiceKind),
    pricingType: z.enum(PricingType),
    price: moneyText,
    unitLabel: z.string().trim().max(30),
    durationMin: intText,
    bookable: z.boolean(),
    allBranches: z.boolean(),
    /** OPERATION only: one checklist line per row of text. */
    operationChecklist: z.string(),
    postOpInstructions: z.string(),
    /** "" = no pre-check needed. */
    preCheckServiceId: z.string(),
    preCheckFeeDeducted: z.boolean(),
    /** The editor only manages their own branches' part of a shared service. */
    partial: z.boolean(),
    /** Every branch the editor can see; `on` only matters when not allBranches. */
    branches: z.array(z.object({ branchId: z.string(), on: z.boolean(), price: moneyText })),
    tiers: z.array(z.object({ minQty: intText, maxQty: intText, price: moneyText })),
    doctors: z.array(
      z.object({ doctorId: z.string(), on: z.boolean(), price: moneyText, durationMin: intText })
    ),
  })
  .superRefine((v, ctx) => {
    if (pricingUsesUnits(v.pricingType) && !v.unitLabel) {
      ctx.addIssue({
        code: "custom",
        path: ["unitLabel"],
        message: "أدخل اسم الوحدة (مثال: نبضة).",
      });
    }
    if (v.pricingType === "TIERED") {
      if (v.tiers.length === 0) {
        ctx.addIssue({
          code: "custom",
          path: ["tiers"],
          message: "أضف شريحة سعر واحدة على الأقل.",
        });
      }
      v.tiers.forEach((t, i) => {
        if (!t.minQty)
          ctx.addIssue({ code: "custom", path: ["tiers", i, "minQty"], message: "مطلوب." });
        if (!t.price)
          ctx.addIssue({ code: "custom", path: ["tiers", i, "price"], message: "مطلوب." });
      });
    }
    if (!v.partial && !v.allBranches && !v.branches.some((b) => b.on)) {
      ctx.addIssue({ code: "custom", path: ["branches"], message: "اختر فرعاً واحداً على الأقل." });
    }
  });
export type ServiceFormValues = z.infer<typeof serviceFormSchema>;

const num = (v: string): number | null => (v.trim() === "" ? null : Number(v));

/** Form values → the payload the server action validates. */
export function serviceFormToInput(v: ServiceFormValues): z.input<typeof serviceInputSchema> {
  return {
    categoryId: v.categoryId,
    name: v.name,
    description: v.description,
    prepInstructions: v.prepInstructions,
    agentNotes: v.agentNotes,
    kind: v.kind,
    pricingType: v.pricingType,
    price: num(v.price),
    unitLabel: v.unitLabel,
    durationMin: num(v.durationMin),
    bookable: v.bookable,
    allBranches: v.allBranches,
    operationChecklist: parseChecklistText(v.operationChecklist),
    postOpInstructions: v.postOpInstructions,
    preCheckServiceId:
      v.preCheckServiceId && v.preCheckServiceId !== "_none" ? v.preCheckServiceId : null,
    preCheckFeeDeducted: v.preCheckFeeDeducted,
    // All-branches: only rows that override the price. Specific: the ticked ones.
    branches: v.branches
      .filter((b) => (v.allBranches ? b.price.trim() !== "" : b.on))
      .map((b) => ({ branchId: b.branchId, price: num(b.price) })),
    tiers: v.tiers.map((t) => ({
      minQty: Number(t.minQty),
      maxQty: num(t.maxQty),
      price: Number(t.price),
    })),
    doctors: v.doctors
      .filter((d) => d.on)
      .map((d) => ({ doctorId: d.doctorId, price: num(d.price), durationMin: num(d.durationMin) })),
  };
}

// ─── Offers ───────────────────────────────────────────────────────────────────

const dayKeyText = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "تاريخ غير صالح.")
  .nullable();

export const offerInputSchema = z
  .object({
    name: z.string().trim().min(1, "أدخل اسماً داخلياً للعرض.").max(120, "الاسم طويل جداً."),
    label: z.string().trim().min(1, "أدخل نص العرض الذي يراه المريض.").max(120, "النص طويل جداً."),
    type: z.enum(OfferType),
    value: z.number().nullable(),
    buyQty: z.number().int().nullable(),
    getQty: z.number().int().nullable(),
    rewardValidityDays: z.number().int().nullable(),
    /** "YYYY-MM-DD" clinic days, inclusive; null = open-ended. */
    startsAt: dayKeyText,
    endsAt: dayKeyText,
    isActive: z.boolean(),
    allBranches: z.boolean(),
    branchIds: z.array(uuid).max(200),
    targets: z
      .object({
        serviceIds: z.array(uuid).max(1000),
        packageIds: z.array(uuid).max(1000),
        categoryIds: z.array(uuid).max(200),
      })
      .refine(
        (t) => t.serviceIds.length + t.packageIds.length + t.categoryIds.length > 0,
        "اختر خدمة أو باقة أو تصنيفاً واحداً على الأقل يُطبَّق عليه العرض."
      ),
  })
  .superRefine((v, ctx) => {
    const need = (ok: boolean, path: string, message: string) => {
      if (!ok) ctx.addIssue({ code: "custom", path: [path], message });
    };
    switch (v.type) {
      case "PERCENT_OFF":
        need(v.value != null && v.value > 0 && v.value <= 100, "value", "النسبة بين 1 و100.");
        break;
      case "AMOUNT_OFF":
        need(v.value != null && v.value > 0, "value", "أدخل قيمة الخصم.");
        break;
      case "FIXED_PRICE":
        need(v.value != null && v.value >= 0, "value", "أدخل السعر الخاص.");
        need(
          v.targets.categoryIds.length === 0,
          "targets",
          "السعر الخاص يُطبَّق على خدمات أو باقات محددة وليس على تصنيف كامل."
        );
        break;
      case "BUY_X_GET_Y":
        need(v.buyQty != null && v.buyQty >= 1, "buyQty", "أدخل عدد الجلسات المدفوعة.");
        need(v.getQty != null && v.getQty >= 1, "getQty", "أدخل عدد الجلسات الهدية.");
        need(
          v.rewardValidityDays != null && v.rewardValidityDays >= 1,
          "rewardValidityDays",
          "أدخل مدة صلاحية الجلسات الهدية بالأيام."
        );
        need(v.targets.packageIds.length === 0, "targets", "هذا النوع يُطبَّق على الخدمات فقط.");
        break;
      case "BONUS_UNITS":
        need(
          v.value != null && Number.isInteger(v.value) && v.value >= 1,
          "value",
          "أدخل عدد الوحدات الإضافية."
        );
        need(v.targets.serviceIds.length === 0, "targets", "هذا النوع يُطبَّق على الباقات فقط.");
        break;
    }
    if (v.startsAt && v.endsAt && v.endsAt < v.startsAt)
      need(false, "endsAt", "تاريخ النهاية قبل تاريخ البداية.");
  })
  .transform((v) => ({
    ...v,
    value: v.type === "BUY_X_GET_Y" ? null : v.value,
    buyQty: v.type === "BUY_X_GET_Y" ? v.buyQty : null,
    getQty: v.type === "BUY_X_GET_Y" ? v.getQty : null,
    rewardValidityDays: v.type === "BUY_X_GET_Y" ? v.rewardValidityDays : null,
    branchIds: v.allBranches ? [] : [...new Set(v.branchIds)],
    targets: {
      serviceIds: [...new Set(v.targets.serviceIds)],
      packageIds: [...new Set(v.targets.packageIds)],
      categoryIds: [...new Set(v.targets.categoryIds)],
    },
  }));
export type OfferInput = z.output<typeof offerInputSchema>;

// ─── Packages ─────────────────────────────────────────────────────────────────

export const packageInputSchema = z
  .object({
    categoryId: uuid,
    name: z.string().trim().min(1, "أدخل اسم الباقة.").max(120, "الاسم طويل جداً."),
    description: optionalText,
    terms: optionalText,
    agentNotes: optionalText,
    price: money,
    validityDays: z
      .number()
      .int("الصلاحية بالأيام يجب أن تكون رقماً صحيحاً.")
      .min(1, "الصلاحية يوم واحد على الأقل.")
      .max(3650, "الصلاحية طويلة جداً."),
    allBranches: z.boolean(),
    branches: z.array(z.object({ branchId: uuid, price: money.nullable() })).max(200),
    /** Credit lines: units (pulses…) or sessions, each spendable on a category OR specific services. */
    items: z
      .array(
        z.object({
          creditType: z.enum(CreditType),
          quantity: z
            .number()
            .int("الكمية يجب أن تكون رقماً صحيحاً.")
            .min(1, "الكمية 1 على الأقل.")
            .max(10_000_000),
          categoryId: uuid.nullable(),
          serviceIds: z.array(uuid).max(500),
        })
      )
      .min(1, "أضف رصيداً واحداً على الأقل للباقة (وحدات أو جلسات).")
      .max(20),
  })
  .superRefine((v, ctx) => {
    v.items.forEach((item, i) => {
      const hasCategory = item.categoryId != null;
      const hasServices = item.serviceIds.length > 0;
      if (hasCategory === hasServices)
        ctx.addIssue({
          code: "custom",
          path: ["items", i],
          message: "حدّد لكل رصيد تصنيفاً كاملاً أو خدمات بعينها يُستخدم فيها.",
        });
    });
    if (new Set(v.branches.map((b) => b.branchId)).size !== v.branches.length)
      ctx.addIssue({ code: "custom", path: ["branches"], message: "فرع مكرر." });
  })
  .transform((v) => ({
    ...v,
    items: v.items.map((i) => ({ ...i, serviceIds: [...new Set(i.serviceIds)] })),
  }));
export type PackageInput = z.output<typeof packageInputSchema>;

/** Staff sells a package (or the patient requests one — then unpaid). */
export const sellPackageSchema = z.object({
  patientId: uuid,
  packageId: uuid,
  branchId: uuid,
  paid: z.boolean(),
  note: z.string().trim().max(500).optional(),
});

/** Manual balance change on one credit line (+ adds, − removes). */
export const adjustBalanceSchema = z.object({
  balanceId: uuid,
  delta: z
    .number()
    .int("أدخل رقماً صحيحاً.")
    .refine((n) => n !== 0, "أدخل قيمة غير صفرية."),
  note: z.string().trim().min(1, "اذكر سبب التعديل.").max(500),
});

export const extendPackageSchema = z.object({
  patientPackageId: uuid,
  /** New last valid day, "YYYY-MM-DD". */
  expiresOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "تاريخ غير صالح."),
  note: z.string().trim().min(1, "اذكر سبب التمديد.").max(500),
});

export const cancelPackageSchema = z.object({
  patientPackageId: uuid,
  note: z.string().trim().min(1, "اذكر سبب الإلغاء.").max(500),
});
