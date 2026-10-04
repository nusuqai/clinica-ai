"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { upsertById, type Paginated } from "@/lib/pagination";

/**
 * An incrementally loaded list: starts from a server-rendered first page and
 * appends the next one on demand through `fetchPage` (a server action).
 * Re-syncs when the server hands in a fresh first page (router.refresh).
 */
export function useLoadMore<T extends { id: string }>(
  initial: Paginated<T>,
  fetchPage: (page: number) => Promise<Paginated<T>>
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

  const loadMore = useCallback(() => {
    if (!hasMore || loading) return;
    setError(false);
    startLoading(async () => {
      try {
        const next = await fetchPage(page + 1);
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
