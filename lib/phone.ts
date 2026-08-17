// Phone helpers shared across the app so every place that stores or looks up a
// number uses the SAME format — the WhatsApp `wa_id`: international, digits only,
// no leading `+`, no leading zero (e.g. 201014443991). If the register form, the
// WhatsApp agent onboarding, and admin edits ever normalized differently, phone
// lookups (Profile.phone is @unique) would silently miss.

/** Example number in the required format — used in placeholders/help text. */
export const PHONE_EXAMPLE = "201014443991";

/**
 * Strip anything a user might type around the digits (spaces, dashes,
 * parentheses, and a leading `+` or `00`) so the stored number matches the
 * WhatsApp `wa_id` format exactly.
 */
export function normalizePhone(raw: string): string {
  return raw
    .trim()
    .replace(/[\s()\-]/g, "")
    .replace(/^\+/, "")
    .replace(/^00/, "");
}

/** International format: country code first, digits only, no leading zero, 10–15 digits. */
export function isValidPhone(phone: string): boolean {
  return /^[1-9]\d{9,14}$/.test(phone);
}
