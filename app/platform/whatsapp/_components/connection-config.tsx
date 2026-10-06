"use client";

import { useState } from "react";
import { Save, KeyRound, Copy, Check } from "lucide-react";
import { saveClinicWhatsappConfigAction } from "@/server/actions/platformWhatsapp";
import type { WhatsappConfigStatus } from "@/lib/meta/whatsapp-config";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";

/** Compact muted label used across the WhatsApp console forms. */
const smallLabel = "text-xs font-normal text-muted-foreground";

interface Props {
  /** The clinic being configured — named explicitly, since the console runs on
      the root domain where there is no tenant to infer from the host. */
  clinicId: string;
  initialConfig: WhatsappConfigStatus | null;
  /** Public base URL, used to build the clinic's unique webhook URL. */
  appUrl: string;
}

/**
 * Per-clinic Meta Cloud API connection settings: phone number id, WABA id, and
 * the encrypted access token — plus the read-only webhook Callback URL + Verify
 * Token the clinic pastes back into Meta.
 */
export default function ConnectionConfig({ clinicId, initialConfig, appUrl }: Props) {
  const [phoneNumberId, setPhoneNumberId] = useState(initialConfig?.phoneNumberId ?? "");
  const [wabaId, setWabaId] = useState(initialConfig?.wabaId ?? "");
  const [accessToken, setAccessToken] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
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
      : null
  );

  const handleSave = async () => {
    setSaving(true);
    setMessage(null);
    const res = await saveClinicWhatsappConfigAction({
      clinicId,
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

  const webhookUrl = tokens ? `${appUrl}/api/meta/whatsapp/webhook/${tokens.webhookToken}` : "";

  return (
    <div>
      <h2 className="mb-3 flex items-center gap-2 font-sans text-sm font-semibold text-foreground">
        <KeyRound className="h-4 w-4 text-accent" />
        بيانات الاتصال (Meta Cloud API)
      </h2>
      <Card className="space-y-4 p-5">
        <FormField
          label="Phone Number ID"
          labelClassName={smallLabel}
          value={phoneNumberId}
          onValueChange={setPhoneNumberId}
          placeholder="مثال: 1286383577882071"
          dir="ltr"
        />
        <FormField
          label="WhatsApp Business Account ID (WABA)"
          labelClassName={smallLabel}
          value={wabaId}
          onValueChange={setWabaId}
          placeholder="مثال: 2292332154910536"
          dir="ltr"
        />
        <FormField
          type="password"
          label={
            <>
              Access Token (System User)
              {initialConfig?.hasToken && (
                <span className="text-green-600"> — تم حفظ رمز، اتركه فارغًا للإبقاء عليه</span>
              )}
            </>
          }
          labelClassName={smallLabel}
          value={accessToken}
          onValueChange={setAccessToken}
          placeholder={initialConfig?.hasToken ? "••••••••••••" : "الصق الرمز هنا"}
        />

        {message && (
          <p className={`text-xs ${message.ok ? "text-green-600" : "text-red-600"}`}>
            {message.text}
          </p>
        )}

        <Button
          onClick={handleSave}
          loading={saving}
          disabled={!phoneNumberId.trim() || !wabaId.trim()}
        >
          {!saving && <Save />}
          حفظ
        </Button>

        {tokens && (
          <div className="mt-2 space-y-3 border-t border-border pt-4">
            <p className="font-sans text-xs text-muted-foreground">
              انسخ هذين القيمتين والصقهما في إعداد الويبهوك داخل تطبيق ميتا الخاص بالعيادة (اشترك في
              حقل <span dir="ltr">messages</span>). حافظ على سرية رابط الويبهوك.
            </p>
            <CopyRow label="Callback URL" value={webhookUrl} />
            <CopyRow label="Verify Token" value={tokens.verifyToken} />
          </div>
        )}
      </Card>
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
      <Label className={`mb-1 block ${smallLabel}`}>{label}</Label>
      <div className="flex items-stretch gap-2">
        <Input
          readOnly
          value={value}
          onFocus={(e) => e.currentTarget.select()}
          className="flex-1 bg-muted text-xs"
          dir="ltr"
        />
        <Button
          variant="outline"
          size="sm"
          onClick={copy}
          className="h-10 shrink-0 text-muted-foreground [&_svg]:size-3.5"
        >
          {copied ? <Check className="text-green-600" /> : <Copy />}
          {copied ? "تم" : "نسخ"}
        </Button>
      </div>
    </div>
  );
}
