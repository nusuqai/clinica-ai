"use client";

import { useState } from "react";
import { Loader2, Save, KeyRound, Copy, Check } from "lucide-react";
import { saveWhatsappConfigAction } from "@/server/actions/whatsapp";
import type { WhatsappConfigStatus } from "@/lib/meta/whatsapp-config";
import { Field } from "./field";

interface Props {
  initialConfig: WhatsappConfigStatus | null;
  /** Public base URL, used to build the clinic's unique webhook URL. */
  appUrl: string;
}

/**
 * Per-clinic Meta Cloud API connection settings: phone number id, WABA id, and
 * the encrypted access token — plus the read-only webhook Callback URL + Verify
 * Token the clinic pastes back into Meta.
 */
export default function ConnectionConfig({ initialConfig, appUrl }: Props) {
  const [phoneNumberId, setPhoneNumberId] = useState(
    initialConfig?.phoneNumberId ?? "",
  );
  const [wabaId, setWabaId] = useState(initialConfig?.wabaId ?? "");
  const [accessToken, setAccessToken] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(
    null,
  );
  // The webhook + verify tokens the clinic must paste into Meta. Known once the
  // config exists (either loaded, or returned by the first save).
  const [tokens, setTokens] = useState<{
    webhookToken: string;
    verifyToken: string;
  } | null>(
    initialConfig
      ? {
          webhookToken: initialConfig.webhookToken,
          verifyToken: initialConfig.verifyToken,
        }
      : null,
  );

  const handleSave = async () => {
    setSaving(true);
    setMessage(null);
    const res = await saveWhatsappConfigAction({
      phoneNumberId,
      wabaId,
      accessToken: accessToken || undefined,
    });
    setSaving(false);
    if (res.ok) {
      setAccessToken("");
      setTokens({ webhookToken: res.webhookToken, verifyToken: res.verifyToken });
      setMessage({ ok: true, text: "تم حفظ الإعدادات بنجاح." });
    } else {
      setMessage({
        ok: false,
        text: ("message" in res && res.message) || "تعذّر حفظ الإعدادات.",
      });
    }
  };

  const webhookUrl = tokens
    ? `${appUrl}/api/meta/whatsapp/webhook/${tokens.webhookToken}`
    : "";

  return (
    <div>
      <h2 className="text-sm font-semibold text-foreground font-sans mb-3 flex items-center gap-2">
        <KeyRound className="w-4 h-4 text-accent" />
        بيانات الاتصال (Meta Cloud API)
      </h2>
      <div className="bg-card border border-border rounded-2xl p-5 space-y-4">
        <Field
          label="Phone Number ID"
          value={phoneNumberId}
          onChange={setPhoneNumberId}
          placeholder="مثال: 1286383577882071"
        />
        <Field
          label="WhatsApp Business Account ID (WABA)"
          value={wabaId}
          onChange={setWabaId}
          placeholder="مثال: 2292332154910536"
        />
        <div>
          <label className="block text-xs text-muted-foreground mb-1 font-sans">
            Access Token (System User)
            {initialConfig?.hasToken && (
              <span className="text-green-600"> — تم حفظ رمز، اتركه فارغًا للإبقاء عليه</span>
            )}
          </label>
          <input
            type="password"
            value={accessToken}
            onChange={(e) => setAccessToken(e.target.value)}
            placeholder={initialConfig?.hasToken ? "••••••••••••" : "الصق الرمز هنا"}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-accent"
            dir="ltr"
          />
        </div>

        {message && (
          <p
            className={`text-xs ${message.ok ? "text-green-600" : "text-red-600"}`}
          >
            {message.text}
          </p>
        )}

        <button
          onClick={handleSave}
          disabled={saving || !phoneNumberId.trim() || !wabaId.trim()}
          className="inline-flex items-center gap-2 rounded-xl bg-primary text-white px-4 py-2 text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-40"
        >
          {saving ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Save className="w-4 h-4" />
          )}
          حفظ
        </button>

        {tokens && (
          <div className="mt-2 space-y-3 border-t border-border pt-4">
            <p className="text-xs text-muted-foreground font-sans">
              انسخ هذين القيمتين والصقهما في إعداد الويبهوك داخل تطبيق ميتا الخاص
              بالعيادة (اشترك في حقل <span dir="ltr">messages</span>). حافظ على
              سرية رابط الويبهوك.
            </p>
            <CopyRow label="Callback URL" value={webhookUrl} />
            <CopyRow label="Verify Token" value={tokens.verifyToken} />
          </div>
        )}
      </div>
    </div>
  );
}

function CopyRow({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked — the value is still selectable in the field */
    }
  };
  return (
    <div>
      <label className="block text-xs text-muted-foreground mb-1 font-sans">
        {label}
      </label>
      <div className="flex items-stretch gap-2">
        <input
          readOnly
          value={value}
          onFocus={(e) => e.currentTarget.select()}
          className="flex-1 rounded-lg border border-border bg-muted px-3 py-2 text-xs focus:outline-none"
          dir="ltr"
        />
        <button
          onClick={copy}
          className="flex-shrink-0 inline-flex items-center gap-1 rounded-lg border border-border px-2.5 text-xs text-muted-foreground hover:bg-muted"
        >
          {copied ? <Check className="w-3.5 h-3.5 text-green-600" /> : <Copy className="w-3.5 h-3.5" />}
          {copied ? "تم" : "نسخ"}
        </button>
      </div>
    </div>
  );
}
