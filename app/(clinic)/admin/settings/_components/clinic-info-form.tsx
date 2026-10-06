"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, X } from "lucide-react";
import { updateClinicInfoAction } from "@/server/actions/admin";
import { PhoneType, SocialPlatform } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Label } from "@/components/ui/label";

export interface ClinicPhoneView {
  type: PhoneType;
  number: string;
  label: string | null;
  isPrimary: boolean;
}
export interface ClinicSocialView {
  platform: SocialPlatform;
  url: string;
}
export interface ClinicInfoView {
  name: string;
  description: string | null;
  phones: ClinicPhoneView[];
  socials: ClinicSocialView[];
}

const PHONE_TYPES: { value: PhoneType; label: string }[] = [
  { value: PhoneType.LANDLINE, label: "أرضي" },
  { value: PhoneType.MOBILE, label: "موبايل" },
  { value: PhoneType.WHATSAPP, label: "واتساب" },
];

const PLATFORMS: { value: SocialPlatform; label: string }[] = [
  { value: SocialPlatform.FACEBOOK, label: "فيسبوك" },
  { value: SocialPlatform.INSTAGRAM, label: "إنستجرام" },
  { value: SocialPlatform.X, label: "إكس (تويتر)" },
  { value: SocialPlatform.TIKTOK, label: "تيك توك" },
  { value: SocialPlatform.YOUTUBE, label: "يوتيوب" },
  { value: SocialPlatform.WEBSITE, label: "الموقع الإلكتروني" },
  { value: SocialPlatform.OTHER, label: "أخرى" },
];

const sectionLabel = "font-sans text-sm font-medium text-foreground";

export default function ClinicInfoForm({ info }: { info: ClinicInfoView }) {
  const router = useRouter();
  const [name, setName] = useState(info.name);
  const [description, setDescription] = useState(info.description ?? "");
  const [phones, setPhones] = useState<ClinicPhoneView[]>(info.phones.map((p) => ({ ...p })));
  const [socials, setSocials] = useState<ClinicSocialView[]>(info.socials.map((s) => ({ ...s })));
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [isPending, startTransition] = useTransition();

  function updatePhone(i: number, patch: Partial<ClinicPhoneView>) {
    setPhones((prev) => {
      const next = prev.map((p, idx) => (idx === i ? { ...p, ...patch } : p));
      if (patch.isPrimary) next.forEach((p, idx) => (p.isPrimary = idx === i));
      return next;
    });
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const res = await updateClinicInfoAction({
        name: name.trim() || undefined,
        description: description || null,
        phones: phones.filter((p) => p.number.trim()),
        socials: socials.filter((s) => s.url.trim()),
      });
      if (res?.error) setError(res.error);
      else {
        setSaved(true);
        router.refresh();
        setTimeout(() => setSaved(false), 3000);
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-3xl space-y-6">
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 font-sans text-sm text-red-700">
          {error}
        </div>
      )}
      {saved && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 font-sans text-sm text-emerald-700">
          تم حفظ التغييرات
        </div>
      )}

      <div className="space-y-4 rounded-2xl border border-border bg-card p-5">
        <FormField label="اسم العيادة" value={name} onValueChange={setName} />
        <FormField
          type="textarea"
          label="نبذة عن العيادة"
          value={description}
          onValueChange={setDescription}
          rows={4}
        />
      </div>

      {/* Phones */}
      <div className="space-y-3 rounded-2xl border border-border bg-card p-5">
        <div className="flex items-center justify-between">
          <Label className={sectionLabel}>أرقام الهواتف العامة</Label>
          <Button
            type="button"
            variant="link"
            size="sm"
            onClick={() =>
              setPhones((p) => [
                ...p,
                { type: PhoneType.MOBILE, number: "", label: null, isPrimary: p.length === 0 },
              ])
            }
            className="h-auto px-0 text-sm [&_svg]:size-3.5"
          >
            <Plus /> إضافة رقم
          </Button>
        </div>
        <p className="font-sans text-xs text-muted-foreground">
          الرقم المعلّم كـ«أساسي» هو الرقم الرئيسي للعيادة.
        </p>
        {phones.length === 0 && (
          <p className="font-sans text-xs text-muted-foreground">لا توجد أرقام مضافة.</p>
        )}
        {phones.map((p, i) => (
          <div key={i} className="flex flex-wrap items-center gap-2">
            <FormField
              type="select"
              value={p.type}
              onValueChange={(v) => updatePhone(i, { type: v as PhoneType })}
              options={PHONE_TYPES}
              className="w-28"
            />
            <FormField
              type="tel"
              value={p.number}
              onValueChange={(v) => updatePhone(i, { number: v })}
              placeholder="الرقم"
              className="min-w-[120px] flex-1"
            />
            <FormField
              value={p.label ?? ""}
              onValueChange={(v) => updatePhone(i, { label: v || null })}
              placeholder="وصف"
              className="w-28"
            />
            <FormField
              type="checkbox"
              label="أساسي"
              labelClassName="text-xs font-normal text-muted-foreground"
              checked={p.isPrimary}
              onCheckedChange={(v) => updatePhone(i, { isPrimary: v })}
            />
            <Button
              type="button"
              variant="ghost-destructive"
              size="icon"
              onClick={() => setPhones((prev) => prev.filter((_, idx) => idx !== i))}
            >
              <X />
            </Button>
          </div>
        ))}
      </div>

      {/* Socials */}
      <div className="space-y-3 rounded-2xl border border-border bg-card p-5">
        <div className="flex items-center justify-between">
          <Label className={sectionLabel}>حسابات التواصل الاجتماعي</Label>
          <Button
            type="button"
            variant="link"
            size="sm"
            onClick={() =>
              setSocials((s) => [...s, { platform: SocialPlatform.FACEBOOK, url: "" }])
            }
            className="h-auto px-0 text-sm [&_svg]:size-3.5"
          >
            <Plus /> إضافة حساب
          </Button>
        </div>
        {socials.length === 0 && (
          <p className="font-sans text-xs text-muted-foreground">لا توجد حسابات مضافة.</p>
        )}
        {socials.map((s, i) => (
          <div key={i} className="flex flex-wrap items-center gap-2">
            <FormField
              type="select"
              value={s.platform}
              onValueChange={(v) =>
                setSocials((prev) =>
                  prev.map((x, idx) => (idx === i ? { ...x, platform: v as SocialPlatform } : x))
                )
              }
              options={PLATFORMS}
              className="w-36"
            />
            <FormField
              type="url"
              value={s.url}
              onValueChange={(v) =>
                setSocials((prev) => prev.map((x, idx) => (idx === i ? { ...x, url: v } : x)))
              }
              placeholder="https://…"
              className="min-w-[160px] flex-1"
            />
            <Button
              type="button"
              variant="ghost-destructive"
              size="icon"
              onClick={() => setSocials((prev) => prev.filter((_, idx) => idx !== i))}
            >
              <X />
            </Button>
          </div>
        ))}
      </div>

      <Button type="submit" loading={isPending} className="px-6">
        {isPending ? "جارٍ الحفظ..." : "حفظ التغييرات"}
      </Button>
    </form>
  );
}
