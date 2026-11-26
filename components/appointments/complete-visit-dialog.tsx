"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { Check, Plus, Trash2, Undo2, X } from "lucide-react";
import { toast } from "sonner";
import Modal from "@/components/admin/modal";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Spinner } from "@/components/ui/spinner";
import { completeVisitAction, getCompletionDraftAction } from "@/server/actions/completion";
import { formatFee } from "@/lib/currency";
import type { CompletionDraft, CompletionLine } from "@/server/services/completion";

interface LineState {
  remove: boolean;
  quantity: string;
  price: string;
  /** Pre-check decision for a line that needs one ("" = not chosen yet). */
  decision: "" | "APPROVED" | "DECLINED";
  note: string;
}

interface AddedState {
  key: number;
  serviceId: string;
  /** "" = paid normally. */
  patientPackageId: string;
  quantity: string;
  price: string;
}

const PRICE_NEEDED = new Set(["STARTING_FROM", "AFTER_CONSULTATION"]);
const UNIT_PRICED = new Set(["PER_UNIT", "TIERED"]);

/**
 * "Mark completed" for a visit: record actual units / final prices, drop or
 * add lines, confirm unpaid packages — then the visit, its package deductions
 * and any offer rewards are saved together. Opened from every completion
 * entry point (admin board, queue panel, doctor's list, appointment page).
 */
