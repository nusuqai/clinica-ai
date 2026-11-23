import type { DoctorSex, DoctorTitle } from "@prisma/client";

// "Doctor" in the data model means any practitioner (doctor, nurse, technician,
// therapist) — see docs/services-and-packages.md. The title decides how they are
// presented.
export const DOCTOR_TITLE_LABEL: Record<DoctorTitle, string> = {
  DOCTOR: "طبيب",
  SPECIALIST: "أخصائي",
  CONSULTANT: "استشاري",
  NURSE: "ممرض/ة",
  TECHNICIAN: "فني/ة",
  SPECIALIST_THERAPIST: "أخصائي علاج",
};

/** Feminine forms, used when the practitioner's sex is FEMALE. */
const DOCTOR_TITLE_LABEL_FEMALE: Record<DoctorTitle, string> = {
  DOCTOR: "طبيبة",
  SPECIALIST: "أخصائية",
  CONSULTANT: "استشارية",
  NURSE: "ممرضة",
  TECHNICIAN: "فنية",
  SPECIALIST_THERAPIST: "أخصائية علاج",
};

export const DOCTOR_TITLES = Object.keys(DOCTOR_TITLE_LABEL) as DoctorTitle[];

export const DOCTOR_SEX_LABEL: Record<DoctorSex, string> = {
  MALE: "ذكر",
  FEMALE: "أنثى",
};

export const DOCTOR_SEXES = Object.keys(DOCTOR_SEX_LABEL) as DoctorSex[];

/** Titles that are not physicians — shown without the "د." prefix. */
const NON_PHYSICIAN_TITLES: ReadonlySet<string> = new Set<DoctorTitle>([
  "NURSE",
  "TECHNICIAN",
  "SPECIALIST_THERAPIST",
]);

export function isDoctorTitle(v: unknown): v is DoctorTitle {
  return typeof v === "string" && v in DOCTOR_TITLE_LABEL;
}

export function isDoctorSex(v: unknown): v is DoctorSex {
  return typeof v === "string" && v in DOCTOR_SEX_LABEL;
}

/** The title's label, in the feminine form when `sex` is FEMALE. */
export function doctorTitleLabel(
  title: string | null | undefined,
  sex?: string | null
): string | null {
  if (!isDoctorTitle(title)) return null;
  return sex === "FEMALE" ? DOCTOR_TITLE_LABEL_FEMALE[title] : DOCTOR_TITLE_LABEL[title];
}

/** "ذكر" / "أنثى", or null when not set. */
export function doctorSexLabel(sex: string | null | undefined): string | null {
  return isDoctorSex(sex) ? DOCTOR_SEX_LABEL[sex] : null;
}

/** "د. أحمد" for physicians (or unknown title); just the name for nurses/technicians/therapists. */
export function practitionerName(fullName: string, title?: string | null): string {
  return title && NON_PHYSICIAN_TITLES.has(title) ? fullName : `د. ${fullName}`;
}

/** "استشاري جراحة العظام" — title + specialty, whichever exist; null when neither. */
export function doctorSubtitle(
  title: DoctorTitle | null,
  specialty: string | null,
  sex?: DoctorSex | null
): string | null {
  const parts = [doctorTitleLabel(title, sex), specialty].filter(Boolean);
  return parts.length ? parts.join(" ") : null;
}
