/**
 * Shared helpers for working with WhatsApp template bodies on the client.
 *
 * A template body carries `{{1}}`, `{{2}}`… placeholders that Meta fills in
 * order at send time. These helpers are used by the create form, the templates
 * list, the send-to-number flow, the inbox picker, and the preview component —
 * so they live here rather than being redefined in each.
 */

/** The `{{n}}` placeholder pattern, tolerant of inner whitespace. */
const PLACEHOLDER = /\{\{\s*(\d+)\s*\}\}/g;

/**
 * Substitutes `{{1}}`, `{{2}}`… in a template body with the given values.
 * An empty/blank value leaves its placeholder in place, so a half-filled
 * preview still reads as a template rather than a gap.
 */
export function fillTemplate(bodyText: string, variables: string[]): string {
  return bodyText.replace(PLACEHOLDER, (_m, n) => {
    const value = variables[Number(n) - 1];
    return value?.trim() ? value : `{{${n}}}`;
  });
}

/** Number of `{{n}}` placeholders in a body — how many inputs to render. */
export function countVariables(body: string): number {
  return (body.match(PLACEHOLDER) ?? []).length;
}
