import { z } from "zod";
import { toFormData } from "@/lib/form-data";
import type { RuleDraft } from "@/lib/validations/availability";

// The add/edit doctor modals. Both share one shape (so they share one fields
// component); adding additionally requires a specialty and may carry drafted rules.

/** Specialty select value meaning "create a new specialty with the typed name". */
export const NEW_SPECIALTY = "__new__";

const optionalAmount = z
  .string()
  .trim()
  .refine((v) => v === "" || (Number.isFinite(Number(v)) && Number(v) >= 0), "أدخل رقماً صحيحاً.");

const doctorFormBase = z.object({
  fullName: z.string().trim().min(1, "أدخل اسم الطبيب."),
  title: z.string(),
  specialtyId: z.string(),
  newSpecialtyName: z.string().trim(),
  yearsOfExperience: optionalAmount,
  examinationFee: optionalAmount,
  consultationFee: optionalAmount,
  requiresAdvanceBooking: z.boolean(),
  acceptsChildren: z.boolean(),
  branchIds: z.array(z.string()),
  qualifications: z.string().trim(),
  expertiseAreas: z.string().trim(),
  bio: z.string().trim(),
  /** Add only: rules drafted before the doctor exists. */
  rules: z.array(z.custom<RuleDraft>()),
});

const namesNewSpecialty = (v: { specialtyId: string; newSpecialtyName: string }) =>
  v.specialtyId !== NEW_SPECIALTY || v.newSpecialtyName.length > 0;
const newSpecialtyIssue = { message: "أدخل اسم التخصص الجديد.", path: ["newSpecialtyName"] };

export const editDoctorSchema = doctorFormBase.refine(namesNewSpecialty, newSpecialtyIssue);

export const addDoctorSchema = doctorFormBase
  .refine((v) => v.specialtyId !== "", { message: "اختر التخصص.", path: ["specialtyId"] })
  .refine(namesNewSpecialty, newSpecialtyIssue);

export type DoctorFormValues = z.infer<typeof doctorFormBase>;

export const EMPTY_DOCTOR_FORM: DoctorFormValues = {
  fullName: "",
  title: "",
  specialtyId: "",
  newSpecialtyName: "",
  yearsOfExperience: "",
  examinationFee: "",
  consultationFee: "",
  requiresAdvanceBooking: true,
  acceptsChildren: false,
  branchIds: [],
  qualifications: "",
  expertiseAreas: "",
  bio: "",
  rules: [],
};

/** The FormData createDoctorAction / updateDoctorAction read. */
export function doctorToFormData(v: DoctorFormValues): FormData {
  const { specialtyId, newSpecialtyName, rules, ...rest } = v;
  const fd = toFormData(rest);
  // The server resolves either an existing id or a new name into a specialtyId.
  const isNew = specialtyId === NEW_SPECIALTY;
  fd.set("specialtyId", isNew ? "" : specialtyId);
  if (isNew) fd.set("newSpecialtyName", newSpecialtyName);
  if (rules.length > 0) fd.set("rules", JSON.stringify(rules));
  return fd;
}

/** The doctor's own profile page. */
export const doctorProfileSchema = z
  .object({
    fullName: z.string().trim().min(1, "أدخل اسمك الكامل."),
    phone: z.string().trim(),
    specialtyId: z.string(),
    newSpecialtyName: z.string().trim(),
    consultationFee: optionalAmount,
    bio: z.string().trim(),
  })
  .refine(namesNewSpecialty, newSpecialtyIssue);
export type DoctorProfileValues = z.infer<typeof doctorProfileSchema>;

/** FormData for updateMyProfileAction (same specialty encoding as the modals). */
export function doctorProfileToFormData(v: DoctorProfileValues): FormData {
  const { specialtyId, newSpecialtyName, ...rest } = v;
  const fd = toFormData(rest);
  const isNew = specialtyId === NEW_SPECIALTY;
  fd.set("specialtyId", isNew ? "" : specialtyId);
  if (isNew) fd.set("newSpecialtyName", newSpecialtyName);
  return fd;
}
