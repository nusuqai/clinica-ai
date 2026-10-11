"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

/**
 * A filter value kept in the URL (`?key=value`), so the server renders the
 * matching first page of a paginated list. The input updates immediately; the
 * URL follows after `debounceMs` (for typing). Empty clears the param.
 */
export function useQueryParam(key: string, debounceMs = 0): [string, (value: string) => void] {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const urlValue = searchParams.get(key) ?? "";
  const [value, setValue] = useState(urlValue);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Follow external URL changes (back/forward, another filter clearing this one).
  useEffect(() => setValue(urlValue), [urlValue]);
  useEffect(() => () => clearTimeout(timer.current), []);

  function update(next: string) {
    setValue(next);
    clearTimeout(timer.current);
    const push = () => {
      const params = new URLSearchParams(window.location.search);
      if (next.trim()) params.set(key, next.trim());
      else params.delete(key);
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    };
    if (debounceMs > 0) timer.current = setTimeout(push, debounceMs);
    else push();
  }

  return [value, update];
}
