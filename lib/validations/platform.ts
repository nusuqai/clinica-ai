import { z } from "zod";

// Forms on the platform console (/platform).

const email = z
  .string()
  .trim()
  .min(1, "أدخل البريد الإلكتروني.")
  .pipe(z.email("أدخل بريداً إلكترونياً صحيحاً."));

/** Empty, or a full URL. */
const optionalUrl = z
  .string()
  .trim()
  .pipe(z.union([z.literal(""), z.url("أدخل رابطاً صحيحاً يبدأ بـ https://")]));

/** Empty, or a hex colour like #0B1F3A. */
const optionalColor = z
  .string()
  .trim()
  .refine(
    (v) => v === "" || /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(v),
    "لون غير صالح، مثال: #0B1F3A"
  );

const clinicBranding = {
  name: z.string().trim().min(1, "اسم العيادة مطلوب."),
  logoUrl: optionalUrl,
  primaryColor: optionalColor,
  accentColor: optionalColor,
};

export const createClinicSchema = z.object({
  ...clinicBranding,
  slug: z.string().trim(),
  adminName: z.string().trim().min(1, "أدخل اسم مدير العيادة."),
  adminEmail: email,
  adminPhone: z.string().trim(),
});
export type CreateClinicValues = z.infer<typeof createClinicSchema>;

export const updateClinicSchema = z.object(clinicBranding);
export type UpdateClinicValues = z.infer<typeof updateClinicSchema>;

/** A clinic knowledge document; mirrors the server's checks in server/services/knowledge.ts. */
export const knowledgeDocSchema = z.object({
  title: z.string().trim().min(1, "العنوان مطلوب."),
  slug: z
    .string()
    .trim()
    .min(1, "المعرّف (slug) مطلوب.")
    .regex(/[a-z0-9]/i, "يجب أن يحتوي المعرّف على أحرف إنجليزية أو أرقام."),
  summary: z.string().trim().min(1, "الوصف المختصر مطلوب."),
  content: z.string().refine((v) => v.trim().length > 0, "المحتوى مطلوب."),
  isActive: z.boolean(),
});
export type KnowledgeDocValues = z.infer<typeof knowledgeDocSchema>;

/** One field of the credits panel: a whole number of AI units, sent as a string. */
export function unitsSchema(kind: "positive" | "signed" | "nonNegative") {
  const check = {
    positive: (n: number) => n > 0,
    signed: (n: number) => n !== 0,
    nonNegative: (n: number) => n >= 0,
  }[kind];
  const message = {
    positive: "أدخل عدداً صحيحاً أكبر من صفر.",
    signed: "أدخل عدداً صحيحاً موجباً أو سالباً (مثال: 500 أو \u200E-200).",
    nonNegative: "أدخل عدداً صحيحاً (0 أو أكثر).",
  }[kind];
  return z.object({
    units: z
      .string()
      .trim()
      .refine((v) => /^-?\d+$/.test(v) && check(Number(v)), message),
  });
}
export type UnitsValues = { units: string };

const metaId = (what: string) =>
  z.string().trim().min(1, `أدخل ${what}.`).regex(/^\d+$/, `${what} أرقام فقط.`);

/** Meta Cloud API connection. The token may be left blank once one is saved. */
export function whatsappConnectionSchema(hasToken: boolean) {
  return z.object({
    phoneNumberId: metaId("Phone Number ID"),
    wabaId: metaId("WABA ID"),
    accessToken: hasToken
      ? z.string().trim()
      : z.string().trim().min(1, "أدخل رمز الوصول (Access Token)."),
  });
}
export type WhatsappConnectionValues = z.infer<ReturnType<typeof whatsappConnectionSchema>>;

/** A WhatsApp message template submitted to Meta for approval. */
export const createTemplateSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "أدخل اسم القالب.")
    .regex(/^[a-z0-9_]+$/, "أحرف إنجليزية صغيرة وأرقام وشرطة سفلية (_) فقط."),
  category: z.enum(["UTILITY", "MARKETING", "AUTHENTICATION"]),
  language: z.string().min(1),
  headerText: z.string().trim(),
  bodyText: z.string().trim().min(1, "أدخل نص الرسالة."),
  footerText: z.string().trim(),
  /** One example per {{n}} variable in the body — Meta requires them for review. */
  examples: z.array(z.string().trim().min(1, "أدخل قيمة توضيحية.")),
  buttons: z.array(
    z
      .object({
        type: z.enum(["QUICK_REPLY", "URL", "PHONE_NUMBER"]),
        text: z.string().trim().min(1, "أدخل نص الزر.").max(25, "25 حرفاً كحد أقصى."),
        url: z.string().trim(),
        phoneNumber: z.string().trim(),
      })
      .superRefine((b, ctx) => {
        if (b.type === "URL" && !z.url().safeParse(b.url).success)
          ctx.addIssue({ code: "custom", path: ["url"], message: "أدخل رابطاً صحيحاً." });
        if (b.type === "PHONE_NUMBER" && !/^\+?\d{8,15}$/.test(b.phoneNumber))
          ctx.addIssue({
            code: "custom",
            path: ["phoneNumber"],
            message: "أدخل رقماً دولياً، مثال: +201234567890",
          });
      })
  ),
});
export type CreateTemplateValues = z.infer<typeof createTemplateSchema>;

/** Test-send an approved template to one number. */
export const sendTemplateSchema = z.object({
  phone: z
    .string()
    .trim()
    .min(1, "أدخل رقم الهاتف.")
    .regex(/^\d{8,15}$/, "أرقام فقط مع رمز الدولة، بدون + أو مسافات."),
  variables: z.array(z.string().trim().min(1, "أدخل قيمة هذا المتغيّر.")),
});
export type SendTemplateValues = z.infer<typeof sendTemplateSchema>;
