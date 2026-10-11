// Shared pagination primitives. One model everywhere: offset pages described by
// `PageRequest`, results returned as `Paginated<T>`. A page renders page 1 on
// the server; the client list (`useLoadMore` + <InfiniteScroll>) fetches the
// following pages through a server action as the user scrolls.
// Isomorphic on purpose — the types and helpers are used on both sides.

export const DEFAULT_PAGE_SIZE = 20;
/** Upper bound for any caller-supplied page size (server actions are public). */
export const MAX_PAGE_SIZE = 200;

export interface PageRequest {
  /** 1-based. */
  page: number;
  pageSize: number;
  /**
   * Explicit row offset, overriding `page`. For lists edited in place (the
   * appointments board moves cards between columns): "the next rows after the
   * N I already show" stays right where a page number would drift.
   */
  offset?: number;
}

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
  hasMore: boolean;
}

function clampSize(pageSize: number): number {
  return Math.min(Math.max(Math.trunc(pageSize) || DEFAULT_PAGE_SIZE, 1), MAX_PAGE_SIZE);
}

/** Clamp an untrusted page request (server actions are callable by anyone). */
export function pageRequest(page?: number, pageSize: number = DEFAULT_PAGE_SIZE): PageRequest {
  const p = Math.max(Math.trunc(page ?? 1) || 1, 1);
  return { page: p, pageSize: clampSize(pageSize) };
}

/** Clamp an untrusted offset request: the `pageSize` rows after the first `offset`. */
export function offsetRequest(offset: number, pageSize: number = DEFAULT_PAGE_SIZE): PageRequest {
  const size = clampSize(pageSize);
  const o = Math.max(Math.trunc(offset) || 0, 0);
  return { page: Math.floor(o / size) + 1, pageSize: size, offset: o };
}

/** Prisma `skip`/`take` for a page. */
export function pageArgs({ page, pageSize, offset }: PageRequest): { skip: number; take: number } {
  return { skip: offset ?? (page - 1) * pageSize, take: pageSize };
}

export function toPaginated<T>(items: T[], total: number, req: PageRequest): Paginated<T> {
  const pageCount = Math.max(1, Math.ceil(total / req.pageSize));
  return {
    items,
    total,
    page: req.page,
    pageSize: req.pageSize,
    pageCount,
    hasMore: pageArgs(req).skip + items.length < total,
  };
}

/**
 * Run a page query and its count together.
 *
 *   paginate(req, (args) => prisma.x.findMany({ where, ...args }), () => prisma.x.count({ where }))
 */
export async function paginate<T>(
  req: PageRequest,
  fetchPage: (args: { skip: number; take: number }) => Promise<T[]>,
  count: () => Promise<number>
): Promise<Paginated<T>> {
  const [items, total] = await Promise.all([fetchPage(pageArgs(req)), count()]);
  return toPaginated(items, total, req);
}

/** Map a page's items, keeping its metadata. */
export function mapPage<T, U>(page: Paginated<T>, fn: (item: T) => U): Paginated<U> {
  return { ...page, items: page.items.map(fn) };
}

/**
 * Merge freshly fetched items into a loaded list by id: existing rows are
 * replaced in place, new ones appended (or prepended). Offset pages over live
 * data can overlap when rows are added meanwhile — this keeps each row once.
 */
export function upsertById<T extends { id: string }>(
  current: T[],
  incoming: T[],
  where: "append" | "prepend" = "append"
): T[] {
  const byId = new Map(incoming.map((item) => [item.id, item]));
  const merged = current.map((item) => byId.get(item.id) ?? item);
  const known = new Set(current.map((item) => item.id));
  const added = incoming.filter((item) => !known.has(item.id));
  return where === "append" ? [...merged, ...added] : [...added, ...merged];
}
