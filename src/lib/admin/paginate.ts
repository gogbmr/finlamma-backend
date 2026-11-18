// In-memory search/sort/filter/pagination for admin "small catalog" list
// pages (worlds, mentors, badges, rewards, competitions, instruments,
// coach-notes, staff) that already call an existing listAll*() repo
// function and hold a small, bounded row count in practice. This is
// deliberately NOT a database query - the page keeps calling the same
// listAll*() it always has (never edited for this), and this only slices
// that result before it reaches the client. Growing tables (lessons,
// questions, news) get a different, DB-level treatment instead - see
// CLAUDE.md's shared-service-boundary rule: this file is never imported by
// /api/v1/*, so it carries no risk to the mobile contract either way.
export type SortDir = "asc" | "desc";

export interface AdminPageParams {
  q: string;
  sort: string | null;
  dir: SortDir;
  page: number;
  pageSize: number;
}

export const ADMIN_DEFAULT_PAGE_SIZE = 20;
export const ADMIN_MAX_PAGE_SIZE = 100;
// A fat-finger/garbage-URL guard, not a product limit - no real admin
// search phrase needs to be longer than this, and it keeps a hand-edited
// or malformed ?q= from doing an unbounded .includes() scan per row.
export const ADMIN_MAX_SEARCH_QUERY_LENGTH = 200;

function firstValue(v: string | string[] | undefined): string | null {
  return Array.isArray(v) ? (v[0] ?? null) : (v ?? null);
}

// Reads ?q=&sort=&dir=&page=&pageSize= from a page's (already-awaited)
// searchParams object. Never throws on a bad/missing value - unlike the
// API's parseLimit (src/lib/http.ts), this only drives a client-side slice
// of staff-only data already fetched for this request, not a DB query, so
// silently falling back to a sane default is safer than rejecting a
// bookmarked or hand-edited admin URL. `allowedSorts` whitelists ?sort= -
// an unrecognized value falls back to `defaultSort` (never "silently
// unsorted", which is what omitting this check would do, since
// paginateRows's comparators[sort] lookup would just miss and skip
// sorting entirely).
export function readPageParams(
  searchParams: Record<string, string | string[] | undefined>,
  options?: { defaultSort?: string; allowedSorts?: readonly string[] },
): AdminPageParams {
  const page = Math.max(1, Number(firstValue(searchParams.page)) || 1);
  const rawPageSize =
    Number(firstValue(searchParams.pageSize)) || ADMIN_DEFAULT_PAGE_SIZE;
  const pageSize = Math.min(Math.max(1, rawPageSize), ADMIN_MAX_PAGE_SIZE);
  const dir: SortDir = firstValue(searchParams.dir) === "desc" ? "desc" : "asc";

  const rawSort = firstValue(searchParams.sort);
  const sort =
    rawSort && (!options?.allowedSorts || options.allowedSorts.includes(rawSort))
      ? rawSort
      : options?.defaultSort ?? null;

  const rawQ = firstValue(searchParams.q)?.trim() ?? "";

  return {
    q: rawQ.slice(0, ADMIN_MAX_SEARCH_QUERY_LENGTH),
    sort,
    dir,
    page,
    pageSize,
  };
}

export interface PaginateOptions<T> {
  search: string;
  searchText: (row: T) => string;
  // Applied before search - e.g. a status quick-filter. Entity-specific, so
  // the caller builds the predicate; this just runs it.
  filter?: (row: T) => boolean;
  sort: string | null;
  dir: SortDir;
  comparators: Record<string, (a: T, b: T) => number>;
  page: number;
  pageSize: number;
}

export interface PaginatedRows<T> {
  rows: T[];
  total: number;
  pageCount: number;
  page: number;
  pageSize: number;
}

export function paginateRows<T>(
  allRows: T[],
  opts: PaginateOptions<T>,
): PaginatedRows<T> {
  let rows = opts.filter ? allRows.filter(opts.filter) : allRows;

  const q = opts.search.trim().toLowerCase();
  if (q) {
    rows = rows.filter((row) => opts.searchText(row).toLowerCase().includes(q));
  }

  const comparator = opts.sort ? opts.comparators[opts.sort] : undefined;
  if (comparator) {
    rows = [...rows].sort((a, b) =>
      opts.dir === "desc" ? comparator(b, a) : comparator(a, b),
    );
  }

  const total = rows.length;
  const pageCount = Math.max(1, Math.ceil(total / opts.pageSize));
  const page = Math.min(Math.max(1, opts.page), pageCount);
  const start = (page - 1) * opts.pageSize;

  return {
    rows: rows.slice(start, start + opts.pageSize),
    total,
    pageCount,
    page,
    pageSize: opts.pageSize,
  };
}
