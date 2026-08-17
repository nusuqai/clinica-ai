// ─── Shared branded email layout (Arabic RTL) ────────────────────────────────
// Table-based, fully inline-styled markup so it renders consistently across
// email clients (Gmail/Outlook/Apple Mail strip <head> styles). All templates
// compose their body through renderEmail() to stay visually consistent.

export const BRAND = {
  name: "Nusuq",
  primary: "#0B1F3A", // navy
  accent: "#00C2CB", // teal
  bg: "#F0F4F8",
  text: "#0B1F3A",
  muted: "#64748B",
  border: "#E2E8F0",
} as const;

// Minimal HTML escape for interpolated user/clinic values.
export function esc(v: string | null | undefined): string {
  if (!v) return "";
  return v
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export type Cta = { label: string; url: string };

export type EmailParts = {
  /** Hidden inbox-preview line. */
  preheader: string;
  /** Big heading at the top of the card. */
  heading: string;
  /** Inner HTML for the message body (already escaped by the caller). */
  bodyHtml: string;
  /** Optional primary button. */
  cta?: Cta;
  /** Optional clinic name shown as an eyebrow above the heading. */
  clinicName?: string | null;
  /** Optional small note under the button (e.g. link expiry). */
  footnote?: string;
};

function button(cta: Cta): string {
  return `
  <table role="presentation" cellpadding="0" cellspacing="0" style="margin:28px 0 8px;">
    <tr>
      <td align="center" bgcolor="${BRAND.accent}" style="border-radius:14px;">
        <a href="${cta.url}" target="_blank"
           style="display:inline-block;padding:14px 34px;font-family:Tahoma,Arial,sans-serif;font-size:15px;font-weight:700;color:#04222b;text-decoration:none;border-radius:14px;">
          ${esc(cta.label)}
        </a>
      </td>
    </tr>
  </table>`;
}

/** Build a complete, standalone HTML email document. */
export function renderEmail(p: EmailParts): string {
  const eyebrow = p.clinicName
    ? `<p style="margin:0 0 6px;font-family:Tahoma,Arial,sans-serif;font-size:13px;font-weight:700;color:${BRAND.accent};letter-spacing:.3px;">${esc(p.clinicName)}</p>`
    : "";

  const cta = p.cta ? button(p.cta) : "";

  const footnote = p.footnote
    ? `<p style="margin:14px 0 0;font-family:Tahoma,Arial,sans-serif;font-size:12px;line-height:1.7;color:${BRAND.muted};">${p.footnote}</p>`
    : "";

  return `<!DOCTYPE html>
<html lang="ar" dir="rtl" xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta http-equiv="X-UA-Compatible" content="IE=edge" />
  <title>${esc(p.heading)}</title>
</head>
<body style="margin:0;padding:0;background:${BRAND.bg};">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${esc(p.preheader)}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BRAND.bg};padding:32px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:540px;width:100%;">
          <!-- Brand bar -->
          <tr>
            <td style="padding:0 8px 20px;text-align:center;">
              <span style="font-family:Tahoma,Arial,sans-serif;font-size:22px;font-weight:800;color:${BRAND.primary};">
                ${BRAND.name}<span style="color:${BRAND.accent};">.</span>
              </span>
            </td>
          </tr>
          <!-- Card -->
          <tr>
            <td style="background:#ffffff;border:1px solid ${BRAND.border};border-radius:20px;padding:36px 32px;">
              ${eyebrow}
              <h1 style="margin:0 0 16px;font-family:Tahoma,Arial,sans-serif;font-size:22px;line-height:1.4;font-weight:800;color:${BRAND.primary};">
                ${esc(p.heading)}
              </h1>
              <div style="font-family:Tahoma,Arial,sans-serif;font-size:15px;line-height:1.9;color:#334155;">
                ${p.bodyHtml}
              </div>
              ${cta}
              ${footnote}
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding:22px 8px;text-align:center;">
              <p style="margin:0 0 4px;font-family:Tahoma,Arial,sans-serif;font-size:12px;color:${BRAND.muted};">
                © ${BRAND.name} — منصة إدارة العيادات الذكية
              </p>
              <p style="margin:0;font-family:Tahoma,Arial,sans-serif;font-size:11px;color:#94A3B8;">
                هذه رسالة آلية، يُرجى عدم الرد عليها مباشرة.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/** Render a URL as a fallback plain link block (for clients that hide buttons). */
export function linkFallback(url: string): string {
  return `<p style="margin:18px 0 0;font-family:Tahoma,Arial,sans-serif;font-size:12px;line-height:1.7;color:${BRAND.muted};word-break:break-all;">
    إن لم يعمل الزر، انسخ هذا الرابط والصقه في المتصفح:<br/>
    <a href="${url}" style="color:${BRAND.accent};">${esc(url)}</a>
  </p>`;
}
