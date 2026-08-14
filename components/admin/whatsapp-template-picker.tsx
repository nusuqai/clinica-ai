"use client";

import { useEffect, useState } from "react";
import { Loader2, X, Send, FileText, AlertTriangle } from "lucide-react";
import { listTemplatesAction } from "@/server/actions/whatsapp";
import { sendWhatsappTemplate } from "@/server/actions/messages";
import type { MessageTemplate } from "@/lib/meta/whatsapp";
import { fillTemplate } from "@/lib/meta/template-render";
import WhatsappPreview from "@/components/admin/whatsapp/whatsapp-preview";

interface TemplatePickerProps {
  conversationId: string;
  onClose: () => void;
  /** Called after a template is sent + persisted, so the inbox can append it. */
  onSent: (msg: { messageId: string; createdAt: string; content: string }) => void;
}

/**
 * Modal for sending an approved WhatsApp template into a conversation — the
 * only way to reach a contact once the 24-hour window has closed.
 */
export default function WhatsappTemplatePicker({
  conversationId,
  onClose,
  onSent,
}: TemplatePickerProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [templates, setTemplates] = useState<MessageTemplate[]>([]);
  const [selected, setSelected] = useState<MessageTemplate | null>(null);
  const [variables, setVariables] = useState<string[]>([]);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await listTemplatesAction();
      if (cancelled) return;
      if (!res.ok) {
        setError(
          res.reason === "not_configured"
            ? "لم يتم إعداد واتساب لهذه العيادة بعد."
            : "message" in res && res.message
              ? res.message
              : "تعذّر تحميل القوالب.",
        );
        setLoading(false);
        return;
      }
      // Only APPROVED templates can actually be sent.
      setTemplates(res.templates.filter((t) => t.status === "APPROVED"));
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const selectTemplate = (t: MessageTemplate) => {
    setSelected(t);
    setVariables(Array.from({ length: t.variableCount }, () => ""));
    setError(null);
  };

  const rendered = selected ? fillTemplate(selected.bodyText, variables) : "";
  const allFilled =
    !selected || variables.every((v) => v.trim().length > 0);

  const handleSend = async () => {
    if (!selected || !allFilled || sending) return;
    setSending(true);
    setError(null);
    const res = await sendWhatsappTemplate(conversationId, {
      name: selected.name,
      language: selected.language,
      variables,
      renderedText: rendered,
    });
    setSending(false);
    if (!res.ok) {
      setError(
        res.reason === "not_configured"
          ? "لم يتم إعداد واتساب لهذه العيادة."
          : res.reason === "send_failed"
            ? "فشل إرسال القالب عبر واتساب."
            : "تعذّر إرسال القالب.",
      );
      return;
    }
    onSent({ messageId: res.messageId, createdAt: res.createdAt, content: rendered });
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg max-h-[85vh] overflow-hidden flex flex-col rounded-2xl bg-card border border-border shadow-xl"
        onClick={(e) => e.stopPropagation()}
        dir="rtl"
      >
        <div className="flex items-center justify-between px-5 py-3 border-b border-border">
          <h3 className="font-heading font-semibold text-sm text-foreground flex items-center gap-2">
            <FileText className="w-4 h-4 text-accent" />
            إرسال قالب معتمد
          </h3>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground"
            aria-label="إغلاق"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-10 text-muted-foreground text-sm">
              <Loader2 className="w-4 h-4 animate-spin" />
              جارٍ تحميل القوالب...
            </div>
          ) : error && templates.length === 0 ? (
            <div className="flex items-start gap-2 rounded-xl bg-amber-50 border border-amber-200 px-3.5 py-2.5 text-xs text-amber-700">
              <AlertTriangle className="w-4 h-4 flex-shrink-0" />
              <span>{error}</span>
            </div>
          ) : templates.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground py-8">
              لا توجد قوالب معتمدة بعد. أنشئ قالبًا من صفحة إعدادات واتساب.
            </p>
          ) : (
            <>
              {/* Template list */}
              <div className="space-y-2">
                {templates.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => selectTemplate(t)}
                    className={[
                      "w-full text-start rounded-xl border px-3.5 py-2.5 transition-colors",
                      selected?.id === t.id
                        ? "border-accent bg-accent/8"
                        : "border-border hover:bg-muted/50",
                    ].join(" ")}
                  >
                    <div className="flex items-center justify-between mb-0.5">
                      <span className="text-sm font-medium text-foreground">
                        {t.name}
                      </span>
                      <span className="text-[10px] text-muted-foreground uppercase">
                        {t.category} · {t.language}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground line-clamp-2">
                      {t.bodyText}
                    </p>
                  </button>
                ))}
              </div>

              {/* Variable inputs + preview */}
              {selected && (
                <div className="space-y-3 border-t border-border pt-4">
                  {variables.map((v, i) => (
                    <div key={i}>
                      <label className="block text-xs text-muted-foreground mb-1">
                        القيمة {i + 1} ({`{{${i + 1}}}`})
                      </label>
                      <input
                        value={v}
                        onChange={(e) =>
                          setVariables((prev) =>
                            prev.map((x, j) => (j === i ? e.target.value : x)),
                          )
                        }
                        className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-accent"
                      />
                    </div>
                  ))}
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">معاينة</p>
                    <WhatsappPreview
                      headerText={selected.headerText}
                      bodyText={selected.bodyText}
                      variables={variables}
                      footerText={selected.footerText}
                      buttons={selected.buttons}
                    />
                  </div>
                  {error && (
                    <p className="text-xs text-red-600 flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3" />
                      {error}
                    </p>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        {selected && (
          <div className="px-5 py-3 border-t border-border">
            <button
              onClick={handleSend}
              disabled={!allFilled || sending}
              className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-primary text-white py-2.5 text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-40"
            >
              {sending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
              إرسال القالب
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
