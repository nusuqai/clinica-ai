"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { CheckCircle2, Copy, KeyRound, Loader2, MessageCircle, Unlink } from "lucide-react";
import {
  createMyLinkCodeAction,
  getMyWhatsappStateAction,
  unlinkMyWhatsappAction,
  type MyWhatsappState,
} from "@/server/actions/staff-assistant";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useConfirm } from "@/components/ui/confirm-dialog";

/** How often the card checks whether the code arrived on WhatsApp. */
const POLL_MS = 4000;

const BLOCK_TEXT = {
  clinic_off: "مساعد الفريق متوقف حالياً في العيادة — ستصلك التنبيهات فقط.",
  member_off:
    "لم يفعّل مدير العيادة مساعد الفريق لحسابك بعد — ستصلك التنبيهات فقط إلى أن يفعّله لك.",
} as const;

/**
 * Team assistant (#89) — a member links their own WhatsApp by sending a
 * one-time code from it to the clinic's number. Works the same on official and
 * WhatsApp Web numbers, and on hidden numbers.
 */
export default function MyWhatsappCard({ initial }: { initial: MyWhatsappState }) {
  const [state, setState] = useState(initial);
  const [busy, setBusy] = useState(false);
  const confirm = useConfirm();

  const refresh = useCallback(async () => {
    const next = await getMyWhatsappStateAction();
    if (next) setState(next);
    return next;
  }, []);

  // While a code is waiting, watch for the WhatsApp message that verifies it.
  const waiting = !!state.pendingCode;
  useEffect(() => {
    if (!waiting) return;
    const wasLinkedAt = state.verifiedAt;
    const t = setInterval(async () => {
      const next = await refresh();
      if (next?.verifiedAt && next.verifiedAt !== wasLinkedAt) {
        toast.success("تم ربط رقمك بنجاح");
      }
    }, POLL_MS);
    return () => clearInterval(t);
  }, [waiting, refresh, state.verifiedAt]);

  async function generate() {
    setBusy(true);
    const res = await createMyLinkCodeAction();
    setBusy(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    setState((s) => ({ ...s, pendingCode: { code: res.code, expiresAt: res.expiresAt } }));
  }

  async function unlink() {
    await confirm({
      description: "إلغاء ربط رقم واتساب الخاص بك؟",
      warning: "لن تصلك التنبيهات ولن تستطيع استخدام المساعد من واتساب حتى تربطه من جديد.",
      confirmText: "إلغاء الربط",
      onConfirm: async () => {
        const res = await unlinkMyWhatsappAction();
        if (!res.ok) return { error: res.error };
        await refresh();
      },
    });
  }

  const code = state.pendingCode?.code ?? null;
  const expires = state.pendingCode
    ? new Date(state.pendingCode.expiresAt).toLocaleTimeString("ar-EG", {
        hour: "2-digit",
        minute: "2-digit",
      })
    : null;

  return (
    <div className="space-y-4">
      <Card className="space-y-3 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <MessageCircle className="h-5 w-5 text-primary" />
            <h2 className="font-heading text-base font-semibold">رقم واتساب الخاص بي</h2>
          </div>
          {state.linked ? (
            <Badge variant="success">
              <CheckCircle2 className="h-3.5 w-3.5" /> مربوط
            </Badge>
          ) : (
            <Badge variant="muted">غير مربوط</Badge>
          )}
        </div>

        {state.linked ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm">
              الرقم المربوط:{" "}
              <span className="font-semibold" dir="ltr">
                {state.phone}
              </span>
            </p>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={generate} disabled={busy}>
                <KeyRound className="h-4 w-4" /> ربط رقم آخر
              </Button>
              <Button variant="outline" size="sm" onClick={unlink}>
                <Unlink className="h-4 w-4" /> إلغاء الربط
              </Button>
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            اربط رقمك لتدير العيادة بالمحادثة من واتساب، ولتصلك تنبيهات العيادة (التصعيدات، الحجوزات
            الجديدة…) التي يحددها لك مدير العيادة.
          </p>
        )}

        {state.assistantBlock && (
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
            {BLOCK_TEXT[state.assistantBlock]}
          </p>
        )}
      </Card>

      {(!state.linked || code) && (
        <Card className="space-y-4 p-5">
          <h3 className="font-heading text-sm font-semibold">
            {state.linked ? "ربط رقم آخر" : "طريقة الربط"}
          </h3>
          {state.clinicNumbers.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              لا يوجد رقم واتساب مربوط للعيادة بعد. اطلب من مدير العيادة ربط رقم أولاً.
            </p>
          ) : !code ? (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                أنشئ رمز ربط، ثم أرسله من رقم واتساب الخاص بك إلى رقم العيادة. سنتعرّف على رقمك
                تلقائياً من الرسالة.
              </p>
              <Button onClick={generate} disabled={busy}>
                {busy ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <KeyRound className="h-4 w-4" />
                )}
                إنشاء رمز الربط
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              <ol className="list-decimal space-y-1 pe-4 text-sm text-muted-foreground">
                <li>من هاتفك، افتح محادثة مع رقم العيادة (أو اضغط أحد الأزرار بالأسفل).</li>
                <li>أرسل الرمز التالي كما هو في رسالة واحدة.</li>
                <li>ستصلك رسالة تأكيد على واتساب وتتحدّث هذه الصفحة تلقائياً.</li>
              </ol>
              <div className="flex flex-wrap items-center gap-3">
                <span
                  className="rounded-lg border border-dashed border-primary px-4 py-2 font-mono text-lg font-bold tracking-wider text-primary"
                  dir="rtl"
                >
                  {code}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    navigator.clipboard.writeText(code).then(() => toast.success("تم نسخ الرمز"));
                  }}
                >
                  <Copy className="h-4 w-4" /> نسخ
                </Button>
                <span className="text-xs text-muted-foreground">صالح حتى {expires}</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {state.clinicNumbers.map((n) => (
                  <Button key={n.phone} variant="secondary" size="sm" asChild>
                    <a
                      href={`https://wa.me/${n.phone}?text=${encodeURIComponent(code)}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <MessageCircle className="h-4 w-4" /> إرسال إلى {n.label}{" "}
                      <span dir="ltr">({n.phone})</span>
                    </a>
                  </Button>
                ))}
              </div>
              <p className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> بانتظار وصول الرمز…
              </p>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
