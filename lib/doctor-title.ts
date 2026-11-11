import type { DoctorTitle } from "@prisma/client";

export const DOCTOR_TITLE_LABEL: Record<DoctorTitle, string> = {
  SPECIALIST: "أخصائي",
  CONSULTANT: "استشاري",
};

/** "استشاري جراحة العظام" — title + specialty, whichever exist; null when neither. */
export function doctorSubtitle(title: DoctorTitle | null, specialty: string | null): string | null {
  const parts = [title ? DOCTOR_TITLE_LABEL[title] : null, specialty].filter(Boolean);
  return parts.length ? parts.join(" ") : null;
}
