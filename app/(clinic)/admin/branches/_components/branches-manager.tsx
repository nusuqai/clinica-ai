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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { toast } from "sonner";

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

const DAY_MODE_OPTIONS: { value: DayMode; label: string }[] = [
  { value: "unset", label: "غير محدد" },
  { value: "open", label: "مفتوح" },
  { value: "closed", label: "مغلق (عطلة)" },
];

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
  const confirm = useConfirm();

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

  async function runAction(fn: () => Promise<{ error?: string } | void>, confirmMsg?: string) {
    if (confirmMsg && !(await confirm({ title: "حذف الفرع", description: confirmMsg }))) return;
    startTransition(async () => {
      const res = await fn();
      if (res && "error" in res && res.error) toast.error(res.error);
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
        <Button onClick={openCreate}>
          <Plus />
          إضافة فرع
        </Button>
      </div>

      {branches.length === 0 ? (
        <Card className="py-16 text-center">
          <p className="font-sans text-muted-foreground">لا توجد فروع بعد. أضف فرعاً لتبدأ.</p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {branches.map((b) => (
            <Card key={b.id} className="p-5">
              <div className="mb-3 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-heading font-bold text-foreground">{b.name}</h3>
                    {b.isMain && (
                      <Badge variant="warning">
                        <Star className="h-3 w-3" /> رئيسي
                      </Badge>
                    )}
                    <Badge variant={b.isActive ? "success" : "neutral"}>
                      {b.isActive ? "نشط" : "معطّل"}
                    </Badge>
                  </div>
                  <p className="mt-1 font-sans text-xs text-muted-foreground">
                    {b.doctorCount} طبيب
                  </p>
                </div>
                <div className="flex flex-shrink-0 items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => openEdit(b)}
                    title="تعديل"
                    className="hover:bg-primary/10 hover:text-primary"
                  >
                    <Pencil />
                  </Button>
                  {!b.isMain && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => runAction(() => setMainBranchAction(b.id))}
                      disabled={isPending}
                      title="تعيين كفرع رئيسي"
                      className="hover:bg-amber-50 hover:text-amber-500"
                    >
                      <Star />
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => runAction(() => setBranchActiveAction(b.id, !b.isActive))}
                    disabled={isPending}
                    title={b.isActive ? "تعطيل" : "تفعيل"}
                  >
                    {b.isActive ? "تعطيل" : "تفعيل"}
                  </Button>
                  {!b.isMain && (
                    <Button
                      variant="ghost-destructive"
                      size="icon"
                      onClick={() =>
                        runAction(
                          () => deleteBranchAction(b.id),
                          "سيتم حذف هذا الفرع نهائياً. هل تريد المتابعة؟"
                        )
                      }
                      disabled={isPending}
                      title="حذف"
                    >
                      <Trash2 />
                    </Button>
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
            </Card>
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
          {error && <Alert variant="destructive">{error}</Alert>}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FormField
              label="اسم الفرع *"
              value={form.name}
              onValueChange={(v) => setForm({ ...form, name: v })}
              placeholder="فرع المعادي"
              className="sm:col-span-2"
            />
            <FormField
              label="العنوان"
              value={form.address}
              onValueChange={(v) => setForm({ ...form, address: v })}
              className="sm:col-span-2"
            />
            <FormField
              type="url"
              label="رابط خرائط جوجل"
              value={form.mapsUrl}
              onValueChange={(v) => setForm({ ...form, mapsUrl: v })}
              placeholder="https://maps.google.com/…"
              className="sm:col-span-2"
            />
            <FormField
              label="أقرب معلم"
              value={form.nearestLandmark}
              onValueChange={(v) => setForm({ ...form, nearestLandmark: v })}
              className="sm:col-span-2"
            />
            <FormField
              type="textarea"
              label="كيفية الوصول"
              value={form.directions}
              onValueChange={(v) => setForm({ ...form, directions: v })}
              rows={2}
              className="sm:col-span-2"
            />
          </div>

          {/* Parking */}
          <div className="space-y-3 rounded-xl border border-border p-4">
            <FormField
              type="checkbox"
              label="يوجد موقف سيارات"
              checked={form.hasParking}
              onCheckedChange={(v) => setForm({ ...form, hasParking: v })}
            />
            {form.hasParking && (
              <FormField
                value={form.parkingInfo}
                onValueChange={(v) => setForm({ ...form, parkingInfo: v })}
                placeholder="وصف الموقف (مدفوع/مجاني، سعة، مكانه…)"
              />
            )}
          </div>

          {/* Phones */}
          <div className="space-y-3 rounded-xl border border-border p-4">
            <div className="flex items-center justify-between">
              <Label className="font-sans text-sm font-medium text-foreground">
                أرقام هواتف الفرع
              </Label>
              <Button
                type="button"
                variant="link"
                size="sm"
                onClick={addPhone}
                className="h-auto px-0 text-sm [&_svg]:size-3.5"
              >
                <Plus /> إضافة رقم
              </Button>
            </div>
            {form.phones.length === 0 && (
              <p className="font-sans text-xs text-muted-foreground">لا توجد أرقام مضافة.</p>
            )}
            {form.phones.map((p, i) => (
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
                  placeholder="وصف (استقبال…)"
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
                  onClick={() => removePhone(i)}
                >
                  <X />
                </Button>
              </div>
            ))}
          </div>

          {/* Working hours */}
          <div className="space-y-2 rounded-xl border border-border p-4">
            <Label className="font-sans text-sm font-medium text-foreground">ساعات العمل</Label>
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
                    <FormField
                      type="select"
                      value={s.mode}
                      onValueChange={(v) => setDay(d.key, { mode: v as DayMode })}
                      options={DAY_MODE_OPTIONS}
                      className="w-36"
                      controlClassName="h-9"
                    />
                    {s.mode === "open" && (
                      <>
                        <FormField
                          type="time"
                          value={s.openTime}
                          onValueChange={(v) => setDay(d.key, { openTime: v })}
                          className="w-32"
                          controlClassName="h-9"
                        />
                        <span className="text-sm text-muted-foreground">–</span>
                        <FormField
                          type="time"
                          value={s.closeTime}
                          onValueChange={(v) => setDay(d.key, { closeTime: v })}
                          className="w-32"
                          controlClassName="h-9"
                        />
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="flex gap-3 pt-1">
            <Button type="submit" loading={isPending} className="flex-1">
              {isPending ? "جارٍ الحفظ..." : editing ? "حفظ التعديلات" : "إضافة الفرع"}
            </Button>
            <Button type="button" variant="outline" onClick={() => setModalOpen(false)}>
              إلغاء
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
