"use client";

import { CheckCheck, CornerUpLeft, Link as LinkIcon, Phone } from "lucide-react";
import { fillTemplate } from "@/lib/meta/template-render";
import type { TemplateButton } from "@/lib/meta/whatsapp";

interface WhatsappPreviewProps {
  /** Optional TEXT header ("title"), shown bold above the body. */
  headerText?: string;
  /** Template body with `{{n}}` placeholders. */
  bodyText: string;
  /** Values to substitute; empty ones keep their `{{n}}` placeholder. */
  variables?: string[];
  /** Optional footer line, shown muted under the body. */
  footerText?: string;
  /** Buttons rendered as tappable rows under the bubble. */
  buttons?: TemplateButton[];
  /** Clock label inside the bubble (defaults to a sample time). */
  time?: string;
  /** Extra classes for the outer wallpaper panel. */
  className?: string;
}

function ButtonIcon({ type }: { type: TemplateButton["type"] }) {
  const cls = "w-3.5 h-3.5";
  if (type === "URL") return <LinkIcon className={cls} />;
  if (type === "PHONE_NUMBER") return <Phone className={cls} />;
  return <CornerUpLeft className={cls} />;
}

// A faint doodle-dot texture over the classic WhatsApp wallpaper beige, so the
// panel reads as a chat screen and not just a coloured box. Kept inline (data
// URI) to stay self-contained.
const WALLPAPER = "radial-gradient(rgba(0,0,0,0.035) 1px, transparent 1px)";

/**
 * Renders a template body the way it lands in WhatsApp: an outgoing (clinic)
 * bubble on a chat-wallpaper background, with a tail, an optional footer, and a
 * timestamp + blue read-ticks. Reused by the create form (live), the templates
 * list, and the send flows so admins can judge a message before it ships.
 */
export default function WhatsappPreview({
  headerText,
  bodyText,
  variables = [],
  footerText,
  buttons = [],
  time = "10:30",
  className = "",
}: WhatsappPreviewProps) {
  const rendered = bodyText.trim() ? fillTemplate(bodyText, variables) : "";
  const header = headerText?.trim() ? fillTemplate(headerText, variables) : "";
  const activeButtons = buttons.filter((b) => b.text.trim());
  // Show the card whenever there's anything to render, not just body text.
  const hasContent = !!(rendered || header || activeButtons.length > 0);

  return (
    <div
      dir="rtl"
      className={[
        "overflow-hidden rounded-2xl border border-border",
        "bg-[#ECE5DD] dark:bg-[#0B141A]",
        className,
      ].join(" ")}
      style={{ backgroundImage: WALLPAPER, backgroundSize: "20px 20px" }}
    >
      <div className="flex min-h-[120px] flex-col justify-center p-4">
        {hasContent ? (
          <div className="relative w-full max-w-[85%] self-end">
            {/* Tail at the top-start corner of the outgoing bubble */}
            <span
              className="absolute -start-1.5 top-0 z-10 h-3 w-3 bg-[#D9FDD3] dark:bg-[#005C4B]"
              style={{ clipPath: "polygon(0 0, 100% 0, 100% 100%)" }}
              aria-hidden
            />
            <div className="relative overflow-hidden rounded-2xl rounded-ss-sm bg-[#D9FDD3] shadow-sm dark:bg-[#005C4B]">
              <div className="px-3 py-2">
                {header && (
                  <p className="mb-1 whitespace-pre-wrap break-words text-sm font-bold text-[#111B21] dark:text-[#E9EDEF]">
                    {header}
                  </p>
                )}
                {rendered && (
                  <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-[#111B21] dark:text-[#E9EDEF]">
                    {rendered}
                  </p>
                )}
                {footerText?.trim() && (
                  <p className="mt-1.5 whitespace-pre-wrap break-words text-[11px] text-[#111B21]/50 dark:text-[#E9EDEF]/50">
                    {footerText}
                  </p>
                )}
                <span className="mt-1 flex items-center justify-end gap-1 text-[10px] text-[#111B21]/45 dark:text-[#E9EDEF]/50">
                  {time}
                  <CheckCheck className="h-3.5 w-3.5 text-sky-500" />
                </span>
              </div>

              {activeButtons.length > 0 && (
                <div className="border-t border-black/10 dark:border-white/10">
                  {activeButtons.map((b, i) => (
                    <div
                      key={i}
                      className={[
                        "flex items-center justify-center gap-1.5 py-2 text-sm font-medium text-sky-600 dark:text-sky-300",
                        i > 0 ? "border-t border-black/10 dark:border-white/10" : "",
                      ].join(" ")}
                    >
                      <ButtonIcon type={b.type} />
                      <span className="truncate">{b.text}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : (
          <p className="text-center text-xs text-[#111B21]/40 dark:text-[#E9EDEF]/40">
            ابدأ الكتابة لمعاينة الرسالة
          </p>
        )}
      </div>
    </div>
  );
}
