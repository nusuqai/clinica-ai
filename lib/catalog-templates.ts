import type { PricingType, ServiceKind } from "@prisma/client";

// Starter catalogs per clinic type (docs/services-and-packages.md §7). Applying
// one creates its categories and typical services — kind, pricing type, unit,
// duration, NO prices — inactive, so nothing unpriced reaches patients until the
// clinic prices it, assigns practitioners and activates it. Idempotent: names
// that already exist are skipped. Afterwards it's ordinary editable data.

export interface TemplateService {
  name: string;
  kind: ServiceKind;
  pricingType: PricingType;
  unitLabel?: string;
  durationMin: number;
  description?: string;
}

export interface CatalogTemplate {
  key: string;
  label: string;
  description: string;
  categories: { name: string; services: TemplateService[] }[];
}

const s = (
  name: string,
  kind: ServiceKind,
  pricingType: PricingType,
  durationMin: number,
  unitLabel?: string
): TemplateService => ({ name, kind, pricingType, durationMin, unitLabel });

export const CATALOG_TEMPLATES: CatalogTemplate[] = [
  {
    key: "general",
    label: "عيادة عامة / باطنة",
    description: "كشف ومتابعة وفحوصات وإجراءات بسيطة",
    categories: [
      {
        name: "كشف ومتابعة",
        services: [
          s("كشف", "CONSULTATION", "FIXED", 15),
          s("استشارة / متابعة", "FOLLOW_UP", "FIXED", 10),
        ],
      },
      {
        name: "فحوصات",
        services: [
          s("رسم قلب (ECG)", "TEST", "FIXED", 15),
          s("قياس سكر عشوائي", "TEST", "FIXED", 5),
        ],
      },
      {
        name: "إجراءات",
        services: [
          s("حقن / تركيب كانيولا", "PROCEDURE", "FIXED", 10),
          s("غيار على جرح", "PROCEDURE", "FIXED", 15),
        ],
      },
    ],
  },
  {
    key: "dental",
    label: "أسنان",
    description: "كشف، حشو وعصب، خلع، تنظيف وتجميل، تركيبات وتقويم",
    categories: [
      {
        name: "كشف وأشعة",
        services: [
          s("كشف أسنان", "CONSULTATION", "FIXED", 20),
          s("متابعة", "FOLLOW_UP", "FIXED", 15),
          s("أشعة بانوراما", "TEST", "FIXED", 15),
        ],
      },
      {
        name: "علاج الأسنان",
        services: [
          s("حشو عادي", "PROCEDURE", "PER_UNIT", 30, "سن"),
          s("حشو عصب", "PROCEDURE", "STARTING_FROM", 60),
          s("خلع عادي", "PROCEDURE", "PER_UNIT", 30, "سن"),
          s("خلع ضرس عقل جراحي", "PROCEDURE", "STARTING_FROM", 60),
        ],
      },
      {
        name: "تجميل الأسنان",
        services: [
          s("تنظيف جير وتلميع", "PROCEDURE", "FIXED", 45),
          s("تبييض أسنان", "SESSION", "FIXED", 60),
        ],
      },
      {
        name: "تركيبات وتقويم",
        services: [
          s("تركيبة زيركون", "PROCEDURE", "PER_UNIT", 45, "سن"),
          s("تقويم — خطة علاج", "CONSULTATION", "AFTER_CONSULTATION", 30),
          s("متابعة تقويم", "FOLLOW_UP", "FIXED", 20),
        ],
      },
    ],
  },
  {
    key: "aesthetic",
    label: "تجميل وجلدية",
    description: "كشف جلدية، ليزر إزالة الشعر، بوتوكس وفيلر، تقشير ونضارة، علاجات الشعر",
    categories: [
      {
        name: "كشف جلدية",
        services: [
          s("كشف جلدية", "CONSULTATION", "FIXED", 15),
          s("متابعة جلدية", "FOLLOW_UP", "FIXED", 10),
        ],
      },
      {
        name: "ليزر إزالة الشعر",
        services: [
          s("ليزر بالنبضة", "SESSION", "PER_UNIT", 30, "نبضة"),
          s("ليزر — الوجه", "SESSION", "FIXED", 20),
          s("ليزر — تحت الإبط", "SESSION", "FIXED", 15),
          s("ليزر — الساقين كاملة", "SESSION", "FIXED", 45),
          s("ليزر — الجسم كامل", "SESSION", "FIXED", 90),
        ],
      },
      {
        name: "بوتوكس وفيلر",
        services: [
          s("بوتوكس بالوحدة", "PROCEDURE", "PER_UNIT", 30, "وحدة"),
          s("فيلر", "PROCEDURE", "PER_UNIT", 45, "مل"),
          s("إذابة فيلر", "PROCEDURE", "FIXED", 30),
        ],
      },
      {
        name: "تقشير ونضارة",
        services: [
          s("تقشير كيميائي", "SESSION", "FIXED", 30),
          s("بلازما للوجه (PRP)", "SESSION", "FIXED", 45),
          s("ميزوثيرابي", "SESSION", "FIXED", 30),
          s("إزالة الزوائد الجلدية", "PROCEDURE", "TIERED", 30, "زائدة"),
        ],
      },
      {
        name: "علاجات الشعر",
        services: [s("بلازما للشعر", "SESSION", "FIXED", 45)],
      },
    ],
  },
  {
    key: "nutrition",
    label: "تغذية",
    description: "كشف تغذية، متابعات دورية وقياسات",
    categories: [
      {
        name: "التغذية العلاجية",
        services: [
          s("كشف تغذية — أول مرة", "CONSULTATION", "FIXED", 45),
          s("متابعة تغذية", "FOLLOW_UP", "FIXED", 20),
          s("قياس تحليل مكونات الجسم", "TEST", "FIXED", 10),
        ],
      },
    ],
  },
  {
    key: "physio",
    label: "علاج طبيعي",
    description: "تقييم وجلسات علاج وتأهيل",
    categories: [
      {
        name: "العلاج الطبيعي",
        services: [
          s("تقييم — أول مرة", "CONSULTATION", "FIXED", 45),
          s("جلسة علاج طبيعي", "SESSION", "FIXED", 45),
          s("جلسة تأهيل بعد إصابة أو عملية", "SESSION", "FIXED", 60),
          s("علاج يدوي", "SESSION", "FIXED", 30),
          s("جلسة موجات صادمة", "SESSION", "FIXED", 20),
        ],
      },
    ],
  },
];
