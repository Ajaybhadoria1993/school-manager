import { AsyncLocalStorage } from "node:async_hooks";
import type { Types } from "mongoose";

/**
 * Looking at a past academic year (2026-11-08). A school admin can open a CLOSED year to read what the school was then: its students,
 * classes, attendance and exams. The year is named by the request (`X-Academic-Year`, checked by middleware/yearView.ts) and kept here for
 * the length of that one request, so every read that asks "which year is this about?" gets the answer without each route passing it down.
 *
 * Only reads ever see it: the middleware refuses every request that would change something while a past year is being looked at, so no
 * write can land in a closed year by mistake. A request without the header has no view, and every answer is about the running year.
 */
export interface YearView {
  yearId: Types.ObjectId;
  name: string;
}

const store = new AsyncLocalStorage<YearView>();

/** Runs `fn` (the rest of the request) with this closed year being looked at. */
export const inYearView = <T>(view: YearView, fn: () => T): T => store.run(view, fn);

/** The closed year this request looks at, or null (the usual case: the running year). */
export const viewedYear = (): YearView | null => store.getStore() ?? null;

/** True when `yearId` is the closed year this request looks at. */
export const isViewing = (yearId: Types.ObjectId | string): boolean => viewedYear()?.yearId.toString() === yearId.toString();

/**
 * Which enrolments count as "in" a year. In the running year only the students who are still here (a student who leaves becomes inactive,
 * and so do all their enrolments). In a closed year being looked at, everyone who sat in it, even those who left later: it is what the
 * year was.
 */
export const seatedIn = (yearId: Types.ObjectId | string): { status?: "active" } => (isViewing(yearId) ? {} : { status: "active" });
