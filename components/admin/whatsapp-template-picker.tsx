"use client";

import { useEffect, useId, useState } from "react";
import { useForm, useWatch, type Control } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2, X, Send, FileText, AlertTriangle } from "lucide-react";
import { listTemplatesAction } from "@/server/actions/whatsapp";
import { sendWhatsappTemplate } from "@/server/actions/messages";
import type { MessageTemplate } from "@/lib/meta/whatsapp";
import { fillTemplate } from "@/lib/meta/template-render";
import WhatsappPreview from "@/components/admin/whatsapp/whatsapp-preview";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Alert } from "@/components/ui/alert";

const variablesSchema = z.object({
  variables: z.array(z.string().trim().min(1, "أدخل قيمة هذا المتغيّر.")),
});
type VariablesValues = z.infer<typeof variablesSchema>;

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
  const formId = useId();
  const form = useForm<VariablesValues>({
    resolver: zodResolver(variablesSchema),
    defaultValues: { variables: [] },
    mode: "onTouched",
  });
  const sending = form.formState.isSubmitting;

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
    form.reset({ variables: Array.from({ length: t.variableCount }, () => "") });
    setError(null);
  };

  const handleSend = form.handleSubmit(async ({ variables }) => {
    if (!selected) return;
    setError(null);
    const rendered = fillTemplate(selected.bodyText, variables);
    const res = await sendWhatsappTemplate(conversationId, {
      name: selected.name,
      language: selected.language,
      variables,
      renderedText: rendered,
    });
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
  });

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
            <Alert variant="warning" className="px-3.5 py-2.5 text-xs">
              <AlertTriangle className="h-4 w-4 flex-shrink-0" />
              <span>{error}</span>
            </Alert>
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
                <form
                  id={formId}
                  onSubmit={handleSend}
                  noValidate
                  className="space-y-3 border-t border-border pt-4"
                >
                  {Array.from({ length: selected.variableCount }, (_, i) => (
                    <FormField
                      key={`${selected.name}-${i}`}
                      control={form.control}
                      name={`variables.${i}`}
                      label={
                        <>
                          القيمة {i + 1} ({`{{${i + 1}}}`})
                        </>
                      }
                      labelClassName="text-xs font-normal text-muted-foreground"
                    />
                  ))}
                  <div>
                    <p className="mb-1 text-xs text-muted-foreground">معاينة</p>
                    <LivePreview control={form.control} template={selected} />
                  </div>
                  {error && (
                    <p className="flex items-center gap-1 text-xs text-red-600">
                      <AlertTriangle className="h-3 w-3" />
                      {error}
                    </p>
                  )}
                </form>
              )}
            </>
          )}
        </div>

        {selected && (
          <div className="border-t border-border px-5 py-3">
            {/* In the footer, outside the scrolling body, so it targets the form by id. */}
            <Button type="submit" form={formId} loading={sending} className="w-full">
              {!sending && <Send />}
              إرسال القالب
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** The preview with the typed values; re-renders alone as they change. */
function LivePreview({
  control,
  template,
}: {
  control: Control<VariablesValues>;
  template: MessageTemplate;
}) {
  const variables = useWatch({ control, name: "variables" });
  return (
    <WhatsappPreview
      headerText={template.headerText}
      bodyText={template.bodyText}
      variables={variables}
      footerText={template.footerText}
      buttons={template.buttons}
    />
  );
}
