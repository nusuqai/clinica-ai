"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { upsertById, type Paginated } from "@/lib/pagination";

/**
 * An incrementally loaded list: starts from a server-rendered first page and
 * appends the next one on demand through `fetchPage` (a server action).
 * Re-syncs when the server hands in a fresh first page (router.refresh).
 *
 * Filters kept in the URL re-render the page, which hands in a new `initial`.
 * Filters kept in local state instead pass `filterKey` (e.g. JSON of them):
 * when it changes, page 1 is refetched here and replaces the list.
 */
export function useLoadMore<T extends { id: string }>(
  initial: Paginated<T>,
  fetchPage: (page: number) => Promise<Paginated<T>>,
  filterKey?: string
) {
  const [items, setItems] = useState(initial.items);
  const [page, setPage] = useState(initial.page);
  const [total, setTotal] = useState(initial.total);
  const [hasMore, setHasMore] = useState(initial.hasMore);
  const [error, setError] = useState(false);
  const [loading, startLoading] = useTransition();

  useEffect(() => {
    setItems(initial.items);
    setPage(initial.page);
    setTotal(initial.total);
    setHasMore(initial.hasMore);
  }, [initial]);

  // Local filters changed: replace the list with their first page. Ignores a
  // response that arrives after the filters moved on again.
  const firstKey = useRef(filterKey);
  const latestKey = useRef(filterKey);
  useEffect(() => {
    latestKey.current = filterKey;
    if (filterKey === firstKey.current) return;
    firstKey.current = undefined; // once changed, every later change refetches
    setError(false);
    startLoading(async () => {
      try {
        const first = await fetchPage(1);
        if (latestKey.current !== filterKey) return;
        setItems(first.items);
        setPage(first.page);
        setTotal(first.total);
        setHasMore(first.hasMore);
      } catch {
        setError(true);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refetch on key change only
  }, [filterKey]);

  const loadMore = useCallback(() => {
    if (!hasMore || loading) return;
    setError(false);
    const key = latestKey.current;
    startLoading(async () => {
      try {
        const next = await fetchPage(page + 1);
        if (latestKey.current !== key) return; // filters changed meanwhile
        setItems((prev) => upsertById(prev, next.items));
        setPage(next.page);
        setTotal(next.total);
        setHasMore(next.hasMore);
      } catch {
        setError(true);
      }
    });
  }, [fetchPage, hasMore, loading, page]);

  return { items, setItems, total, hasMore, loading, error, loadMore };
}
