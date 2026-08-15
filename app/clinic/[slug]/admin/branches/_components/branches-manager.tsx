"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Plus,
  Pencil,
  Trash2,
  Star,
  MapPin,
  Phone,
  Car,
  Navigation,
  X,
} from "lucide-react";
import Modal from "@/components/admin/modal";
import {
  createBranchAction,
  updateBranchAction,
  deleteBranchAction,
  setBranchActiveAction,
  setMainBranchAction,
} from "@/server/actions/admin";
import { DayOfWeek, PhoneType } from "@prisma/client";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface BranchPhoneView {
  type: PhoneType;
  number: string;
  label: string | null;
  isPrimary: boolean;
}
export interface BranchHoursView {
  dayOfWeek: DayOfWeek;
  isClosed: boolean;
  openTime: string | null;
  closeTime: string | null;
}
export interface BranchView {
  id: string;
  name: string;
  isMain: boolean;
  isActive: boolean;
  address: string | null;
  mapsUrl: string | null;
  latitude: number | null;
  longitude: number | null;
  hasParking: boolean;
  parkingInfo: string | null;
  nearestLandmark: string | null;
  directions: string | null;
  doctorCount: number;
  phones: BranchPhoneView[];
  hours: BranchHoursView[];
}

const DAYS: { key: DayOfWeek; label: string }[] = [
  { key: DayOfWeek.SAT, label: "السبت" },
  { key: DayOfWeek.SUN, label: "الأحد" },
  { key: DayOfWeek.MON, label: "الإثنين" },
  { key: DayOfWeek.TUE, label: "الثلاثاء" },
  { key: DayOfWeek.WED, label: "الأربعاء" },
  { key: DayOfWeek.THU, label: "الخميس" },
  { key: DayOfWeek.FRI, label: "الجمعة" },
];

const PHONE_TYPES: { value: PhoneType; label: string }[] = [
  { value: PhoneType.LANDLINE, label: "أرضي" },
  { value: PhoneType.MOBILE, label: "موبايل" },
  { value: PhoneType.WHATSAPP, label: "واتساب" },
];

type DayMode = "unset" | "open" | "closed";
interface DayState {
  mode: DayMode;
  openTime: string;
  closeTime: string;
}

interface FormState {
  name: string;
  address: string;
  mapsUrl: string;
  latitude: string;
  longitude: string;
  hasParking: boolean;
  parkingInfo: string;
  nearestLandmark: string;
  directions: string;
  phones: BranchPhoneView[];
  hours: Record<DayOfWeek, DayState>;
}

function emptyHours(): Record<DayOfWeek, DayState> {
  const out = {} as Record<DayOfWeek, DayState>;
  for (const d of DAYS) out[d.key] = { mode: "unset", openTime: "09:00", closeTime: "17:00" };
  return out;
}

function formFromBranch(b?: BranchView): FormState {
  const hours = emptyHours();
  if (b) {
    for (const h of b.hours) {
      hours[h.dayOfWeek] = {
        mode: h.isClosed ? "closed" : "open",
        openTime: h.openTime ?? "09:00",
        closeTime: h.closeTime ?? "17:00",
      };
    }
  }
  return {
    name: b?.name ?? "",
    address: b?.address ?? "",
    mapsUrl: b?.mapsUrl ?? "",
    latitude: b?.latitude != null ? String(b.latitude) : "",
    longitude: b?.longitude != null ? String(b.longitude) : "",
    hasParking: b?.hasParking ?? false,
    parkingInfo: b?.parkingInfo ?? "",
    nearestLandmark: b?.nearestLandmark ?? "",
    directions: b?.directions ?? "",
    phones: b?.phones.map((p) => ({ ...p })) ?? [],
    hours,
  };
}

const inputCls =
  "w-full border border-border rounded-xl px-3 py-2 text-sm bg-background text-foreground font-sans focus:outline-none focus:ring-2 focus:ring-primary/30";
const labelCls = "text-sm font-medium text-foreground font-sans";

