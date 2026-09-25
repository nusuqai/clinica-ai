"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  setClinicMarkupAction,
  topUpClinicUnitsAction,
  adjustClinicUnitsAction,
  setClinicLowUnitsThresholdAction,
} from "@/server/actions/platformCredits";

const inputCls =
  "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground";

interface Props {
  clinicId: string;
  currentMarkup: number;
  currentLowUnitsThreshold: number;
}

/**
 * Platform-admin controls for one clinic's AI allowance.
 *
 * UNITS are the only thing granted here — 1000 units buys the clinic 1000 agent
 * replies. There is deliberately no dollar top-up: the USD figures elsewhere on
 * this page are cost telemetry, not a balance anyone funds.
 *
 * Unit counts are sent as strings and parsed to integers server-side; the markup
 * is parsed to Decimal — never a float.
 */
export default function CreditManager({
  clinicId,
  currentMarkup,
  currentLowUnitsThreshold,
}: Props) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [markup, setMarkup] = useState(String(currentMarkup));
  const [unitTopUp, setUnitTopUp] = useState("");
  const [unitAdjust, setUnitAdjust] = useState("");
  const [lowUnits, setLowUnits] = useState(String(currentLowUnitsThreshold));
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const run = (fn: () => Promise<{ ok: boolean; message?: string }>, okText: string) =>
    start(async () => {
      setMsg(null);
      const res = await fn();
      if (res.ok) {
        setMsg({ ok: true, text: okText });
        setUnitTopUp("");
        setUnitAdjust("");
        router.refresh();
      } else {
        setMsg({ ok: false, text: res.message ?? "تعذّر تنفيذ العملية." });
      }
    });

  return (
    <div className="space-y-3">
      {/* Units — the clinic's meter. */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {/* Grant units */}
        <div className="flex gap-2">
          <input
            value={unitTopUp}
            onChange={(e) => setUnitTopUp(e.target.value)}
            placeholder="إضافة وحدات"
            className={inputCls}
            dir="ltr"
            inputMode="numeric"
          />
          <button
            disabled={pending || !unitTopUp.trim()}
            onClick={() =>
              run(
                () => topUpClinicUnitsAction({ clinicId, units: unitTopUp }),
                "تمت إضافة الوحدات."
              )
            }
            className="flex-shrink-0 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
          >
            إضافة
          </button>
        </div>

        {/* Adjust units (signed) */}
        <div className="flex gap-2">
          <input
            value={unitAdjust}
            onChange={(e) => setUnitAdjust(e.target.value)}
            placeholder="تعديل وحدات ±"
            className={inputCls}
            dir="ltr"
            inputMode="numeric"
          />
          <button
            disabled={pending || !unitAdjust.trim()}
            onClick={() =>
              run(
                () => adjustClinicUnitsAction({ clinicId, units: unitAdjust }),
                "تم تعديل الوحدات."
              )
            }
            className="flex-shrink-0 rounded-lg border border-border px-3 py-2 text-sm font-medium text-foreground hover:bg-muted disabled:opacity-50"
          >
            تعديل
          </button>
        </div>

        {/* Low-units warning threshold */}
        <div className="flex gap-2">
          <input
            value={lowUnits}
            onChange={(e) => setLowUnits(e.target.value)}
            placeholder="حد التنبيه (وحدات)"
            className={inputCls}
            dir="ltr"
            inputMode="numeric"
          />
          <button
            disabled={pending || !lowUnits.trim()}
            onClick={() =>
              run(
                () => setClinicLowUnitsThresholdAction({ clinicId, threshold: lowUnits }),
                "تم تحديث حد التنبيه."
              )
            }
            className="flex-shrink-0 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
          >
            حفظ
          </button>
        </div>
      </div>

      {msg && (
        <p className={`text-xs ${msg.ok ? "text-emerald-600" : "text-red-600"}`}>{msg.text}</p>
      )}
    </div>
  );
}
