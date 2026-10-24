import { useCallback, useEffect, useMemo, useRef } from "react";
import { useSearchParams } from "react-router";
import { STUDENT_PAGE_SIZES } from "../constants/students";
import type { StudentListQuery } from "../types";

export type StudentView = "table" | "grid";

/** What the person has asked of the student list, as it is in the address (a reload, a link and the back button keep it). */
export interface StudentFilters {
  /** Part of a name or of an admission number. */
  q: string;
  /** "" = every class. */
  classId: string;
  /** "" = every section of the class. */
  sectionId: string;
  page: number;
  limit: number;
  /** How the same page of students is drawn: a table or cards. It is only a look: it is not part of the server's query. */
  view: StudentView;
}

const VIEW_KEY = "edushiksha.students.view";

/** The look this person chose last (a per-viewer convenience: without storage the table is shown). */
function rememberedView(): StudentView {
  try {
    return localStorage.getItem(VIEW_KEY) === "grid" ? "grid" : "table";
  } catch {
    return "table";
  }
}

/**
 * The search, class and section, page and view of the student list, kept in the address (`?q=&class=&section=&page=&limit=&view=`) and
 * turned into the query the server answers. Nothing is filtered in the browser: a change here is a new request, except the view, which
 * only changes how the answer is drawn. The order is the server's default (by class and section, then by name): the screen offers no
 * sort, so an old `sort=` / `dir=` in a saved link is simply ignored.
 * Built like `useClassFilters` (a change is made from the latest address, never from an older render's).
 */
export function useStudentFilters() {
  const [params, setParams] = useSearchParams();

  const filters = useMemo<StudentFilters>(() => {
    const limit = Number(params.get("limit"));
    const view = params.get("view");
    return {
      q: params.get("q") ?? "",
      classId: params.get("class") ?? "",
      sectionId: params.get("class") ? (params.get("section") ?? "") : "",
      page: Math.max(1, Number(params.get("page")) || 1),
      limit: (STUDENT_PAGE_SIZES as readonly number[]).includes(limit) ? limit : STUDENT_PAGE_SIZES[0],
      view: view === "grid" || view === "table" ? view : rememberedView(),
    };
  }, [params]);

  const query = useMemo<StudentListQuery>(
    () => ({
      ...(filters.q.trim() ? { q: filters.q.trim() } : {}),
      ...(filters.classId ? { classId: filters.classId } : {}),
      ...(filters.classId && filters.sectionId ? { sectionId: filters.sectionId } : {}),
      page: filters.page,
      limit: filters.limit,
    }),
    [filters.q, filters.classId, filters.sectionId, filters.page, filters.limit]
  );

  /** How many filters are set (the page and the view are not filters). */
  const active = (filters.q.trim() ? 1 : 0) + (filters.classId ? 1 : 0) + (filters.classId && filters.sectionId ? 1 : 0);

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

  /** Changes some of them. A change to what is listed goes back to the first page; a new class forgets the section. */
  const change = useCallback(
    (patch: Partial<StudentFilters>) =>
      apply((next) => {
        const set = (key: string, value: string | number, fallback: string | number) => {
          if (value === "" || value === fallback) next.delete(key);
          else next.set(key, String(value));
        };
        if ("q" in patch) set("q", patch.q ?? "", "");
        if ("classId" in patch) {
          set("class", patch.classId ?? "", "");
          next.delete("section");
        }
        if ("sectionId" in patch) set("section", patch.sectionId ?? "", "");
        if ("limit" in patch) set("limit", patch.limit ?? STUDENT_PAGE_SIZES[0], STUDENT_PAGE_SIZES[0]);
        if ("view" in patch && patch.view) {
          // Written either way (the address wins over what was remembered), and remembered for the next visit.
          next.set("view", patch.view);
          try {
            localStorage.setItem(VIEW_KEY, patch.view);
          } catch {
            // No storage (a private window): the choice only lasts while the address keeps it.
          }
        }
        if ("page" in patch) set("page", patch.page ?? 1, 1);
        // A new look keeps the page; a change to what is listed starts again from the first page.
        else if (Object.keys(patch).some((key) => key !== "view")) next.delete("page");
      }),
    [apply]
  );

  /** Takes the search, the class and the section away (the view stays). */
  const clear = useCallback(
    () =>
      apply((next) => {
        for (const key of ["q", "class", "section", "page"]) next.delete(key);
      }),
    [apply]
  );

  return { filters, query, active, change, clear };
}