// ─── Component ──────────────────────────────────────────────────────────────

export default function BranchesManager({ branches }: { branches: BranchView[] }) {
  const router = useRouter();
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<BranchView | null>(null);
  const [form, setForm] = useState<FormState>(formFromBranch());
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function openCreate() {
    setEditing(null);
    setForm(formFromBranch());
    setError(null);
    setModalOpen(true);
  }
  function openEdit(b: BranchView) {
    setEditing(b);
    setForm(formFromBranch(b));
    setError(null);
    setModalOpen(true);
  }

  function buildPayload() {
    const hours: BranchHoursView[] = [];
    for (const d of DAYS) {
      const s = form.hours[d.key];
      if (s.mode === "closed") {
        hours.push({ dayOfWeek: d.key, isClosed: true, openTime: null, closeTime: null });
      } else if (s.mode === "open" && s.openTime && s.closeTime) {
        hours.push({
          dayOfWeek: d.key,
          isClosed: false,
          openTime: s.openTime,
          closeTime: s.closeTime,
        });
      }
    }
    return {
      name: form.name,
      address: form.address || null,
      mapsUrl: form.mapsUrl || null,
      latitude: form.latitude ? Number(form.latitude) : null,
      longitude: form.longitude ? Number(form.longitude) : null,
      hasParking: form.hasParking,
      parkingInfo: form.parkingInfo || null,
      nearestLandmark: form.nearestLandmark || null,
      directions: form.directions || null,
      phones: form.phones.filter((p) => p.number.trim()),
      hours,
    };
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!form.name.trim()) {
      setError("اسم الفرع مطلوب");
      return;
    }
    const payload = buildPayload();
    startTransition(async () => {
      const res = editing
        ? await updateBranchAction({ branchId: editing.id, ...payload })
        : await createBranchAction(payload);
      if (res?.error) setError(res.error);
      else {
        setModalOpen(false);
        router.refresh();
      }
    });
  }

  function runAction(fn: () => Promise<{ error?: string } | void>, confirmMsg?: string) {
    if (confirmMsg && !confirm(confirmMsg)) return;
    startTransition(async () => {
      const res = await fn();
      if (res && "error" in res && res.error) alert(res.error);
      else router.refresh();
    });
  }

  // Phone row helpers
  function addPhone() {
    setForm((f) => ({
      ...f,
      phones: [...f.phones, { type: PhoneType.MOBILE, number: "", label: null, isPrimary: f.phones.length === 0 }],
    }));
  }
  function updatePhone(i: number, patch: Partial<BranchPhoneView>) {
    setForm((f) => {
      const phones = f.phones.map((p, idx) => (idx === i ? { ...p, ...patch } : p));
      // Single primary: if this row was set primary, clear the others.
      if (patch.isPrimary) phones.forEach((p, idx) => (p.isPrimary = idx === i));
      return { ...f, phones };
    });
  }
  function removePhone(i: number) {
    setForm((f) => ({ ...f, phones: f.phones.filter((_, idx) => idx !== i) }));
  }
  function setDay(day: DayOfWeek, patch: Partial<DayState>) {
    setForm((f) => ({ ...f, hours: { ...f.hours, [day]: { ...f.hours[day], ...patch } } }));
  }

  return (
    <div>
      <div className="flex justify-end mb-4">
        <button
          onClick={openCreate}
          className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-xl text-sm font-medium font-sans hover:bg-primary/90 transition-colors"
        >
          <Plus className="w-4 h-4" />
          إضافة فرع
        </button>
      </div>

      {branches.length === 0 ? (
        <div className="bg-card border border-border rounded-2xl py-16 text-center">
          <p className="text-muted-foreground font-sans">لا توجد فروع بعد. أضف فرعاً لتبدأ.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {branches.map((b) => (
            <div key={b.id} className="bg-card border border-border rounded-2xl p-5">
              <div className="flex items-start justify-between gap-3 mb-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-heading font-bold text-foreground">{b.name}</h3>
                    {b.isMain && (
                      <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 font-sans">
                        <Star className="w-3 h-3" /> رئيسي
                      </span>
                    )}
                    <span
                      className={[
                        "text-xs font-medium px-2 py-0.5 rounded-full font-sans",
                        b.isActive ? "bg-emerald-100 text-emerald-700" : "bg-gray-100 text-gray-500",
                      ].join(" ")}
                    >
                      {b.isActive ? "نشط" : "معطّل"}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground font-sans mt-1">
                    {b.doctorCount} طبيب
                  </p>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button
                    onClick={() => openEdit(b)}
                    title="تعديل"
                    className="p-1.5 rounded-lg text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                  {!b.isMain && (
                    <button
                      onClick={() => runAction(() => setMainBranchAction(b.id))}
                      disabled={isPending}
                      title="تعيين كفرع رئيسي"
                      className="p-1.5 rounded-lg text-muted-foreground hover:text-amber-500 hover:bg-amber-50 transition-colors"
                    >
                      <Star className="w-4 h-4" />
                    </button>
                  )}
                  <button
                    onClick={() => runAction(() => setBranchActiveAction(b.id, !b.isActive))}
                    disabled={isPending}
                    title={b.isActive ? "تعطيل" : "تفعيل"}
                    className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors text-xs font-sans"
                  >
                    {b.isActive ? "تعطيل" : "تفعيل"}
                  </button>
                  {!b.isMain && (
                    <button
                      onClick={() =>
                        runAction(
                          () => deleteBranchAction(b.id),
                          "سيتم حذف هذا الفرع نهائياً. هل تريد المتابعة؟",
                        )
                      }
                      disabled={isPending}
                      title="حذف"
                      className="p-1.5 rounded-lg text-muted-foreground hover:text-red-500 hover:bg-red-50 transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>

              <div className="space-y-1.5 text-sm text-muted-foreground font-sans">
                {b.address && (
                  <p className="flex items-start gap-1.5">
                    <MapPin className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                    {b.address}
                  </p>
                )}
                {b.phones.length > 0 && (
                  <p className="flex items-center gap-1.5" dir="ltr">
                    <Phone className="w-3.5 h-3.5 flex-shrink-0" />
                    {(b.phones.find((p) => p.isPrimary) ?? b.phones[0]).number}
                  </p>
                )}
                {b.hasParking && (
                  <p className="flex items-center gap-1.5">
                    <Car className="w-3.5 h-3.5 flex-shrink-0" />
                    يوجد موقف سيارات
                  </p>
                )}
                {b.nearestLandmark && (
                  <p className="flex items-center gap-1.5">
                    <Navigation className="w-3.5 h-3.5 flex-shrink-0" />
                    {b.nearestLandmark}
                  </p>
                )}
                <p className="text-xs">
                  {b.hours.filter((h) => !h.isClosed).length} يوم عمل مُعرّف
                </p>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? "تعديل الفرع" : "إضافة فرع"}
        width="max-w-3xl"
      >
        <form onSubmit={handleSubmit} className="space-y-5">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm font-sans">
              {error}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5 sm:col-span-2">
              <label className={labelCls}>اسم الفرع *</label>
              <input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="فرع المعادي"
                className={inputCls}
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <label className={labelCls}>العنوان</label>
              <input
                value={form.address}
                onChange={(e) => setForm({ ...form, address: e.target.value })}
                className={inputCls}
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <label className={labelCls}>رابط خرائط جوجل</label>
              <input
                value={form.mapsUrl}
                onChange={(e) => setForm({ ...form, mapsUrl: e.target.value })}
                dir="ltr"
                placeholder="https://maps.google.com/…"
                className={inputCls}
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <label className={labelCls}>أقرب معلم</label>
              <input
                value={form.nearestLandmark}
                onChange={(e) => setForm({ ...form, nearestLandmark: e.target.value })}
                className={inputCls}
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <label className={labelCls}>كيفية الوصول</label>
              <textarea
                value={form.directions}
                onChange={(e) => setForm({ ...form, directions: e.target.value })}
                rows={2}
                className={inputCls + " resize-none"}
              />
            </div>
          </div>

          {/* Parking */}
          <div className="border border-border rounded-xl p-4 space-y-3">
            <label className="flex items-center gap-2 text-sm font-medium text-foreground font-sans">
              <input
                type="checkbox"
                checked={form.hasParking}
                onChange={(e) => setForm({ ...form, hasParking: e.target.checked })}
              />
              يوجد موقف سيارات
            </label>
            {form.hasParking && (
              <input
                value={form.parkingInfo}
                onChange={(e) => setForm({ ...form, parkingInfo: e.target.value })}
                placeholder="وصف الموقف (مدفوع/مجاني، سعة، مكانه…)"
                className={inputCls}
              />
            )}
          </div>

          {/* Phones */}
          <div className="border border-border rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className={labelCls}>أرقام هواتف الفرع</span>
              <button
                type="button"
                onClick={addPhone}
                className="inline-flex items-center gap-1 text-sm text-primary font-sans hover:underline"
              >
                <Plus className="w-3.5 h-3.5" /> إضافة رقم
              </button>
            </div>
            {form.phones.length === 0 && (
              <p className="text-xs text-muted-foreground font-sans">لا توجد أرقام مضافة.</p>
            )}
            {form.phones.map((p, i) => (
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
                  placeholder="وصف (استقبال…)"
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
                  onClick={() => removePhone(i)}
                  className="p-1.5 rounded-lg text-muted-foreground hover:text-red-500 hover:bg-red-50"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>

          {/* Working hours */}
          <div className="border border-border rounded-xl p-4 space-y-2">
            <span className={labelCls}>ساعات العمل</span>
            <p className="text-xs text-muted-foreground font-sans">
              اترك اليوم بدون تحديد إن لم ترغب في تقييده. تُستخدم هذه الساعات للتحقق من مواعيد الأطباء.
            </p>
            <div className="space-y-2 mt-2">
              {DAYS.map((d) => {
                const s = form.hours[d.key];
                return (
                  <div key={d.key} className="flex flex-wrap items-center gap-2">
                    <span className="w-16 text-sm font-sans text-foreground">{d.label}</span>
                    <select
                      value={s.mode}
                      onChange={(e) => setDay(d.key, { mode: e.target.value as DayMode })}
                      className="border border-border rounded-xl px-2 py-1.5 text-sm bg-background font-sans"
                    >
                      <option value="unset">غير محدد</option>
                      <option value="open">مفتوح</option>
                      <option value="closed">مغلق (عطلة)</option>
                    </select>
                    {s.mode === "open" && (
                      <>
                        <input
                          type="time"
                          value={s.openTime}
                          onChange={(e) => setDay(d.key, { openTime: e.target.value })}
                          dir="ltr"
                          className="border border-border rounded-xl px-2 py-1.5 text-sm bg-background font-sans"
                        />
                        <span className="text-muted-foreground text-sm">–</span>
                        <input
                          type="time"
                          value={s.closeTime}
                          onChange={(e) => setDay(d.key, { closeTime: e.target.value })}
                          dir="ltr"
                          className="border border-border rounded-xl px-2 py-1.5 text-sm bg-background font-sans"
                        />
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="flex gap-3 pt-1">
            <button
              type="submit"
              disabled={isPending}
              className="flex-1 bg-primary text-white rounded-xl py-2.5 text-sm font-medium font-sans hover:bg-primary/90 transition-colors disabled:opacity-60"
            >
              {isPending ? "جارٍ الحفظ..." : editing ? "حفظ التعديلات" : "إضافة الفرع"}
            </button>
            <button
              type="button"
              onClick={() => setModalOpen(false)}
              className="px-4 border border-border rounded-xl text-sm font-medium font-sans text-foreground hover:bg-muted transition-colors"
            >
              إلغاء
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
