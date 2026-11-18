import { describe, expect, it } from "vitest";
import {
  ADMIN_DEFAULT_PAGE_SIZE,
  ADMIN_MAX_PAGE_SIZE,
  ADMIN_MAX_SEARCH_QUERY_LENGTH,
  paginateRows,
  readPageParams,
} from "./paginate";

type Row = { id: string; name: string; order: number; status: "draft" | "published" };

function row(overrides: Partial<Row>): Row {
  return { id: "1", name: "a", order: 0, status: "draft", ...overrides };
}

const COMPARATORS = {
  order: (a: Row, b: Row) => a.order - b.order,
  name: (a: Row, b: Row) => a.name.localeCompare(b.name),
};

describe("readPageParams", () => {
  it("defaults when nothing is provided", () => {
    expect(readPageParams({})).toEqual({
      q: "",
      sort: null,
      dir: "asc",
      page: 1,
      pageSize: ADMIN_DEFAULT_PAGE_SIZE,
    });
  });

  it("falls back to defaultSort when ?sort= isn't in the allow-list", () => {
    const result = readPageParams(
      { sort: "nonsense" },
      { defaultSort: "order", allowedSorts: ["order", "name"] },
    );
    expect(result.sort).toBe("order");
  });

  it("accepts a whitelisted sort column", () => {
    const result = readPageParams(
      { sort: "name" },
      { defaultSort: "order", allowedSorts: ["order", "name"] },
    );
    expect(result.sort).toBe("name");
  });

  it("without an allow-list, passes ?sort= through as-is (caller opted out of whitelisting)", () => {
    expect(readPageParams({ sort: "whatever" }).sort).toBe("whatever");
  });

  it("clamps pageSize to ADMIN_MAX_PAGE_SIZE", () => {
    expect(readPageParams({ pageSize: "99999" }).pageSize).toBe(ADMIN_MAX_PAGE_SIZE);
  });

  it("treats a non-numeric or negative page as page 1", () => {
    expect(readPageParams({ page: "-5" }).page).toBe(1);
    expect(readPageParams({ page: "abc" }).page).toBe(1);
  });

  it("caps an overly long q to ADMIN_MAX_SEARCH_QUERY_LENGTH", () => {
    const longQ = "a".repeat(500);
    expect(readPageParams({ q: longQ }).q).toHaveLength(ADMIN_MAX_SEARCH_QUERY_LENGTH);
  });

  it("reads the first value when a param arrives as an array", () => {
    expect(readPageParams({ q: ["first", "second"] }).q).toBe("first");
  });

  it("trims whitespace from q", () => {
    expect(readPageParams({ q: "  hello  " }).q).toBe("hello");
  });
});

describe("paginateRows", () => {
  const rows = [
    row({ id: "1", name: "Zebra", order: 3, status: "draft" }),
    row({ id: "2", name: "Apple", order: 1, status: "published" }),
    row({ id: "3", name: "Mango", order: 2, status: "published" }),
  ];

  function paginate(overrides: Partial<Parameters<typeof paginateRows<Row>>[1]>) {
    return paginateRows(rows, {
      search: "",
      searchText: (r) => r.name,
      sort: null,
      dir: "asc",
      comparators: COMPARATORS,
      page: 1,
      pageSize: 20,
      ...overrides,
    });
  }

  it("searches using the caller's searchText across every row", () => {
    const result = paginate({ search: "zeb" });
    expect(result.rows.map((r) => r.id)).toEqual(["1"]);
    expect(result.total).toBe(1);
  });

  it("search is case-insensitive", () => {
    const result = paginate({ search: "MANGO" });
    expect(result.rows.map((r) => r.id)).toEqual(["3"]);
  });

  it("an empty search returns every row", () => {
    expect(paginate({ search: "" }).total).toBe(3);
  });

  it("sorts ascending and descending by the named comparator", () => {
    const asc = paginate({ sort: "order", dir: "asc" });
    expect(asc.rows.map((r) => r.id)).toEqual(["2", "3", "1"]);

    const desc = paginate({ sort: "order", dir: "desc" });
    expect(desc.rows.map((r) => r.id)).toEqual(["1", "3", "2"]);
  });

  it("an unrecognized sort key is a no-op, not a crash", () => {
    const result = paginate({ sort: "not_a_real_column" });
    expect(result.rows).toHaveLength(3);
  });

  it("applies the filter predicate before search/sort/pagination (the status-quick-filter shape)", () => {
    const result = paginate({ filter: (r) => r.status === "published" });
    expect(result.total).toBe(2);
    expect(result.rows.every((r) => r.status === "published")).toBe(true);
  });

  it("combines filter and search", () => {
    const result = paginate({ filter: (r) => r.status === "published", search: "mango" });
    expect(result.rows.map((r) => r.id)).toEqual(["3"]);
  });

  it("clamps an out-of-range page down to the last valid page", () => {
    const result = paginate({ page: 999, pageSize: 2 });
    expect(result.page).toBe(2);
    expect(result.pageCount).toBe(2);
    expect(result.rows).toHaveLength(1);
  });

  it("clamps a page below 1 up to page 1", () => {
    expect(paginate({ page: 0 }).page).toBe(1);
  });

  it("pageCount is always at least 1, even for an empty result", () => {
    const result = paginateRows([], {
      search: "",
      searchText: (r: Row) => r.name,
      sort: null,
      dir: "asc",
      comparators: COMPARATORS,
      page: 1,
      pageSize: 20,
    });
    expect(result.pageCount).toBe(1);
    expect(result.total).toBe(0);
    expect(result.rows).toHaveLength(0);
  });

  it("slices to the requested page size", () => {
    const result = paginate({ sort: "order", pageSize: 2 });
    expect(result.rows).toHaveLength(2);
    expect(result.rows.map((r) => r.id)).toEqual(["2", "3"]);
  });
});
