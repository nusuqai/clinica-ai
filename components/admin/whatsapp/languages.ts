/**
 * Languages offered in the create-template dropdown. Kept short and curated so
 * admins pick a valid Meta language code instead of typing one and having the
 * template rejected. `MessageTemplate.language` stays a free string, so this
 * list can grow without any backend change.
 */
export const LANGUAGES = [
  { value: "ar", label: "العربية (ar)" },
  { value: "en", label: "English (en)" },
  { value: "en_US", label: "English US (en_US)" },
  { value: "en_GB", label: "English UK (en_GB)" },
] as const;

/** Human label for a language code, falling back to the raw code. */
export function languageLabel(code: string): string {
  return LANGUAGES.find((l) => l.value === code)?.label ?? code;
}
