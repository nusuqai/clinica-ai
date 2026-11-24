"use client";

import { useEffect, useMemo, useState } from "react";
import { Download, FileSpreadsheet, Info, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { AppointmentStatus } from "@prisma/client";
import { APPOINTMENT_STATUS_LABELS } from "@/lib/labels";
import {
  EXPORT_PRESETS,
  EXPORT_PRESET_LABELS,
  exportFileName,
  exportFiltersSchema,
  exportQuery,
  presetRange,
  type ExportPreset,
} from "@/lib/exports/filters";
import { searchExportPatientsAction } from "@/server/actions/exports";
import type { ExportOptions } from "@/server/services/exports/settings";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const ALL = "__all";

function OptionSelect({
  label,
  value,
  onChange,
  options,
  allLabel,
}: {
  label: string;
  value: string | null;
  onChange: (v: string | null) => void;
  options: { id: string; name: string }[];
  allLabel: string;
}) {
  return (
    <div className="space-y-1">
      <Label>{label}</Label>
      <Select value={value ?? ALL} onValueChange={(v) => onChange(v === ALL ? null : v)}>
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>{allLabel}</SelectItem>
          {options.map((o) => (
            <SelectItem key={o.id} value={o.id}>
              {o.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

export default function ExportForm({
  options,
  timeZone,
  branchLimited,
  medical,
}: {
  options: ExportOptions;
  timeZone: string;
  branchLimited: boolean;
  medical: boolean;
}) {
  const [preset, setPreset] = useState<ExportPreset>("today");
  const initial = useMemo(() => presetRange("today", timeZone), [timeZone]);
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);
  const [branchId, setBranchId] = useState<string | null>(null);
  const [doctorId, setDoctorId] = useState<string | null>(null);
  const [specialtyId, setSpecialtyId] = useState<string | null>(null);
  const [serviceId, setServiceId] = useState<string | null>(null);
  const [status, setStatus] = useState<AppointmentStatus | null>(null);
  const [patient, setPatient] = useState<{ id: string; name: string } | null>(null);
  const [patientQuery, setPatientQuery] = useState("");
  const [patientHits, setPatientHits] = useState<
    { id: string; name: string; phone: string | null }[]
  >([]);
  const [downloading, setDownloading] = useState(false);

  function pickPreset(p: ExportPreset) {
    setPreset(p);
    if (p !== "custom") {
      const r = presetRange(p, timeZone);
      setFrom(r.from);
      setTo(r.to);
    }
  }

  useEffect(() => {
    if (patient || patientQuery.trim().length < 2) {
      setPatientHits([]);
      return;
    }
    const t = setTimeout(async () => {
      setPatientHits(await searchExportPatientsAction(patientQuery));
    }, 300);
    return () => clearTimeout(t);
  }, [patientQuery, patient]);

  async function download() {
    const parsed = exportFiltersSchema.safeParse({
      from,
      to,
      branchId,
      doctorId,
      specialtyId,
      serviceId,
      status,
      patientId: patient?.id ?? null,
    });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "تحقق من الفلاتر");
      return;
    }
    setDownloading(true);
    try {
      const res = await fetch(`/api/exports?${exportQuery(parsed.data)}`);
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? "تعذّر إنشاء الملف");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = exportFileName(parsed.data);
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "تعذّر إنشاء الملف");
    } finally {
      setDownloading(false);
    }
  }

  return (
    <Card className="p-5">
      <div className="mb-4 flex items-center gap-2">
        <FileSpreadsheet className="h-5 w-5 text-primary" />
        <h2 className="font-heading text-base font-semibold">تصدير ملف Excel</h2>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        {EXPORT_PRESETS.map((p) => (
          <Button
            key={p}
            type="button"
            size="sm"
            variant={preset === p ? "default" : "outline"}
            onClick={() => pickPreset(p)}
          >
            {EXPORT_PRESET_LABELS[p]}
          </Button>
        ))}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-1">
          <Label htmlFor="from">من</Label>
          <Input
            id="from"
            type="date"
            value={from}
            onChange={(e) => {
              setPreset("custom");
              setFrom(e.target.value);
            }}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="to">إلى</Label>
          <Input
            id="to"
            type="date"
            value={to}
            onChange={(e) => {
              setPreset("custom");
              setTo(e.target.value);
            }}
          />
        </div>
        <OptionSelect
          label="الفرع"
          value={branchId}
          onChange={setBranchId}
          options={options.branches}
          allLabel={branchLimited ? "كل فروعي" : "كل الفروع"}
        />
        <OptionSelect
          label="الطبيب"
          value={doctorId}
          onChange={setDoctorId}
          options={options.doctors}
          allLabel="كل الأطباء"
        />
        <OptionSelect
          label="التخصص"
          value={specialtyId}
          onChange={setSpecialtyId}
          options={options.specialties}
          allLabel="كل التخصصات"
        />
        <OptionSelect
          label="الخدمة"
          value={serviceId}
          onChange={setServiceId}
          options={options.services}
          allLabel="كل الخدمات"
        />
        <OptionSelect
          label="حالة الموعد"
          value={status}
          onChange={(v) => setStatus(v as AppointmentStatus | null)}
          options={Object.values(AppointmentStatus).map((s) => ({
            id: s,
            name: APPOINTMENT_STATUS_LABELS[s],
          }))}
          allLabel="كل الحالات"
        />
        <div className="relative space-y-1">
          <Label htmlFor="patient">مريض محدد</Label>
          {patient ? (
            <div className="flex items-center justify-between rounded-xl border border-border px-3 py-2 text-sm">
              <span>{patient.name}</span>
              <button
                type="button"
                onClick={() => {
                  setPatient(null);
                  setPatientQuery("");
                }}
                aria-label="إزالة المريض"
              >
                <X className="h-4 w-4 text-muted-foreground" />
              </button>
            </div>
          ) : (
            <Input
              id="patient"
              placeholder="اسم أو رقم هاتف"
              value={patientQuery}
              onChange={(e) => setPatientQuery(e.target.value)}
            />
          )}
          {patientHits.length > 0 && (
            <div className="absolute z-20 mt-1 w-full rounded-xl border border-border bg-popover p-1 shadow-md">
              {patientHits.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className="flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-sm hover:bg-muted"
                  onClick={() => {
                    setPatient({ id: p.id, name: p.name });
                    setPatientHits([]);
                  }}
                >
                  <span>{p.name}</span>
                  {p.phone && (
                    <span className="text-xs text-muted-foreground" dir="ltr">
                      {p.phone}
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
        <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
          <Info className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
          <span>
            الملف يحتوي: الملخص، المرضى الجدد، الحجوزات الجديدة، الإلغاءات، سجل التغييرات، مواعيد
            الفترة، الباقات المباعة، التقييمات، وتوزيع المواعيد حسب الفرع والطبيب
            {medical
              ? "، والسجلات الطبية وملفات المرضى."
              : ". (البيانات الطبية تحتاج صلاحية السجلات الطبية.)"}
            {branchLimited && " يشمل فروعك فقط."}
          </span>
        </p>
        <Button onClick={download} disabled={downloading}>
          {downloading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Download className="h-4 w-4" />
          )}
          تحميل الملف
        </Button>
      </div>
    </Card>
  );
}
