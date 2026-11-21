import type { PricingType, ServiceKind } from "@prisma/client";
import { formatFee } from "@/lib/currency";

// Labels and small pure helpers for the service catalog (services, packages,
// offers) — safe to import from client components. Rules and design:
// docs/services-and-packages.md.

export const SERVICE_KIND_LABEL: Record<ServiceKind, string> = {
  CONSULTATION: "كشف",
  FOLLOW_UP: "متابعة / استشارة",
  PROCEDURE: "إجراء",
  SESSION: "جلسة",
  TEST: "فحص / تحليل",
};
export const SERVICE_KINDS = Object.keys(SERVICE_KIND_LABEL) as ServiceKind[];

export const PRICING_TYPE_LABEL: Record<PricingType, string> = {
  FIXED: "سعر ثابت",
  PER_UNIT: "سعر للوحدة",
  STARTING_FROM: "يبدأ من",
  TIERED: "شرائح حسب الكمية",
  AFTER_CONSULTATION: "يُحدَّد بعد الكشف",
  FREE: "مجاني",
};
export const PRICING_TYPES = Object.keys(PRICING_TYPE_LABEL) as PricingType[];

/** Pricing types whose `price` field means something. */
export function pricingUsesPrice(type: PricingType): boolean {
  return type === "FIXED" || type === "PER_UNIT" || type === "STARTING_FROM";
}

/** Pricing types counted in units (need a unit label, quantity at booking). */
export function pricingUsesUnits(type: PricingType): boolean {
  return type === "PER_UNIT" || type === "TIERED";
}

export interface PriceTierLike {
  minQty: number;
  maxQty: number | null;
  price: number;
}

/** "1–5" / "أكثر من 10" for a quantity bracket. */
export function tierRangeLabel(tier: Pick<PriceTierLike, "minQty" | "maxQty">): string {
  if (tier.maxQty == null) return `${tier.minQty} فأكثر`;
  return tier.minQty === tier.maxQty ? `${tier.minQty}` : `${tier.minQty}–${tier.maxQty}`;
}

/** The tier a quantity falls into, or null when none matches. */
export function tierForQuantity<T extends PriceTierLike>(
  tiers: readonly T[],
  qty: number
): T | null {
  return tiers.find((t) => qty >= t.minQty && (t.maxQty == null || qty <= t.maxQty)) ?? null;
}

/**
 * One-line price description for a service as configured (before offers):
 * "350 جنيه مصري", "1.5 جنيه مصري / نبضة", "يبدأ من 900 جنيه مصري", …
 * `price` is the resolved price for the context (branch / practitioner).
 */
export function servicePriceText(s: {
  pricingType: PricingType;
  price: number | null;
  unitLabel: string | null;
  tiers?: readonly PriceTierLike[];
}): string {
  switch (s.pricingType) {
    case "FREE":
      return "مجاني";
    case "AFTER_CONSULTATION":
      return "يُحدَّد بعد الكشف";
    case "TIERED": {
      const tiers = s.tiers ?? [];
      if (tiers.length === 0) return "حسب الكمية";
      return tiers
        .map((t) => `${tierRangeLabel(t)} ${s.unitLabel ?? ""}: ${formatFee(t.price)}`.trim())
        .join(" · ");
    }
    case "PER_UNIT":
      return s.price == null ? "—" : `${formatFee(s.price)} / ${s.unitLabel ?? "وحدة"}`;
    case "STARTING_FROM":
      return s.price == null ? "—" : `يبدأ من ${formatFee(s.price)}`;
    case "FIXED":
      return s.price == null ? "—" : formatFee(s.price);
  }
}

/** "30 د" / "ساعة ونصف" style duration — kept numeric and short. */
export function durationText(min: number | null | undefined): string | null {
  if (!min) return null;
  if (min < 60) return `${min} دقيقة`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  const hours = h === 1 ? "ساعة" : h === 2 ? "ساعتان" : `${h} ساعات`;
  return m ? `${hours} و${m} دقيقة` : hours;
}
