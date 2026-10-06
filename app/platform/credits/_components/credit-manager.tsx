"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  setClinicMarkupAction,
  topUpClinicUnitsAction,
  adjustClinicUnitsAction,
  setClinicLowUnitsThresholdAction,
} from "@/server/actions/platformCredits";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";

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
          <FormField
            value={unitTopUp}
            onValueChange={setUnitTopUp}
            placeholder="إضافة وحدات"
            dir="ltr"
            inputMode="numeric"
            className="flex-1"
          />
          <Button
            variant="success"
            disabled={pending || !unitTopUp.trim()}
            onClick={() =>
              run(
                () => topUpClinicUnitsAction({ clinicId, units: unitTopUp }),
                "تمت إضافة الوحدات."
              )
            }
            className="shrink-0"
          >
            إضافة
          </Button>
        </div>

        {/* Adjust units (signed) */}
        <div className="flex gap-2">
          <FormField
            value={unitAdjust}
            onValueChange={setUnitAdjust}
            placeholder="تعديل وحدات ±"
            dir="ltr"
            inputMode="numeric"
            className="flex-1"
          />
          <Button
            variant="outline"
            disabled={pending || !unitAdjust.trim()}
            onClick={() =>
              run(
                () => adjustClinicUnitsAction({ clinicId, units: unitAdjust }),
                "تم تعديل الوحدات."
              )
            }
            className="shrink-0"
          >
            تعديل
          </Button>
        </div>

        {/* Low-units warning threshold */}
        <div className="flex gap-2">
          <FormField
            value={lowUnits}
            onValueChange={setLowUnits}
            placeholder="حد التنبيه (وحدات)"
            dir="ltr"
            inputMode="numeric"
            className="flex-1"
          />
          <Button
            disabled={pending || !lowUnits.trim()}
            onClick={() =>
              run(
                () => setClinicLowUnitsThresholdAction({ clinicId, threshold: lowUnits }),
                "تم تحديث حد التنبيه."
              )
            }
            className="shrink-0"
          >
            حفظ
          </Button>
        </div>
      </div>

      {msg && (
        <p className={`text-xs ${msg.ok ? "text-emerald-600" : "text-red-600"}`}>{msg.text}</p>
      )}
    </div>
  );
}