export default function CompleteVisitDialog({
  appointmentId,
  open,
  onClose,
  onCompleted,
}: {
  appointmentId: string | null;
  open: boolean;
  onClose: () => void;
  onCompleted: () => void;
}) {
  const [draft, setDraft] = useState<CompletionDraft | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [lines, setLines] = useState<Record<string, LineState>>({});
  const [added, setAdded] = useState<AddedState[]>([]);
  const [paid, setPaid] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (!open || !appointmentId) return;
    let live = true;
    setDraft(null);
    setLoadError(null);
    setError(null);
    setAdded([]);
    getCompletionDraftAction(appointmentId).then((res) => {
      if (!live) return;
      if ("draft" in res && res.draft) {
        setDraft(res.draft);
        setLines(
          Object.fromEntries(
            res.draft.lines.map((l) => [
              l.itemId,
              {
                remove: false,
                quantity: l.input === "quantity" ? String(l.quantity) : "",
                price: l.input === "price" && l.total != null ? String(l.total) : "",
                decision: "",
                note: "",
              },
            ])
          )
        );
        setPaid(Object.fromEntries(res.draft.unpaidPackages.map((p) => [p.id, false])));
      } else setLoadError(res.error ?? "تعذّر تحميل الزيارة");
    });
    return () => {
      live = false;
    };
  }, [open, appointmentId]);

  const addableById = useMemo(() => new Map((draft?.addable ?? []).map((s) => [s.id, s])), [draft]);
  const existingServiceIds = new Set([
    ...(draft?.lines.filter((l) => !lines[l.itemId]?.remove).map((l) => l.serviceId) ?? []),
    ...added.map((a) => a.serviceId),
  ]);

  function patchLine(id: string, patch: Partial<LineState>) {
    setLines((p) => ({ ...p, [id]: { ...p[id], ...patch } }));
  }
  function patchAdded(key: number, patch: Partial<AddedState>) {
    setAdded((p) => p.map((a) => (a.key === key ? { ...a, ...patch } : a)));
  }

  function submit() {
    if (!draft) return;
    setError(null);
    const n = (v: string) => (v.trim() === "" ? null : Number(v));
    startTransition(async () => {
      const res = await completeVisitAction({
        appointmentId: draft.appointmentId,
        lines: draft.lines.map((l) => ({
          itemId: l.itemId,
          remove: lines[l.itemId]?.remove || undefined,
          finalQuantity: n(lines[l.itemId]?.quantity ?? ""),
          finalPrice: n(lines[l.itemId]?.price ?? ""),
          ...(l.needsDecision && {
            preCheckDecision: lines[l.itemId]?.decision || null,
            preCheckNote: lines[l.itemId]?.note || null,
          }),
        })),
        add: added
          .filter((a) => a.serviceId)
          .map((a) => ({
            serviceId: a.serviceId,
            patientPackageId: a.patientPackageId || null,
            quantity: n(a.quantity),
            finalQuantity: n(a.quantity),
            finalPrice: n(a.price),
          })),
        confirmPaymentFor: Object.entries(paid)
          .filter(([, v]) => v)
          .map(([id]) => id),
      });
      if (res.error) setError(res.error);
      else {
        toast.success(
          res.rewards ? `تم إتمام الزيارة وإضافة جلسات الهدية لرصيد المريض` : "تم إتمام الزيارة"
        );
        onCompleted();
        onClose();
      }
    });
  }

  return (
    <Modal open={open} onClose={onClose} title="إتمام الزيارة" width="max-w-2xl">
      {loadError ? (
        <Alert variant="destructive">{loadError}</Alert>
      ) : !draft ? (
        <div className="flex justify-center py-10">
          <Spinner />
        </div>
      ) : (
        <div className="space-y-5">
          <p className="font-sans text-sm text-muted-foreground">
            {draft.patientName} · {draft.doctorName}
          </p>
          {error && <Alert variant="destructive">{error}</Alert>}

          <div className="divide-y divide-border rounded-xl border border-border">
            {draft.lines.map((l) => (
              <LineRow
                key={l.itemId}
                line={l}
                state={lines[l.itemId]}
                onChange={(patch) => patchLine(l.itemId, patch)}
              />
            ))}
          </div>

          {/* Added on the spot */}
          {added.map((a) => {
            const s = addableById.get(a.serviceId);
            const pkg = s?.packages.find((p) => p.patientPackageId === a.patientPackageId);
            const needsQty = pkg
              ? pkg.creditType === "UNITS"
              : s
                ? UNIT_PRICED.has(s.pricingType)
                : false;
            const needsPrice = !pkg && s ? PRICE_NEEDED.has(s.pricingType) : false;
            return (
              <div
                key={a.key}
                className="space-y-3 rounded-xl border border-dashed border-border p-3"
              >
                <div className="flex flex-wrap items-end gap-3">
                  <FormField
                    type="select"
                    label="خدمة إضافية"
                    placeholder="اختر الخدمة"
                    value={a.serviceId}
                    onValueChange={(v) => patchAdded(a.key, { serviceId: v, patientPackageId: "" })}
                    options={(draft.addable ?? [])
                      .filter((x) => x.id === a.serviceId || !existingServiceIds.has(x.id))
                      .map((x) => ({ value: x.id, label: x.name }))}
                    className="min-w-52 flex-1"
                  />
                  {s && s.packages.length > 0 && (
                    <FormField
                      type="select"
                      label="الدفع"
                      value={a.patientPackageId || "_normal"}
                      onValueChange={(v) =>
                        patchAdded(a.key, { patientPackageId: v === "_normal" ? "" : v })
                      }
                      options={[
                        { value: "_normal", label: "دفع عادي" },
                        ...s.packages.map((p) => ({
                          value: p.patientPackageId,
                          label: `من باقة ${p.name} (متبقٍ ${p.available})`,
                        })),
                      ]}
                      className="w-56"
                    />
                  )}
                  <Button
                    type="button"
                    variant="ghost-destructive"
                    size="icon"
                    aria-label="حذف"
                    onClick={() => setAdded((p) => p.filter((x) => x.key !== a.key))}
                  >
                    <Trash2 />
                  </Button>
                </div>
                {needsQty && (
                  <FormField
                    type="number"
                    min={0}
                    label={`الكمية المستخدمة${s?.unitLabel ? ` (${s.unitLabel})` : ""} *`}
                    value={a.quantity}
                    onValueChange={(v) => patchAdded(a.key, { quantity: v })}
                    className="w-48"
                  />
                )}
                {needsPrice && (
                  <FormField
                    type="number"
                    min={0}
                    step="0.01"
                    label="السعر النهائي *"
                    value={a.price}
                    onValueChange={(v) => patchAdded(a.key, { price: v })}
                    className="w-48"
                  />
                )}
              </div>
            );
          })}
          {draft.addable.length > 0 && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                setAdded((p) => [
                  ...p,
                  { key: Date.now(), serviceId: "", patientPackageId: "", quantity: "", price: "" },
                ])
              }
            >
              <Plus />
              إضافة خدمة تمت في الزيارة
            </Button>
          )}

          {draft.unpaidPackages.length > 0 && (
            <div className="space-y-2 rounded-xl border border-amber-200 bg-amber-50 p-3">
              <p className="font-sans text-sm font-medium text-amber-800">
                باقات لم يُدفع ثمنها بعد
              </p>
              {draft.unpaidPackages.map((p) => (
                <FormField
                  key={p.id}
                  type="checkbox"
                  label={`تم استلام ثمن «${p.name}» (${formatFee(p.pricePaid)})`}
                  checked={paid[p.id] ?? false}
                  onCheckedChange={(c) => setPaid((x) => ({ ...x, [p.id]: c }))}
                />
              ))}
            </div>
          )}

          <div className="flex gap-3 pt-1">
            <Button onClick={submit} loading={isPending} variant="success" className="flex-1">
              {isPending ? "جارٍ الحفظ..." : "إتمام الزيارة"}
            </Button>
            <Button type="button" variant="outline" onClick={onClose}>
              إلغاء
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}

