import { ADMIN_MAX_SEARCH_QUERY_LENGTH } from "./paginate";

// Escapes Postgres ILIKE/LIKE metacharacters (%, _, and the backslash
// escape character itself) in untrusted search input, so a search for a
// literal "50%" or "quiz_1" isn't silently interpreted as a wildcard. This
// only makes the pattern's special characters literal - it is NOT by
// itself what prevents SQL injection; the caller still must pass the
// result as a bound parameter (e.g. drizzle's `ilike(column, value)`),
// never string-concatenate it into raw SQL text.
export function escapeLikeMetacharacters(raw: string): string {
  return raw.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}

// Builds a "contains" ILIKE pattern from untrusted search text: capped to
// ADMIN_MAX_SEARCH_QUERY_LENGTH, metacharacter-escaped, then wrapped in
// %...%. Used by the growing-table admin queries (questions, news) that
// search a real DB column/jsonb path instead of the in-memory
// paginateRows search the small catalogs (Task 3a) use.
export function buildContainsPattern(raw: string): string {
  const capped = raw.slice(0, ADMIN_MAX_SEARCH_QUERY_LENGTH);
  return `%${escapeLikeMetacharacters(capped)}%`;
}
