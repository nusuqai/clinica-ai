"use client";

import { useEffect, useState } from "react";
import { Loader2, X, Send, FileText, AlertTriangle } from "lucide-react";
import { listTemplatesAction } from "@/server/actions/whatsapp";
import { sendWhatsappTemplate } from "@/server/actions/messages";
import type { MessageTemplate } from "@/lib/meta/whatsapp";
import { fillTemplate } from "@/lib/meta/template-render";
import WhatsappPreview from "@/components/admin/whatsapp/whatsapp-preview";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";

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
            ? "لم يتم إعداد واتساب لهذه العيادة بعد. تواصل مع إدارة المنصّة."
            : "message" in res && res.message
              ? res.message
              : "تعذّر تحميل القوالب."
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
  const allFilled = !selected || variables.every((v) => v.trim().length > 0);

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
            : "تعذّر إرسال القالب."
      );
      return;
    }
    onSent({ messageId: res.messageId, createdAt: res.createdAt, content: rendered });
    onClose();
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        showCloseButton={false}
        aria-describedby={undefined}
        className="flex max-h-[85vh] w-[calc(100%-2rem)] max-w-lg flex-col gap-0 overflow-hidden rounded-2xl border-border bg-card p-0 shadow-xl"
        dir="rtl"
      >
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <DialogTitle className="flex items-center gap-2 font-heading text-sm font-semibold leading-normal tracking-normal text-foreground">
            <FileText className="h-4 w-4 text-accent" />
            إرسال قالب معتمد
          </DialogTitle>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onClose}
            aria-label="إغلاق"
            className="[&_svg]:size-4"
          >
            <X />
          </Button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              جارٍ تحميل القوالب...
            </div>
          ) : error && templates.length === 0 ? (
            <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-xs text-amber-700">
              <AlertTriangle className="h-4 w-4 flex-shrink-0" />
              <span>{error}</span>
            </div>
          ) : templates.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              لا توجد قوالب معتمدة بعد. تواصل مع إدارة المنصّة لإنشاء القوالب واعتمادها من ميتا.
            </p>
          ) : (
            <>
              {/* Template list */}
              <div className="space-y-2">
                {templates.map((t) => (
                  <Button
                    key={t.id}
                    variant="outline"
                    onClick={() => selectTemplate(t)}
                    className={[
                      "block h-auto w-full whitespace-normal px-3.5 py-2.5 text-start font-normal",
                      selected?.id === t.id
                        ? "bg-accent/8 border-accent"
                        : "border-border hover:bg-muted/50",
                    ].join(" ")}
                  >
                    <div className="mb-0.5 flex items-center justify-between">
                      <span className="text-sm font-medium text-foreground">{t.name}</span>
                      <span className="text-[10px] uppercase text-muted-foreground">
                        {t.category} · {t.language}
                      </span>
                    </div>
                    <p className="line-clamp-2 text-xs text-muted-foreground">{t.bodyText}</p>
                  </Button>
                ))}
              </div>

              {/* Variable inputs + preview */}
              {selected && (
                <div className="space-y-3 border-t border-border pt-4">
                  {variables.map((v, i) => (
                    <FormField
                      key={i}
                      label={
                        <>
                          القيمة {i + 1} ({`{{${i + 1}}}`})
                        </>
                      }
                      labelClassName="text-xs font-normal text-muted-foreground"
                      value={v}
                      onValueChange={(next) =>
                        setVariables((prev) => prev.map((x, j) => (j === i ? next : x)))
                      }
                    />
                  ))}
                  <div>
                    <p className="mb-1 text-xs text-muted-foreground">معاينة</p>
                    <WhatsappPreview
                      headerText={selected.headerText}
                      bodyText={selected.bodyText}
                      variables={variables}
                      footerText={selected.footerText}
                      buttons={selected.buttons}
                    />
                  </div>
                  {error && (
                    <p className="flex items-center gap-1 text-xs text-red-600">
                      <AlertTriangle className="h-3 w-3" />
                      {error}
                    </p>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        {selected && (
          <div className="border-t border-border px-5 py-3">
            <Button onClick={handleSend} loading={sending} disabled={!allFilled} className="w-full">
              {!sending && <Send />}
              إرسال القالب
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
