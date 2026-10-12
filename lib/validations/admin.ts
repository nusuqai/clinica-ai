import { z } from "zod";
import { DayOfWeek, PhoneType, SocialPlatform } from "@prisma/client";
import { isValidPhone, normalizePhone, PHONE_EXAMPLE } from "@/lib/phone";

// Schemas for the clinic-admin forms (react-hook-form + zodResolver).

export const specialtySchema = z.object({
  name: z.string().trim().min(1, "أدخل اسم التخصص."),
});
export type SpecialtyValues = z.infer<typeof specialtySchema>;

/** Empty, or a full URL. */
const optionalUrl = z
  .string()
  .trim()
  .pipe(z.union([z.literal(""), z.url("أدخل رابطاً صحيحاً يبدأ بـ https://")]));

/** One row of a branch's / the clinic's phone list. Rows left without a number are dropped on save. */
export const phoneRowSchema = z.object({
  type: z.enum(PhoneType),
  number: z.string().trim(),
  label: z.string().trim(),
  isPrimary: z.boolean(),
});
export type PhoneRowValues = z.infer<typeof phoneRowSchema>;

const branchDaySchema = z.object({
  mode: z.enum(["unset", "open", "closed"]),
  openTime: z.string(),
  closeTime: z.string(),
});

export const branchFormSchema = z.object({
  name: z.string().trim().min(1, "اسم الفرع مطلوب."),
  address: z.string().trim(),
  mapsUrl: optionalUrl,
  latitude: z.string(),
  longitude: z.string(),
  hasParking: z.boolean(),
  parkingInfo: z.string().trim(),
  nearestLandmark: z.string().trim(),
  directions: z.string().trim(),
  phones: z.array(phoneRowSchema),
  hours: z.record(z.enum(DayOfWeek), branchDaySchema),
});
export type BranchFormValues = z.infer<typeof branchFormSchema>;
export type BranchDayMode = BranchFormValues["hours"][DayOfWeek]["mode"];

export const clinicInfoSchema = z.object({
  name: z.string().trim().min(1, "أدخل اسم العيادة."),
  description: z.string().trim(),
  phones: z.array(phoneRowSchema),
  socials: z.array(z.object({ platform: z.enum(SocialPlatform), url: optionalUrl })),
});
export type ClinicInfoValues = z.infer<typeof clinicInfoSchema>;

/** Empty, or a valid international number (normalized like the WhatsApp wa_id). */
const optionalPhone = z
  .string()
  .transform(normalizePhone)
  .refine(
    (v) => v === "" || isValidPhone(v),
    `رقم الهاتف غير صالح — بادئة الدولة ثم الرقم، مثال: ${PHONE_EXAMPLE}`
  );

export const patientProfileSchema = z.object({
  fullName: z.string().trim().min(1, "أدخل اسم المريض."),
  phone: optionalPhone,
});
export type PatientProfileInput = z.input<typeof patientProfileSchema>;

export const patientEmailSchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, "أدخل البريد الإلكتروني.")
    .pipe(z.email("أدخل بريداً إلكترونياً صحيحاً.")),
});
export type PatientEmailValues = z.infer<typeof patientEmailSchema>;
