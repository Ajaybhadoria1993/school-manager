import { useCallback, useEffect, useMemo, useRef } from "react";
import { useSearchParams } from "react-router";
import type { ClassListQuery } from "../types";

export type ClassSort = "order" | "name" | "seats";
export const PAGE_SIZES = [10, 20, 50] as const;

/** What the person has asked of the class list, as it is in the address (so a reload, a link and the back button all keep it). */
export interface ClassFilters {
  /** Part of the class name. */
  q: string;
  sort: ClassSort;
  dir: "asc" | "desc";
  page: number;
  limit: number;
  /** The class open on the right, if one was picked. */
  selected: string | null;
}

/**
 * The search, sort, page and picked class of a department's screen, kept in the address (`?q=&sort=&dir=&page=&limit=&class=`)
 * and turned into the query the server answers. Nothing is filtered in the browser: a change here is a new request.
 * `scope` is the department the screen is about (or "none"): the list is always that department's, so there is no department to
 * pick. (The server can also filter by department and by seats, for the screens that need it.)
 */
export function useClassFilters(scope: string) {
  const [params, setParams] = useSearchParams();

  const filters = useMemo<ClassFilters>(() => {
    const sort = params.get("sort");
    const limit = Number(params.get("limit"));
    return {
      q: params.get("q") ?? "",
      sort: sort === "name" || sort === "seats" ? sort : "order",
      dir: params.get("dir") === "desc" ? "desc" : "asc",
      page: Math.max(1, Number(params.get("page")) || 1),
      limit: (PAGE_SIZES as readonly number[]).includes(limit) ? limit : PAGE_SIZES[0],
      selected: params.get("class"),
    };
  }, [params]);

  const query = useMemo<ClassListQuery>(
    () => ({
      ...(filters.q.trim() ? { search: filters.q.trim() } : {}),
      departmentId: scope,
      sort: filters.sort,
      dir: filters.dir,
      page: filters.page,
      limit: filters.limit,
    }),
    [filters, scope]
  );

  /** How many filters are set (the sort and the page are not filters). */
  const active = filters.q.trim() !== "" ? 1 : 0;

  // The address as it is right now, including a change made a moment ago that has not been drawn yet. A change is built from this,
  // never from the address of an older render: a box that was typed in a moment ago sends its change from a timer, and must not
  // undo a sort picked in the meantime.
  const latest = useRef(params);
  useEffect(() => {
    latest.current = params;
  }, [params]);
  const apply = useCallback(
    (build: (next: URLSearchParams) => void) => {
      const next = new URLSearchParams(latest.current);
      build(next);
      latest.current = next;
      setParams(next, { replace: true });
    },
    [setParams]
  );

  /** Changes some of them. A change to what is listed goes back to the first page; the address is replaced, not piled up. */
  const change = useCallback(
    (patch: Partial<ClassFilters>) =>
      apply((next) => {
        const set = (key: string, value: string | number | null, fallback: string | number | null) => {
          if (value === null || value === "" || value === fallback) next.delete(key);
          else next.set(key, String(value));
        };
        if ("q" in patch) set("q", patch.q ?? "", "");
        if ("sort" in patch) set("sort", patch.sort ?? "order", "order");
        if ("dir" in patch) set("dir", patch.dir ?? "asc", "asc");
        if ("limit" in patch) set("limit", patch.limit ?? PAGE_SIZES[0], PAGE_SIZES[0]);
        if ("selected" in patch) set("class", patch.selected ?? null, null);
        if ("page" in patch) set("page", patch.page ?? 1, 1);
        else if (Object.keys(patch).some((key) => key !== "selected")) next.delete("page");
      }),
    [apply]
  );

  /** Takes the search away (the sort and the picked class stay). */
  const clear = useCallback(
    () =>
      apply((next) => {
        next.delete("q");
        next.delete("page");
      }),
    [apply]
  );

  return { filters, query, active, change, clear };
}
