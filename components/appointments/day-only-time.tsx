import { DAY_ONLY_PENDING_TIME_AR } from "@/lib/availability/modes";

/**
 * The time cell of a day-only booking (حجز يوم فقط) in lists and cards: the
 * time the clinic team set, or an amber "waiting for a time" tag.
 */
export default function DayOnlyTime({
  time,
  className,
}: {
  time: string | null;
  className?: string;
}) {
  return time ? (
    <span dir="ltr" className={className}>
      {time}
    </span>
  ) : (
    <span dir="rtl" className={`text-amber-700 ${className ?? ""}`}>
      {DAY_ONLY_PENDING_TIME_AR}
    </span>
  );
}
