// Clinic prices (examination / consultation fees) are in Egyptian pounds for
// now — one static label used everywhere a fee is shown or told to a patient.
// Kept separate from the AI-credit ledger, which is billed in USD.
export const CURRENCY_LABEL = "جنيه مصري";

/** "350 جنيه مصري". */
export function formatFee(amount: number | string | { toString(): string }): string {
  return `${String(amount)} ${CURRENCY_LABEL}`;
}
