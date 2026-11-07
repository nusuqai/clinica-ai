import { z } from "zod";

// Forms on the public marketing site and the patient's own pages.

export const clinicRequestSchema = z.object({
  requesterName: z.string().trim().min(1, "أدخل اسمك."),
  requesterEmail: z
    .string()
    .trim()
    .min(1, "أدخل بريدك الإلكتروني.")
    .pipe(z.email("أدخل بريداً إلكترونياً صحيحاً.")),
  requestedClinicName: z.string().trim().min(1, "أدخل اسم العيادة."),
  requesterPhone: z.string().trim(),
  requestedSlug: z.string().trim(),
  note: z.string().trim(),
});
export type ClinicRequestValues = z.infer<typeof clinicRequestSchema>;

export const patientProfileSelfSchema = z.object({
  fullName: z.string().trim().min(1, "الاسم الكامل مطلوب."),
  phone: z.string().trim(),
});
export type PatientProfileSelfValues = z.infer<typeof patientProfileSelfSchema>;
