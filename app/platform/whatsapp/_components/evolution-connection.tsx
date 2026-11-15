"use client";

import { useCallback, useEffect, useState } from "react";
import { History, QrCode, RefreshCw, Smartphone, Unlink, TriangleAlert } from "lucide-react";
import {
  disconnectClinicWhatsappAction,
  getClinicEvolutionStatusAction,
  startClinicEvolutionAction,
  syncClinicEvolutionHistoryAction,
} from "@/server/actions/platformWhatsapp";
import type { EvolutionStatus } from "@/lib/evolution/config";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/** How often to refresh the QR / link state while a phone is being linked. */
const POLL_MS = 4000;

interface Props {
  clinicId: string;
  /** The clinic already has an Evolution config row (linked or mid-linking). */
  configured: boolean;
}

/**
 * Unofficial WhatsApp (WhatsApp Web through Evolution API): link the clinic's
 * phone by scanning a QR — or entering a pairing code — from WhatsApp → Linked
 * devices. No Meta app, no templates, no 24-hour window.
 */
export default function EvolutionConnection({ clinicId, configured: initialConfigured }: Props) {
  const [configured, setConfigured] = useState(initialConfigured);
  const [status, setStatus] = useState<EvolutionStatus | null>(null);
  const [pairingCode, setPairingCode] = useState<string | null>(null);
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const refresh = useCallback(async () => {
    const res = await getClinicEvolutionStatusAction({ clinicId });
    if (res.ok) {
      setStatus(res.status);
      if (res.status.state === "open") setPairingCode(null);
    } else if (res.reason === "not_configured") {
      setConfigured(false);
      setStatus(null);
    } else {
      setMessage({ ok: false, text: res.message ?? "تعذّر قراءة حالة الاتصال." });
    }
  }, [clinicId]);

  // Poll while linking; once linked, one read is enough.
  useEffect(() => {
    if (!configured) return;
    void refresh();
    if (status?.state === "open") return;
    const t = setInterval(() => void refresh(), POLL_MS);
    return () => clearInterval(t);
  }, [configured, refresh, status?.state]);

  const start = async () => {
    setBusy(true);
    setMessage(null);
    const res = await startClinicEvolutionAction({ clinicId, phone: phone || undefined });
    setBusy(false);
    if (!res.ok) {
      setMessage({ ok: false, text: res.message ?? "تعذّر بدء الربط." });
      return;
    }
    setConfigured(true);
    setPairingCode(res.pairingCode);
    setStatus({ state: "connecting", qrDataUrl: res.qrDataUrl, phone: null, profileName: null });
  };

  const confirm = useConfirm();
  const disconnect = async () => {
    setMessage(null);
    const done = await confirm({
      title: "فصل واتساب ويب",
      description: "تسجيل خروج الهاتف المربوط وحذف الاتصال من هذه العيادة؟",
      warning:
        "ستتوقف العيادة عن استقبال وإرسال رسائل واتساب فورًا. المحادثات السابقة تبقى كما هي.",
      confirmText: "فصل الرقم",
      onConfirm: async () => {
        const res = await disconnectClinicWhatsappAction({ clinicId });
        return res.ok ? res : { error: res.error };
      },
    });
    if (!done) return;
    setConfigured(false);
    setStatus(null);
    setPairingCode(null);
    setMessage({ ok: true, text: "تم فصل الرقم." });
  };

  const [syncing, setSyncing] = useState(false);
  const syncHistory = async () => {
    setSyncing(true);
    setMessage(null);
    const res = await syncClinicEvolutionHistoryAction({ clinicId });
    setSyncing(false);
    setMessage(
      res.ok
        ? {
            ok: true,
            text: "بدأت مزامنة محادثات آخر 90 يوماً في الخلفية — ستظهر في صندوق الرسائل خلال دقائق.",
          }
        : { ok: false, text: res.message ?? "تعذّر بدء المزامنة." }
    );
  };

  const linked = status?.state === "open";

  return (
    <div>
      <h2 className="mb-3 flex items-center gap-2 font-sans text-sm font-semibold text-foreground">
        <QrCode className="h-4 w-4 text-accent" />
        واتساب ويب (Evolution API — غير رسمي)
      </h2>
      <Card className="space-y-4 p-5">
        <p className="flex gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs leading-relaxed text-amber-700 dark:text-amber-400">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
          اتصال غير رسمي عبر واتساب ويب: لا يحتاج حساب ميتا ولا قوالب، ويمكن المراسلة في أي وقت، لكن
          واتساب قد يحظر الرقم عند الإرسال الآلي الكثيف. استخدم رقمًا مخصصًا للعيادة.
        </p>

        {configured && status && (
          <div className="flex items-center gap-2 text-sm">
            <span
              className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                linked ? "bg-emerald-500/10 text-emerald-600" : "bg-amber-500/10 text-amber-600"
              }`}
            >
              {linked ? "مربوط" : status.state === "connecting" ? "بانتظار المسح" : "غير متصل"}
            </span>
            {linked && (
              <span className="text-muted-foreground" dir="ltr">
                {status.phone ? `+${status.phone}` : ""}
                {status.profileName ? ` · ${status.profileName}` : ""}
              </span>
            )}
          </div>
        )}

        {configured && !linked && (status?.qrDataUrl || pairingCode) && (
          <div className="space-y-3">
            <p className="font-sans text-xs text-muted-foreground">
              على هاتف العيادة: واتساب ← الأجهزة المرتبطة ← ربط جهاز، ثم امسح الرمز.
              {pairingCode && " أو اختر «الربط برقم الهاتف بدلًا من ذلك» وأدخل الكود."}
            </p>
            <div className="flex flex-wrap items-center gap-6">
              {status?.qrDataUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={status.qrDataUrl}
                  alt="WhatsApp QR"
                  className="h-56 w-56 rounded-lg border border-border bg-white p-2"
                />
              )}
              {pairingCode && (
                <div>
                  <p className="font-sans text-xs text-muted-foreground">كود الربط</p>
                  <p className="font-mono text-2xl font-bold tracking-widest" dir="ltr">
                    {pairingCode.length === 8
                      ? `${pairingCode.slice(0, 4)}-${pairingCode.slice(4)}`
                      : pairingCode}
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {!linked && (
          <div className="space-y-2">
            <Label className="text-xs font-normal text-muted-foreground">
              رقم هاتف العيادة (اختياري — للحصول على كود ربط بدل رمز QR)
            </Label>
            <Input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="مثال: 201001234567"
              dir="ltr"
              inputMode="tel"
              className="max-w-xs"
            />
          </div>
        )}

        {message && (
          <p className={`text-xs ${message.ok ? "text-green-600" : "text-red-600"}`}>
            {message.text}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-2">
          {!linked && (
            <Button type="button" onClick={start} loading={busy}>
              {!busy && (configured ? <RefreshCw /> : <Smartphone />)}
              {configured ? "إعادة توليد الرمز" : "ابدأ الربط"}
            </Button>
          )}
          {linked && (
            <Button
              type="button"
              variant="outline"
              onClick={syncHistory}
              loading={syncing}
              disabled={busy}
            >
              {!syncing && <History />}
              مزامنة المحادثات (آخر 90 يوماً)
            </Button>
          )}
          {configured && (
            <Button
              type="button"
              variant="outline"
              onClick={disconnect}
              disabled={busy}
              className="text-red-600 hover:bg-red-50 hover:text-red-700 dark:hover:bg-red-950/30"
            >
              <Unlink />
              فصل الرقم
            </Button>
          )}
        </div>
      </Card>
    </div>
  );
}
