import { z } from "zod";

// The patient intake questionnaire ("ملف المريض") — answered once per clinic,
// before the patient's first booking there. Shared by the web booking modal,
// the AI agent's save_patient_intake tool and the staff read-only view, so the
// questions stay identical everywhere. Stored as free text, one column each
// (PatientIntake in prisma/schema.prisma) — to be structured later. The visit
// reason ("الكشف بخصوص إيه؟") is not here: it changes per visit, so it is the
// booking's own notes (Appointment.notes).

export const INTAKE_FIELDS = [
  { key: "fullName", label: "الاسم ثلاثي", question: "الاسم ثلاثي", multiline: false },
  { key: "age", label: "السن", question: "السن", multiline: false },
  { key: "weight", label: "الوزن", question: "الوزن", multiline: false },
  { key: "address", label: "العنوان", question: "العنوان", multiline: false },
  {
    key: "medicalConditions",
    label: "الأمراض السابقة / المزمنة",
    question: "هل سبق لحضرتك الإصابة بأي أمراض أو تعانين من أمراض مزمنة؟ برجاء التوضيح.",
    multiline: true,
  },
  {
    key: "smokingStatus",
    label: "التدخين",
    question: "هل حضرتك مدخنة أم غير مدخنة؟",
    multiline: false,
  },
  {
    key: "previousSurgeries",
    label: "العمليات الجراحية السابقة",
    question:
      "هل سبق إجراء أي عمليات جراحية؟ وإذا كانت الإجابة نعم، برجاء ذكر نوع العملية وتاريخ إجرائها إن أمكن",
    multiline: true,
  },
] as const;

export type IntakeKey = (typeof INTAKE_FIELDS)[number]["key"];

const answer = z.string().trim().min(1, "هذا الحقل مطلوب.").max(2000, "الإجابة طويلة جداً.");

/** Every question is required when the patient submits the file. */
export const intakeSchema = z.object({
  fullName: answer,
  age: answer,
  weight: answer,
  address: answer,
  medicalConditions: answer,
  smokingStatus: answer,
  previousSurgeries: answer,
});
export type IntakeValues = z.infer<typeof intakeSchema>;

export const EMPTY_INTAKE: IntakeValues = {
  fullName: "",
  age: "",
  weight: "",
  address: "",
  medicalConditions: "",
  smokingStatus: "",
  previousSurgeries: "",
};

// Staff editing the file (admin patient page): answers may be left empty —
// the clinic may not know everything — and empty ones are stored as null.
const optionalAnswer = z.string().trim().max(2000, "الإجابة طويلة جداً.");
export const staffIntakeSchema = z.object({
  fullName: optionalAnswer,
  age: optionalAnswer,
  weight: optionalAnswer,
  address: optionalAnswer,
  medicalConditions: optionalAnswer,
  smokingStatus: optionalAnswer,
  previousSurgeries: optionalAnswer,
});

/** Booking refused because the intake file is missing (web action + agent tool). */
export const INTAKE_REQUIRED_ERROR = "قبل حجز أول موعد يجب استكمال ملف المريض.";
