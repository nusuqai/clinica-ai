"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Pencil, Trash2, Star, MapPin, Phone, Car, Navigation, X } from "lucide-react";
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

export default function BranchesManager({
  branches,
  clinicId,
}: {
  branches: BranchView[];
  clinicId: string;
}) {
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
        ? await updateBranchAction({ branchId: editing.id, clinicId: clinicId, ...payload })
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
      phones: [
        ...f.phones,
        { type: PhoneType.MOBILE, number: "", label: null, isPrimary: f.phones.length === 0 },
      ],
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
      <div className="mb-4 flex justify-end">
        <button
          onClick={openCreate}
          className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 font-sans text-sm font-medium text-white transition-colors hover:bg-primary/90"
        >
          <Plus className="h-4 w-4" />
          إضافة فرع
        </button>
      </div>

      {branches.length === 0 ? (
        <div className="rounded-2xl border border-border bg-card py-16 text-center">
          <p className="font-sans text-muted-foreground">لا توجد فروع بعد. أضف فرعاً لتبدأ.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {branches.map((b) => (
            <div key={b.id} className="rounded-2xl border border-border bg-card p-5">
              <div className="mb-3 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-heading font-bold text-foreground">{b.name}</h3>
                    {b.isMain && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 font-sans text-xs font-medium text-amber-700">
                        <Star className="h-3 w-3" /> رئيسي
                      </span>
                    )}
                    <span
                      className={[
                        "rounded-full px-2 py-0.5 font-sans text-xs font-medium",
                        b.isActive
                          ? "bg-emerald-100 text-emerald-700"
                          : "bg-gray-100 text-gray-500",
                      ].join(" ")}
                    >
                      {b.isActive ? "نشط" : "معطّل"}
                    </span>
                  </div>
                  <p className="mt-1 font-sans text-xs text-muted-foreground">
                    {b.doctorCount} طبيب
                  </p>
                </div>
                <div className="flex flex-shrink-0 items-center gap-1">
                  <button
                    onClick={() => openEdit(b)}
                    title="تعديل"
                    className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                  {!b.isMain && (
                    <button
                      onClick={() => runAction(() => setMainBranchAction(b.id))}
                      disabled={isPending}
                      title="تعيين كفرع رئيسي"
                      className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-amber-50 hover:text-amber-500"
                    >
                      <Star className="h-4 w-4" />
                    </button>
                  )}
                  <button
                    onClick={() => runAction(() => setBranchActiveAction(b.id, !b.isActive))}
                    disabled={isPending}
                    title={b.isActive ? "تعطيل" : "تفعيل"}
                    className="rounded-lg p-1.5 font-sans text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  >
                    {b.isActive ? "تعطيل" : "تفعيل"}
                  </button>
                  {!b.isMain && (
                    <button
                      onClick={() =>
                        runAction(
                          () => deleteBranchAction(b.id),
                          "سيتم حذف هذا الفرع نهائياً. هل تريد المتابعة؟"
                        )
                      }
                      disabled={isPending}
                      title="حذف"
                      className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-red-50 hover:text-red-500"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>

              <div className="space-y-1.5 font-sans text-sm text-muted-foreground">
                {b.address && (
                  <p className="flex items-start gap-1.5">
                    <MapPin className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
                    {b.address}
                  </p>
                )}
                {b.phones.length > 0 && (
                  <p className="flex items-center gap-1.5" dir="ltr">
                    <Phone className="h-3.5 w-3.5 flex-shrink-0" />
                    {(b.phones.find((p) => p.isPrimary) ?? b.phones[0]).number}
                  </p>
                )}
                {b.hasParking && (
                  <p className="flex items-center gap-1.5">
                    <Car className="h-3.5 w-3.5 flex-shrink-0" />
                    يوجد موقف سيارات
                  </p>
                )}
                {b.nearestLandmark && (
                  <p className="flex items-center gap-1.5">
                    <Navigation className="h-3.5 w-3.5 flex-shrink-0" />
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
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 font-sans text-sm text-red-700">
              {error}
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
          <div className="space-y-3 rounded-xl border border-border p-4">
            <label className="flex items-center gap-2 font-sans text-sm font-medium text-foreground">
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
          <div className="space-y-3 rounded-xl border border-border p-4">
            <div className="flex items-center justify-between">
              <span className={labelCls}>أرقام هواتف الفرع</span>
              <button
                type="button"
                onClick={addPhone}
                className="inline-flex items-center gap-1 font-sans text-sm text-primary hover:underline"
              >
                <Plus className="h-3.5 w-3.5" /> إضافة رقم
              </button>
            </div>
            {form.phones.length === 0 && (
              <p className="font-sans text-xs text-muted-foreground">لا توجد أرقام مضافة.</p>
            )}
            {form.phones.map((p, i) => (
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
                  placeholder="وصف (استقبال…)"
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
                  onClick={() => removePhone(i)}
                  className="rounded-lg p-1.5 text-muted-foreground hover:bg-red-50 hover:text-red-500"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>

          {/* Working hours */}
          <div className="space-y-2 rounded-xl border border-border p-4">
            <span className={labelCls}>ساعات العمل</span>
            <p className="font-sans text-xs text-muted-foreground">
              اترك اليوم بدون تحديد إن لم ترغب في تقييده. تُستخدم هذه الساعات للتحقق من مواعيد
              الأطباء.
            </p>
            <div className="mt-2 space-y-2">
              {DAYS.map((d) => {
                const s = form.hours[d.key];
                return (
                  <div key={d.key} className="flex flex-wrap items-center gap-2">
                    <span className="w-16 font-sans text-sm text-foreground">{d.label}</span>
                    <select
                      value={s.mode}
                      onChange={(e) => setDay(d.key, { mode: e.target.value as DayMode })}
                      className="rounded-xl border border-border bg-background px-2 py-1.5 font-sans text-sm"
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
                          className="rounded-xl border border-border bg-background px-2 py-1.5 font-sans text-sm"
                        />
                        <span className="text-sm text-muted-foreground">–</span>
                        <input
                          type="time"
                          value={s.closeTime}
                          onChange={(e) => setDay(d.key, { closeTime: e.target.value })}
                          dir="ltr"
                          className="rounded-xl border border-border bg-background px-2 py-1.5 font-sans text-sm"
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
              className="flex-1 rounded-xl bg-primary py-2.5 font-sans text-sm font-medium text-white transition-colors hover:bg-primary/90 disabled:opacity-60"
            >
              {isPending ? "جارٍ الحفظ..." : editing ? "حفظ التعديلات" : "إضافة الفرع"}
            </button>
            <button
              type="button"
              onClick={() => setModalOpen(false)}
              className="rounded-xl border border-border px-4 font-sans text-sm font-medium text-foreground transition-colors hover:bg-muted"
            >
              إلغاء
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