function LineRow({
  line,
  state,
  onChange,
}: {
  line: CompletionLine;
  state: LineState | undefined;
  onChange: (patch: Partial<LineState>) => void;
}) {
  const removed = state?.remove ?? false;
  const declined = line.needsDecision && state?.decision === "DECLINED";
  const showInputs = !removed && !declined;
  const qty = Number(state?.quantity || 0);
  const pkg = line.package;
  const over = pkg && line.input === "units" && qty > pkg.available ? qty - pkg.available : 0;
  return (
    <div className={removed ? "bg-muted/40 px-4 py-3 opacity-60" : "px-4 py-3"}>
      <div className="flex flex-wrap items-center gap-2">
        <span className={removed ? "font-sans font-medium line-through" : "font-sans font-medium"}>
          {line.serviceName}
        </span>
        {pkg ? (
          <Badge variant="violet">
            من باقة {pkg.name}
            {pkg.creditType === "SESSIONS" ? " · تُخصم جلسة" : ""}
          </Badge>
        ) : (
          line.total != null &&
          line.input !== "quantity" &&
          line.input !== "price" && <Badge variant="muted">{formatFee(line.total)}</Badge>
        )}
        {line.offerLabel && <Badge variant="accent">{line.offerLabel}</Badge>}
        {line.isPreCheck && <Badge variant="info">فحص مسبق</Badge>}
        {line.needsDecision && <Badge variant="warning">تحتاج موافقة الطبيب</Badge>}
        <span className="flex-1" />
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => onChange({ remove: !removed })}
          className={removed ? undefined : "text-muted-foreground hover:text-red-600"}
        >
          {removed ? <Undo2 /> : <Trash2 />}
          {removed ? "تراجع" : "لم تتم"}
        </Button>
      </div>

      {!removed && line.needsDecision && (
        <div className="mt-2 space-y-2">
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant={state?.decision === "APPROVED" ? "success" : "outline"}
              onClick={() => onChange({ decision: "APPROVED" })}
            >
              <Check />
              وافق الطبيب — تمت الخدمة
            </Button>
            <Button
              type="button"
              size="sm"
              variant={state?.decision === "DECLINED" ? "destructive" : "outline"}
              onClick={() => onChange({ decision: "DECLINED" })}
            >
              <X />
              رفض الطبيب — يُحاسب على الفحص فقط
            </Button>
          </div>
          {declined && (
            <FormField
              type="text"
              label="سبب الرفض (اختياري)"
              value={state?.note ?? ""}
              onValueChange={(v) => onChange({ note: v })}
            />
          )}
        </div>
      )}

      {showInputs && (line.input === "quantity" || line.input === "units") && (
        <div className="mt-2 flex flex-wrap items-end gap-3">
          <FormField
            type="number"
            min={0}
            label={`الكمية المستخدمة فعلياً${line.unitLabel ? ` (${line.unitLabel})` : ""} *`}
            value={state?.quantity ?? ""}
            onValueChange={(v) => onChange({ quantity: v })}
            className="w-56"
          />
          {pkg && line.input === "units" && (
            <p className="pb-2 font-sans text-xs text-muted-foreground">
              الرصيد: {pkg.available} → {Math.max(0, pkg.available - qty)}
              {over > 0 && (
                <span className="text-amber-700">
                  {" "}
                  · {over} غير مغطاة بالباقة (تُسجَّل ولا تُحاسب)
                </span>
              )}
            </p>
          )}
          {!pkg && line.unitPrice != null && line.pricingType === "PER_UNIT" && (
            <p className="pb-2 font-sans text-xs text-muted-foreground">
              الإجمالي: {formatFee(Math.round(line.unitPrice * qty * 100) / 100)}
            </p>
          )}
        </div>
      )}
      {showInputs && line.input === "price" && (
        <FormField
          type="number"
          min={0}
          step="0.01"
          label="السعر النهائي *"
          value={state?.price ?? ""}
          onValueChange={(v) => onChange({ price: v })}
          className="mt-2 w-56"
        />
      )}
    </div>
  );
}
