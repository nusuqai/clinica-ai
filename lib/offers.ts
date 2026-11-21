import type { OfferType } from "@prisma/client";
import { formatFee } from "@/lib/currency";

// Pure offer helpers — safe for client components. Rules:
// docs/services-and-packages.md §3.5.
//
// Offer dates are clinic calendar days, stored as midnight-UTC "wall-clock"
// dates (like Slot.date) and compared as "YYYY-MM-DD" keys. Both ends are
// inclusive; a missing end means open-ended. A service offer is judged on the
// VISIT day, a package offer on the PURCHASE day.

export const OFFER_TYPE_LABEL: Record<OfferType, string> = {
  PERCENT_OFF: "خصم نسبة مئوية",
  AMOUNT_OFF: "خصم مبلغ ثابت",
  FIXED_PRICE: "سعر خاص",
  BUY_X_GET_Y: "اشترِ واحصل على جلسة هدية",
  BONUS_UNITS: "وحدات إضافية مجاناً (للباقات)",
};
export const OFFER_TYPES = Object.keys(OFFER_TYPE_LABEL) as OfferType[];

export type OfferStatus = "PAUSED" | "SCHEDULED" | "ACTIVE" | "EXPIRED";

export const OFFER_STATUS_LABEL: Record<OfferStatus, string> = {
  PAUSED: "موقوف",
  SCHEDULED: "مجدول",
  ACTIVE: "فعّال",
  EXPIRED: "منتهٍ",
};

/** Offer types that change the price of what they target. */
export function offerChangesPrice(type: OfferType): boolean {
  return type === "PERCENT_OFF" || type === "AMOUNT_OFF" || type === "FIXED_PRICE";
}

/** "YYYY-MM-DD" of a stored wall-clock date. */
export function dayKey(d: Date | string): string {
  return new Date(d).toISOString().slice(0, 10);
}

/** A "YYYY-MM-DD" day key → the stored wall-clock Date (midnight UTC). */
export function dayFromKey(key: string): Date {
  return new Date(`${key}T00:00:00.000Z`);
}

/** Today's date on the clinic's clock, as a "YYYY-MM-DD" key. */
export function todayInZone(timeZone: string, now: Date = new Date()): string {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export interface OfferWindow {
  isActive: boolean;
  startsAt: Date | string | null;
  endsAt: Date | string | null;
}

/** Status of an offer on `day` (the clinic's today, for the admin list). */
export function offerStatus(offer: OfferWindow, day: string): OfferStatus {
  if (!offer.isActive) return "PAUSED";
  if (offer.startsAt && day < dayKey(offer.startsAt)) return "SCHEDULED";
  if (offer.endsAt && day > dayKey(offer.endsAt)) return "EXPIRED";
  return "ACTIVE";
}

/** Whether the offer applies on `day`. */
export function offerLiveOn(offer: OfferWindow, day: string): boolean {
  return offerStatus(offer, day) === "ACTIVE";
}

/** Do two offers' date windows share at least one day? (null = open-ended) */
export function windowsOverlap(a: OfferWindow, b: OfferWindow): boolean {
  const aStart = a.startsAt ? dayKey(a.startsAt) : "0000-00-00";
  const aEnd = a.endsAt ? dayKey(a.endsAt) : "9999-99-99";
  const bStart = b.startsAt ? dayKey(b.startsAt) : "0000-00-00";
  const bEnd = b.endsAt ? dayKey(b.endsAt) : "9999-99-99";
  return aStart <= bEnd && bStart <= aEnd;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * The price after a price-changing offer, never below 0 and never above the
 * base. For PER_UNIT services pass the UNIT price. Non-price offers (and a
 * null base) return the base untouched with no discount.
 */
export function applyOffer(
  offer: { type: OfferType; value: number | null },
  base: number | null
): { price: number | null; discount: number } {
  if (base == null || !offerChangesPrice(offer.type) || offer.value == null)
    return { price: base, discount: 0 };
  let price = base;
  if (offer.type === "PERCENT_OFF") price = base * (1 - offer.value / 100);
  else if (offer.type === "AMOUNT_OFF") price = base - offer.value;
  else if (offer.type === "FIXED_PRICE") price = offer.value;
  price = round2(Math.min(base, Math.max(0, price)));
  return { price, discount: round2(base - price) };
}

/** A default patient-facing label for an offer ("خصم 20%", "جلسة + جلسة هدية"…). */
export function suggestOfferLabel(o: {
  type: OfferType;
  value: number | null;
  buyQty?: number | null;
  getQty?: number | null;
}): string {
  switch (o.type) {
    case "PERCENT_OFF":
      return o.value != null ? `خصم ${o.value}%` : "خصم";
    case "AMOUNT_OFF":
      return o.value != null ? `خصم ${formatFee(o.value)}` : "خصم";
    case "FIXED_PRICE":
      return o.value != null ? `بسعر ${formatFee(o.value)} بدلاً من السعر الأصلي` : "سعر خاص";
    case "BUY_X_GET_Y": {
      const buy = o.buyQty ?? 1;
      const get = o.getQty ?? 1;
      return buy === 1 && get === 1 ? "جلسة + جلسة هدية" : `اشترِ ${buy} واحصل على ${get} هدية`;
    }
    case "BONUS_UNITS":
      return o.value != null ? `${o.value} وحدة إضافية هدية` : "وحدات إضافية هدية";
  }
}

/** "حتى 30 نوفمبر" style end-date line for patients (null when open-ended). */
export function offerEndsText(endsAt: Date | string | null): string | null {
  if (!endsAt) return null;
  const d = new Date(endsAt).toLocaleDateString("ar-EG", {
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  });
  return `حتى ${d}`;
}
