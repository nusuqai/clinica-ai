import type {
  CreditType,
  PackageLedgerType,
  PackagePaymentStatus,
  PatientPackageStatus,
} from "@prisma/client";

// Labels and small pure helpers for packages — safe for client components.

export const CREDIT_TYPE_LABEL: Record<CreditType, string> = {
  UNITS: "وحدات (نبضات، وحدات…)",
  SESSIONS: "جلسات",
};

export const PATIENT_PACKAGE_STATUS_LABEL: Record<PatientPackageStatus, string> = {
  ACTIVE: "نشطة",
  USED_UP: "استُهلكت",
  EXPIRED: "منتهية",
  CANCELLED: "ملغاة",
};

export const PAYMENT_STATUS_LABEL: Record<PackagePaymentStatus, string> = {
  UNPAID: "غير مدفوعة",
  PAID: "مدفوعة",
};

export const LEDGER_TYPE_LABEL: Record<PackageLedgerType, string> = {
  PURCHASE: "شراء",
  RESERVE: "حجز جلسة",
  RELEASE: "إلغاء حجز",
  CONSUME: "استهلاك",
  ADJUST: "تعديل يدوي",
  EXTEND: "تمديد",
  EXPIRE: "انتهاء الصلاحية",
  CANCEL: "إلغاء الباقة",
};

/** "1500 وحدة · ليزر" / "6 جلسات · جلسة ليزر – الوجه، …" */
export function creditLineText(
  item: {
    creditType: CreditType;
    quantity: number;
    categoryId: string | null;
    serviceIds: string[];
  },
  names: {
    category: (id: string) => string | undefined;
    service: (id: string) => string | undefined;
  }
): string {
  const amount =
    item.creditType === "SESSIONS"
      ? `${item.quantity} ${item.quantity === 1 ? "جلسة" : "جلسات"}`
      : `${item.quantity} وحدة`;
  const coverage = item.categoryId
    ? `كل ${names.category(item.categoryId) ?? "التصنيف"}`
    : item.serviceIds
        .map((id) => names.service(id))
        .filter(Boolean)
        .slice(0, 3)
        .join("، ") + (item.serviceIds.length > 3 ? ` +${item.serviceIds.length - 3}` : "");
  return `${amount} · ${coverage}`;
}
