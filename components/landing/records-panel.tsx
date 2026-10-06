"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import RecordTimeline from "@/components/medical/record-timeline";
import type { TreatmentRecordView } from "@/server/services/treatments";
import { Button } from "@/components/ui/button";

// The patient's treatment record on the landing page: the first `initial` visits,
// with the rest revealed in place — so the full clinical history lives here
// instead of on a removed dashboard page. Records are plain-serializable
// (Decimal → string, Dates), so they cross to the client as data.
export function RecordsPanel({
  records,
  initial = 10,
}: {
  records: TreatmentRecordView[];
  initial?: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const remaining = records.length - initial;
  const shown = expanded ? records : records.slice(0, initial);

  return (
    <div>
      <RecordTimeline
        records={shown}
        emptyMessage="لا يوجد سجل علاجي بعد"
        appointmentBasePath="/appointments"
      />
      {remaining > 0 && !expanded && (
        <Button
          type="button"
          variant="link"
          onClick={() => setExpanded(true)}
          className="mt-4 h-auto gap-1 px-0"
        >
          عرض المزيد ({remaining})
          <ChevronDown />
        </Button>
      )}
    </div>
  );
}
