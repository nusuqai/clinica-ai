import { Progress } from "@/components/ui/progress";
import type { AiCostBreakdown, CostSlice } from "@/server/services/aiReports";

// Platform-only: where the raw OpenAI USD went — by kind of AI call, and within
// agent replies, context (input) vs. generation (output). Shares, not just
// dollars, because the question this answers is "what is eating the cost?".

// A slice is a fraction of a cent more often than not, so dollars need more
// precision than a balance would.
const usd = (n: number) =>
  `$${n.toLocaleString("en-US", { minimumFractionDigits: 4, maximumFractionDigits: 6 })}`;

const pct = (share: number) =>
  `${(share * 100).toLocaleString("en-US", { maximumFractionDigits: 1 })}%`;

const count = (n: number) => n.toLocaleString("en-US");

export default function CostBreakdown({ breakdown }: { breakdown: AiCostBreakdown }) {
  if (breakdown.totalUsd <= 0) {
    return (
      <p className="font-sans text-sm text-muted-foreground">
        لا توجد تكلفة مسجلة خلال هذه الفترة.
      </p>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
      <div>
        <p className="mb-3 font-sans text-xs font-medium text-muted-foreground">
          حسب نوع العملية — من إجمالي {usd(breakdown.totalUsd)}
        </p>
        <SliceList slices={breakdown.byKind} color="bg-primary" />
      </div>

      <div>
        <p className="mb-3 font-sans text-xs font-medium text-muted-foreground">
          داخل ردود المساعد — من {usd(breakdown.replyUsd)}
        </p>
        {breakdown.replyUsd > 0 ? (
          <SliceList slices={breakdown.reply} color="bg-accent" />
        ) : (
          <p className="font-sans text-sm text-muted-foreground">لا توجد ردود خلال هذه الفترة.</p>
        )}
      </div>
    </div>
  );
}

function SliceList({ slices, color }: { slices: CostSlice[]; color: string }) {
  return (
    <div className="space-y-3">
      {slices.map((s) => (
        <div key={s.key} className="space-y-1">
          <div className="flex items-center justify-between gap-3 font-sans text-sm">
            <span className="text-foreground">{s.label}</span>
            <div className="flex items-center gap-2" dir="ltr">
              <span className="text-xs text-muted-foreground">
                {usd(s.usd)}
                {s.calls !== undefined && ` · ${count(s.calls)} عملية`}
              </span>
              <span className="font-medium text-foreground">{pct(s.share)}</span>
            </div>
          </div>
          <Progress
            value={Math.round(s.share * 100)}
            className="bg-muted"
            indicatorClassName={`rounded-full ${color} duration-500`}
          />
        </div>
      ))}
    </div>
  );
}
