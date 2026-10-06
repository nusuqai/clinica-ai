"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Save, KeyRound, Copy, Check } from "lucide-react";
import { saveClinicWhatsappConfigAction } from "@/server/actions/platformWhatsapp";
import type { WhatsappConfigStatus } from "@/lib/meta/whatsapp-config";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import {
  whatsappConnectionSchema,
  type WhatsappConnectionValues,
} from "@/lib/validations/platform";

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
  const [hasToken, setHasToken] = useState(!!initialConfig?.hasToken);
  const form = useForm<WhatsappConnectionValues>({
    resolver: zodResolver(whatsappConnectionSchema(hasToken)),
    defaultValues: {
      phoneNumberId: initialConfig?.phoneNumberId ?? "",
      wabaId: initialConfig?.wabaId ?? "",
      accessToken: "",
    },
    mode: "onTouched",
  });
  const { control } = form;
  const saving = form.formState.isSubmitting;
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

  const handleSave = form.handleSubmit(async ({ phoneNumberId, wabaId, accessToken }) => {
    setMessage(null);
    const res = await saveClinicWhatsappConfigAction({
      clinicId,
      phoneNumberId,
      wabaId,
      accessToken: accessToken || undefined,
    });
    if (res.ok) {
      form.reset({ phoneNumberId, wabaId, accessToken: "" });
      if (accessToken) setHasToken(true);
      setTokens({ webhookToken: res.webhookToken, verifyToken: res.verifyToken });
      setMessage({ ok: true, text: "تم حفظ الإعدادات بنجاح." });
    } else {
      setMessage({
        ok: false,
        text: ("message" in res && res.message) || "تعذّر حفظ الإعدادات.",
      });
    }
  });

  const webhookUrl = tokens ? `${appUrl}/api/meta/whatsapp/webhook/${tokens.webhookToken}` : "";

  return (
    <div>
      <h2 className="mb-3 flex items-center gap-2 font-sans text-sm font-semibold text-foreground">
        <KeyRound className="h-4 w-4 text-accent" />
        بيانات الاتصال (Meta Cloud API)
      </h2>
      <Card className="space-y-4 p-5">
        <form onSubmit={handleSave} noValidate className="space-y-4">
          <FormField
            control={control}
            name="phoneNumberId"
            label="Phone Number ID"
            labelClassName={smallLabel}
            placeholder="مثال: 1286383577882071"
            dir="ltr"
          />
          <FormField
            control={control}
            name="wabaId"
            label="WhatsApp Business Account ID (WABA)"
            labelClassName={smallLabel}
            placeholder="مثال: 2292332154910536"
            dir="ltr"
          />
          <FormField
            control={control}
            name="accessToken"
            type="password"
            label={
              <>
                Access Token (System User)
                {hasToken && (
                  <span className="text-green-600"> — تم حفظ رمز، اتركه فارغًا للإبقاء عليه</span>
                )}
              </>
            }
            labelClassName={smallLabel}
            placeholder={hasToken ? "••••••••••••" : "الصق الرمز هنا"}
          />

          {message && (
            <p className={`text-xs ${message.ok ? "text-green-600" : "text-red-600"}`}>
              {message.text}
            </p>
          )}

          <Button type="submit" loading={saving}>
            {!saving && <Save />}
            حفظ
          </Button>
        </form>

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
