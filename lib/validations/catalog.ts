import { z } from "zod";
import { PricingType, ServiceKind } from "@prisma/client";
import { pricingUsesPrice, pricingUsesUnits } from "@/lib/catalog";

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
