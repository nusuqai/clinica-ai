import type { DoctorTitle } from "@prisma/client";

// "Doctor" in the data model means any practitioner (doctor, nurse, technician,
// therapist) — see docs/services-and-packages.md. The title decides how they are
// presented.
export const DOCTOR_TITLE_LABEL: Record<DoctorTitle, string> = {
  SPECIALIST: "أخصائي",
  CONSULTANT: "استشاري",
  NURSE: "ممرض/ة",
  TECHNICIAN: "فني/ة",
  SPECIALIST_THERAPIST: "أخصائي علاج",
};

export const DOCTOR_TITLES = Object.keys(DOCTOR_TITLE_LABEL) as DoctorTitle[];

/** Titles that are not physicians — shown without the "د." prefix. */
const NON_PHYSICIAN_TITLES: ReadonlySet<string> = new Set<DoctorTitle>([
  "NURSE",
  "TECHNICIAN",
  "SPECIALIST_THERAPIST",
]);

export function isDoctorTitle(v: unknown): v is DoctorTitle {
  return typeof v === "string" && v in DOCTOR_TITLE_LABEL;
}

export function doctorTitleLabel(title: string | null | undefined): string | null {
  return isDoctorTitle(title) ? DOCTOR_TITLE_LABEL[title] : null;
}

/** "د. أحمد" for physicians (or unknown title); just the name for nurses/technicians/therapists. */
export function practitionerName(fullName: string, title?: string | null): string {
  return title && NON_PHYSICIAN_TITLES.has(title) ? fullName : `د. ${fullName}`;
}

/** "استشاري جراحة العظام" — title + specialty, whichever exist; null when neither. */
export function doctorSubtitle(title: DoctorTitle | null, specialty: string | null): string | null {
  const parts = [title ? DOCTOR_TITLE_LABEL[title] : null, specialty].filter(Boolean);
  return parts.length ? parts.join(" ") : null;
}
