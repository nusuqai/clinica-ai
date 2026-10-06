"use client";

import { createElement, useState } from "react";
import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";

// A list that shows the first `initial` items and reveals the rest in place on
// demand — so the patient sees their full history on the landing page without a
// separate "view all" screen. The items are server-rendered and handed in as
// nodes; this component only owns how many are visible.
export function ShowMore({
  items,
  initial = 10,
  as = "ul",
  className,
  moreLabel = "عرض المزيد",
}: {
  items: React.ReactNode[];
  initial?: number;
  /** The list element to render the visible items into. */
  as?: "ul" | "ol" | "div";
  className?: string;
  moreLabel?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const remaining = items.length - initial;
  const visible = expanded ? items : items.slice(0, initial);

  return (
    <div>
      {createElement(as, { className }, visible)}
      {remaining > 0 && !expanded && (
        <Button
          type="button"
          variant="link"
          onClick={() => setExpanded(true)}
          className="mt-3 h-auto gap-1 px-0"
        >
          {moreLabel} ({remaining})
          <ChevronDown />
        </Button>
      )}
    </div>
  );
}
