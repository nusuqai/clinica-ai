"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";

const requiredReason = z.object({
  reason: z.string().trim().min(1, "أدخل سبب الإلغاء."),
});
const optionalReason = z.object({ reason: z.string().trim() });

/**
 * The body of a "cancel appointment" dialog: a reason textarea plus confirm /
 * back buttons. Its own small form, so typing never re-renders the page behind it.
 */
export function CancelReasonForm({
  prompt,
  required,
  pending = false,
  onConfirm,
  onBack,
}: {
  prompt: string;
  /** The admin board requires a reason; the doctor's cancel makes it optional. */
  required: boolean;
  pending?: boolean;
  /** Called with the trimmed reason ("" when optional and left blank). */
  onConfirm: (reason: string) => void;
  onBack: () => void;
}) {
  const form = useForm<{ reason: string }>({
    resolver: zodResolver(required ? requiredReason : optionalReason),
    defaultValues: { reason: "" },
  });

  return (
    <form
      onSubmit={form.handleSubmit(({ reason }) => onConfirm(reason))}
      noValidate
      className="space-y-4"
    >
      <p className="font-sans text-sm text-muted-foreground">{prompt}</p>
      <FormField
        control={form.control}
        name="reason"
        type="textarea"
        label={required ? "سبب الإلغاء" : "سبب الإلغاء (اختياري)"}
        rows={3}
        placeholder="أدخل سبب الإلغاء..."
        autoFocus
      />
      <div className="flex gap-3">
        <Button type="submit" variant="destructive" loading={pending} className="flex-1">
          {pending ? "جارٍ الإلغاء..." : "تأكيد الإلغاء"}
        </Button>
        <Button type="button" variant="outline" onClick={onBack}>
          تراجع
        </Button>
      </div>
    </form>
  );
}
