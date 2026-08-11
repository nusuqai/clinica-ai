"use client";

import { useState } from "react";
import { Loader2, Bot, AlertTriangle } from "lucide-react";
import { toggleClinicAiAction } from "@/server/actions/ai";

interface Props {
  initialEnabled: boolean;
  balance: number;
  lowBalance: boolean;
  sufficient: boolean;
}

const fmtUsd = (n: number) =>
  `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`;

/**
 * Clinic-admin control for the AI agent: a global on/off switch plus a read-only
 * view of the prepaid balance. Top-ups and the markup are platform-controlled,
 * so they are shown here but not editable.
 */
export default function AiSettingsForm({
  initialEnabled,
  balance,
  lowBalance,
  sufficient,
}: Props) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(
    null,
  );

  const toggle = async () => {
    const next = !enabled;
    setSaving(true);
    setMessage(null);
    // Optimistic; revert on failure.
    setEnabled(next);
    const res = await toggleClinicAiAction(next);
    setSaving(false);
    if (res.ok) {
      setMessage({
        ok: true,
        text: next ? "تم تفعيل المساعد الذكي." : "تم إيقاف المساعد الذكي.",
      });
    } else {
      setEnabled(!next);
      setMessage({ ok: false, text: "تعذّر تحديث الإعداد." });
    }
  };

  return (
    <div className="space-y-4">
      {!sufficient && (
        <div className="flex items-start gap-2 rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-600">
          <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <p>
            رصيد المساعد الذكي غير كافٍ — لن يرد المساعد على العملاء حتى تتم
            إضافة رصيد. سيتم تحويل رسائل العملاء إلى فريق العيادة.
          </p>
        </div>
      )}
      {sufficient && lowBalance && (
        <div className="flex items-start gap-2 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-600">
          <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <p>رصيد المساعد الذكي منخفض. يُنصح بالتواصل مع المنصة لإضافة رصيد.</p>
        </div>
      )}

      {/* Global toggle */}
      <div className="bg-card border border-border rounded-2xl p-5">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
              <Bot className="w-5 h-5" />
            </div>
            <div>
              <p className="font-semibold text-foreground font-sans">
                الرد الآلي بالمساعد الذكي
              </p>
              <p className="text-sm text-muted-foreground font-sans">
                عند التفعيل، يرد المساعد تلقائياً على جميع محادثات العملاء في
                العيادة.
              </p>
            </div>
          </div>
          <button
            role="switch"
            aria-checked={enabled}
            onClick={toggle}
            disabled={saving}
            className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors disabled:opacity-50 ${
              enabled ? "bg-primary" : "bg-muted"
            }`}
          >
            {saving ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin mx-auto text-white" />
            ) : (
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  enabled ? "-translate-x-6" : "-translate-x-1"
                }`}
              />
            )}
          </button>
        </div>
        {message && (
          <p
            className={`mt-3 text-xs ${message.ok ? "text-green-600" : "text-red-600"}`}
          >
            {message.text}
          </p>
        )}
      </div>

      {/* Balance (read-only) */}
      <div className="bg-card border border-border rounded-2xl p-5 space-y-3">
        <p className="text-sm font-semibold text-foreground font-sans">
          رصيد الاستخدام
        </p>
        <div className="flex items-end justify-between">
          <div>
            <p
              className={`text-3xl font-bold font-heading ${
                sufficient ? "text-foreground" : "text-red-600"
              }`}
              dir="ltr"
            >
              {fmtUsd(balance)}
            </p>
            <p className="text-xs text-muted-foreground font-sans mt-1">
              الرصيد المتاح للمساعد الذكي (بالدولار)
            </p>
          </div>
        </div>
        <p className="text-xs text-muted-foreground font-sans border-t border-border pt-3">
          تتم إدارة إضافة الرصيد ومضاعف التسعير من قِبل المنصة. للاستفسار أو
          إضافة رصيد، تواصل مع فريق المنصة.
        </p>
      </div>
    </div>
  );
}
