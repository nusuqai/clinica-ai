import { StaffEvent } from "@prisma/client";

/**
 * Team alerts (#89) — the event catalog and the alert template's tokens.
 * Client-safe (no server imports): the settings UI renders from these too.
 */

export const STAFF_EVENT_META: Record<
  StaffEvent,
  {
    label: string;
    description: string;
    /** Group heading in the grouped WhatsApp message. */
    heading: string;
    /** Short noun for the template summary ("2 تصعيد"). */
    short: string;
    /** Personal: always goes to the one member it concerns — not routable. */
    personal: boolean;
    /** Doctors may be routed this event (they get only their own appointments). */
    doctors: boolean;
  }
> = {
  AI_ESCALATION: {
    label: "تصعيدات المحادثات",
    description: "عندما يطلب عميل موظفاً، أو يحتاج المساعد الذكي مراجعة من الفريق",
    heading: "تصعيدات تحتاج مراجعة",
    short: "تصعيد",
    personal: false,
    doctors: false,
  },
  NEW_BOOKING: {
    label: "الحجوزات الجديدة",
    description: "كل حجز جديد (الطبيب يصله ما يخصه فقط)",
    heading: "حجوزات جديدة",
    short: "حجز جديد",
    personal: false,
    doctors: true,
  },
  PATIENT_CANCELLED: {
    label: "إلغاء المرضى لمواعيدهم",
    description: "عندما يلغي المريض موعده بنفسه (الطبيب يصله ما يخصه فقط)",
    heading: "مواعيد ألغاها المرضى",
    short: "إلغاء",
    personal: false,
    doctors: true,
  },
  UNITS_LOW: {
    label: "اقتراب نفاد الوحدات",
    description: "عندما يقترب رصيد وحدات المساعد الذكي من النفاد",
    heading: "رصيد الوحدات",
    short: "تنبيه رصيد",
    personal: false,
    doctors: false,
  },
  UNITS_OUT: {
    label: "نفاد الوحدات",
    description: "عندما ينفد رصيد الوحدات ويتوقف المساعد عن الرد على العملاء",
    heading: "نفاد الوحدات",
    short: "نفاد رصيد",
    personal: false,
    doctors: false,
  },
  COLLEAGUE_ESCALATION: {
    label: "تصعيد من زميل",
    description: "عندما يصعّد لك زميل محادثة (يصل لك أنت فقط)",
    heading: "محادثات صعّدها لك زملاؤك",
    short: "تصعيد من زميل",
    personal: true,
    doctors: false,
  },
  ASSIGNMENT: {
    label: "إسناد محادثة إليك",
    description: "عندما تُسند إليك محادثة (يصل لك أنت فقط)",
    heading: "محادثات أُسندت إليك",
    short: "محادثة مُسندة",
    personal: true,
    doctors: false,
  },
  REMINDER_DUE: {
    label: "تذكيراتك",
    description: "عندما يحين موعد تذكير وضعته على محادثة (يصل لك أنت فقط)",
    heading: "تذكيرات حان وقتها",
    short: "تذكير",
    personal: true,
    doctors: false,
  },
  // Not an alert: the scheduled patient-data report (docs/data-export.md). Its
  // recipients are chosen on the export page, so it is left out of
  // STAFF_EVENTS (the alert routing list and the grouped digest).
  DAILY_REPORT: {
    label: "تقرير بيانات المرضى المجدول",
    description: "ملف Excel بحركة المرضى يُرسل يومياً في الوقت المحدد",
    heading: "التقرير اليومي",
    short: "تقرير",
    personal: false,
    doctors: false,
  },
};

/** Display order: routable events first, then the personal ones. (DAILY_REPORT
 *  is deliberately absent — see its entry above.) */
export const STAFF_EVENTS: StaffEvent[] = [
  StaffEvent.AI_ESCALATION,
  StaffEvent.NEW_BOOKING,
  StaffEvent.PATIENT_CANCELLED,
  StaffEvent.UNITS_LOW,
  StaffEvent.UNITS_OUT,
  StaffEvent.COLLEAGUE_ESCALATION,
  StaffEvent.ASSIGNMENT,
  StaffEvent.REMINDER_DUE,
];

export const ROUTABLE_STAFF_EVENTS = STAFF_EVENTS.filter((e) => !STAFF_EVENT_META[e].personal);

// ─── The alert template (official numbers, closed 24h window) ────────────────

/** What can fill each {{n}} of the clinic's approved alert template. */
export const STAFF_ALERT_TOKENS = [
  "alert_count",
  "alert_summary",
  "member_name",
  "clinic_name",
] as const;
export type StaffAlertToken = (typeof STAFF_ALERT_TOKENS)[number];

export const STAFF_ALERT_TOKEN_LABELS: Record<StaffAlertToken, string> = {
  alert_count: "عدد التنبيهات (مثال: 4)",
  alert_summary: "ملخص التنبيهات (مثال: 2 تصعيد، 1 حجز جديد، 1 إلغاء)",
  member_name: "اسم عضو الفريق",
  clinic_name: "اسم العيادة",
};

/** A suggested body for the clinic to submit to Meta (UTILITY category). */
export const SUGGESTED_ALERT_TEMPLATE_BODY =
  "مرحباً {{1}}، لديك {{2}} تنبيهات جديدة في {{3}}: {{4}}. أرسل أي رسالة هنا لعرض التفاصيل.";
export const SUGGESTED_ALERT_TEMPLATE_MAP: StaffAlertToken[] = [
  "member_name",
  "alert_count",
  "clinic_name",
  "alert_summary",
];
