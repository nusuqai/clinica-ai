"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, X } from "lucide-react";
import { updateClinicInfoAction } from "@/server/actions/admin";
import { PhoneType, SocialPlatform } from "@prisma/client";

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

const inputCls =
  "w-full border border-border rounded-xl px-3 py-2 text-sm bg-background text-foreground font-sans focus:outline-none focus:ring-2 focus:ring-primary/30";
const labelCls = "text-sm font-medium text-foreground font-sans";

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
        <div className="space-y-1.5">
          <label className={labelCls}>اسم العيادة</label>
          <input value={name} onChange={(e) => setName(e.target.value)} className={inputCls} />
        </div>
        <div className="space-y-1.5">
          <label className={labelCls}>نبذة عن العيادة</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={4}
            className={inputCls + " resize-none"}
          />
        </div>
      </div>

      {/* Phones */}
      <div className="space-y-3 rounded-2xl border border-border bg-card p-5">
        <div className="flex items-center justify-between">
          <span className={labelCls}>أرقام الهواتف العامة</span>
          <button
            type="button"
            onClick={() =>
              setPhones((p) => [
                ...p,
                { type: PhoneType.MOBILE, number: "", label: null, isPrimary: p.length === 0 },
              ])
            }
            className="inline-flex items-center gap-1 font-sans text-sm text-primary hover:underline"
          >
            <Plus className="h-3.5 w-3.5" /> إضافة رقم
          </button>
        </div>
        <p className="font-sans text-xs text-muted-foreground">
          الرقم المعلّم كـ«أساسي» هو الرقم الرئيسي للعيادة.
        </p>
        {phones.length === 0 && (
          <p className="font-sans text-xs text-muted-foreground">لا توجد أرقام مضافة.</p>
        )}
        {phones.map((p, i) => (
          <div key={i} className="flex flex-wrap items-center gap-2">
            <select
              value={p.type}
              onChange={(e) => updatePhone(i, { type: e.target.value as PhoneType })}
              className="rounded-xl border border-border bg-background px-2 py-2 font-sans text-sm"
            >
              {PHONE_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
            <input
              value={p.number}
              onChange={(e) => updatePhone(i, { number: e.target.value })}
              placeholder="الرقم"
              dir="ltr"
              className="min-w-[120px] flex-1 rounded-xl border border-border bg-background px-3 py-2 font-sans text-sm"
            />
            <input
              value={p.label ?? ""}
              onChange={(e) => updatePhone(i, { label: e.target.value || null })}
              placeholder="وصف"
              className="w-28 rounded-xl border border-border bg-background px-3 py-2 font-sans text-sm"
            />
            <label className="flex items-center gap-1 font-sans text-xs text-muted-foreground">
              <input
                type="checkbox"
                checked={p.isPrimary}
                onChange={(e) => updatePhone(i, { isPrimary: e.target.checked })}
              />
              أساسي
            </label>
            <button
              type="button"
              onClick={() => setPhones((prev) => prev.filter((_, idx) => idx !== i))}
              className="rounded-lg p-1.5 text-muted-foreground hover:bg-red-50 hover:text-red-500"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>

      {/* Socials */}
      <div className="space-y-3 rounded-2xl border border-border bg-card p-5">
        <div className="flex items-center justify-between">
          <span className={labelCls}>حسابات التواصل الاجتماعي</span>
          <button
            type="button"
            onClick={() =>
              setSocials((s) => [...s, { platform: SocialPlatform.FACEBOOK, url: "" }])
            }
            className="inline-flex items-center gap-1 font-sans text-sm text-primary hover:underline"
          >
            <Plus className="h-3.5 w-3.5" /> إضافة حساب
          </button>
        </div>
        {socials.length === 0 && (
          <p className="font-sans text-xs text-muted-foreground">لا توجد حسابات مضافة.</p>
        )}
        {socials.map((s, i) => (
          <div key={i} className="flex flex-wrap items-center gap-2">
            <select
              value={s.platform}
              onChange={(e) =>
                setSocials((prev) =>
                  prev.map((x, idx) =>
                    idx === i ? { ...x, platform: e.target.value as SocialPlatform } : x
                  )
                )
              }
              className="rounded-xl border border-border bg-background px-2 py-2 font-sans text-sm"
            >
              {PLATFORMS.map((pl) => (
                <option key={pl.value} value={pl.value}>
                  {pl.label}
                </option>
              ))}
            </select>
            <input
              value={s.url}
              onChange={(e) =>
                setSocials((prev) =>
                  prev.map((x, idx) => (idx === i ? { ...x, url: e.target.value } : x))
                )
              }
              placeholder="https://…"
              dir="ltr"
              className="min-w-[160px] flex-1 rounded-xl border border-border bg-background px-3 py-2 font-sans text-sm"
            />
            <button
              type="button"
              onClick={() => setSocials((prev) => prev.filter((_, idx) => idx !== i))}
              className="rounded-lg p-1.5 text-muted-foreground hover:bg-red-50 hover:text-red-500"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>

      <button
        type="submit"
        disabled={isPending}
        className="rounded-xl bg-primary px-6 py-2.5 font-sans text-sm font-medium text-white transition-colors hover:bg-primary/90 disabled:opacity-60"
      >
        {isPending ? "جارٍ الحفظ..." : "حفظ التغييرات"}
      </button>
    </form>
  );
}
