// Clinic prices (examination / consultation fees) are in Egyptian pounds for
// now — one static label used everywhere a fee is shown or told to a patient.
// Kept separate from the AI-credit ledger, which is billed in USD.
export const CURRENCY_LABEL = "جنيه مصري";

// Thousands separators, and decimals only when there are piastres:
// 150000 → "150,000", 1500.5 → "1,500.50", 350.00 → "350".
const WHOLE = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const WITH_PIASTRES = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** A money amount without the currency: "150,000" / "1,500.50". */
export function formatAmount(amount: number | string | { toString(): string }): string {
  const n = typeof amount === "number" ? amount : Number(String(amount));
  if (!Number.isFinite(n)) return String(amount);
  const rounded = Math.round(n * 100) / 100;
  return Number.isInteger(rounded) ? WHOLE.format(rounded) : WITH_PIASTRES.format(rounded);
}

/** "150,000 جنيه مصري". */
export function formatFee(amount: number | string | { toString(): string }): string {
  return `${formatAmount(amount)} ${CURRENCY_LABEL}`;
}

/** Under a money input: the typed amount, readable ("= 150,000 جنيه مصري"). */
export function moneyInputHint(value: string): string | undefined {
  const v = value.trim();
  if (!v || !Number.isFinite(Number(v)) || Number(v) <= 0) return undefined;
  return `= ${formatFee(v)}`;
}
