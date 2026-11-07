"use client";

import { useEffect, useRef } from "react";
import { Loader2 } from "lucide-react";

/**
 * Sentinel placed after the last item of an incrementally loaded list: when it
 * scrolls into view, the next page is requested. Works inside nested scroll
 * areas too (board columns, the inbox) — the observer sees the clipped rect.
 * Pair with `useLoadMore`.
 */
export function InfiniteScroll({
  onLoadMore,
  hasMore,
  loading,
  error,
  className = "",
  as: Tag = "div",
}: {
  onLoadMore: () => void;
  hasMore: boolean;
  loading: boolean;
  error?: boolean;
  className?: string;
  /** "tr" when the sentinel sits inside a <tbody>. */
  as?: "div" | "li" | "tr";
}) {
  const ref = useRef<HTMLElement>(null);
  // Latest callback without re-creating the observer on every render.
  const loadRef = useRef(onLoadMore);
  loadRef.current = onLoadMore;

  useEffect(() => {
    const el = ref.current;
    if (!el || !hasMore || loading || error) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) loadRef.current();
      },
      // Start fetching a little before the end is actually reached.
      { rootMargin: "200px" }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasMore, loading, error]);

  if (!hasMore) return null;

  const body = error ? (
    <button
      type="button"
      onClick={() => loadRef.current()}
      className="font-sans text-xs text-red-600 hover:underline"
    >
      تعذّر التحميل — اضغط لإعادة المحاولة
    </button>
  ) : (
    <Loader2
      className={`h-5 w-5 animate-spin text-muted-foreground ${loading ? "" : "opacity-0"}`}
    />
  );

  if (Tag === "tr") {
    return (
      <tr ref={ref as React.RefObject<HTMLTableRowElement>}>
        <td colSpan={100} className={`py-3 ${className}`}>
          <div className="flex justify-center">{body}</div>
        </td>
      </tr>
    );
  }
  return (
    <Tag
      ref={ref as React.RefObject<HTMLDivElement & HTMLLIElement>}
      className={`flex justify-center py-3 ${className}`}
    >
      {body}
    </Tag>
  );
}
