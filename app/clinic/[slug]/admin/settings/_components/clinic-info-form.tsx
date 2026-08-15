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
    <form onSubmit={handleSubmit} className="space-y-6 max-w-3xl">
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm font-sans">
          {error}
        </div>
      )}
      {saved && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-xl px-4 py-3 text-sm font-sans">
          تم حفظ التغييرات
        </div>
      )}

      <div className="bg-card border border-border rounded-2xl p-5 space-y-4">
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
      <div className="bg-card border border-border rounded-2xl p-5 space-y-3">
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
            className="inline-flex items-center gap-1 text-sm text-primary font-sans hover:underline"
          >
            <Plus className="w-3.5 h-3.5" /> إضافة رقم
          </button>
        </div>
        <p className="text-xs text-muted-foreground font-sans">
          الرقم المعلّم كـ«أساسي» هو الرقم الرئيسي للعيادة.
        </p>
        {phones.length === 0 && (
          <p className="text-xs text-muted-foreground font-sans">لا توجد أرقام مضافة.</p>
        )}
        {phones.map((p, i) => (
          <div key={i} className="flex flex-wrap items-center gap-2">
            <select
              value={p.type}
              onChange={(e) => updatePhone(i, { type: e.target.value as PhoneType })}
              className="border border-border rounded-xl px-2 py-2 text-sm bg-background font-sans"
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
              className="flex-1 min-w-[120px] border border-border rounded-xl px-3 py-2 text-sm bg-background font-sans"
            />
            <input
              value={p.label ?? ""}
              onChange={(e) => updatePhone(i, { label: e.target.value || null })}
              placeholder="وصف"
              className="w-28 border border-border rounded-xl px-3 py-2 text-sm bg-background font-sans"
            />
            <label className="flex items-center gap-1 text-xs font-sans text-muted-foreground">
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
              className="p-1.5 rounded-lg text-muted-foreground hover:text-red-500 hover:bg-red-50"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>

      {/* Socials */}
      <div className="bg-card border border-border rounded-2xl p-5 space-y-3">
        <div className="flex items-center justify-between">
          <span className={labelCls}>حسابات التواصل الاجتماعي</span>
          <button
            type="button"
            onClick={() =>
              setSocials((s) => [...s, { platform: SocialPlatform.FACEBOOK, url: "" }])
            }
            className="inline-flex items-center gap-1 text-sm text-primary font-sans hover:underline"
          >
            <Plus className="w-3.5 h-3.5" /> إضافة حساب
          </button>
        </div>
        {socials.length === 0 && (
          <p className="text-xs text-muted-foreground font-sans">لا توجد حسابات مضافة.</p>
        )}
        {socials.map((s, i) => (
          <div key={i} className="flex flex-wrap items-center gap-2">
            <select
              value={s.platform}
              onChange={(e) =>
                setSocials((prev) =>
                  prev.map((x, idx) =>
                    idx === i ? { ...x, platform: e.target.value as SocialPlatform } : x,
                  ),
                )
              }
              className="border border-border rounded-xl px-2 py-2 text-sm bg-background font-sans"
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
                  prev.map((x, idx) => (idx === i ? { ...x, url: e.target.value } : x)),
                )
              }
              placeholder="https://…"
              dir="ltr"
              className="flex-1 min-w-[160px] border border-border rounded-xl px-3 py-2 text-sm bg-background font-sans"
            />
            <button
              type="button"
              onClick={() => setSocials((prev) => prev.filter((_, idx) => idx !== i))}
              className="p-1.5 rounded-lg text-muted-foreground hover:text-red-500 hover:bg-red-50"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>

      <button
        type="submit"
        disabled={isPending}
        className="bg-primary text-white rounded-xl px-6 py-2.5 text-sm font-medium font-sans hover:bg-primary/90 transition-colors disabled:opacity-60"
      >
        {isPending ? "جارٍ الحفظ..." : "حفظ التغييرات"}
      </button>
    </form>
  );
}
