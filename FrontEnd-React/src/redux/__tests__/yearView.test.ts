import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { waitFor } from "@testing-library/react";
import store from "../store";
import { allApiSlices } from "../api/apiRoot";
import { academicsApi } from "../api/academicsApi";
import { attendanceApi } from "../api/attendanceApi";
import { authApi } from "../api/authApi";
import { examsApi } from "../api/examsApi";
import { classroomApi } from "../api/classroomApi";
import { staffApi } from "../api/staffApi";
import { timetableApi } from "../api/timetableApi";
import { studentsApi } from "../api/studentsApi";
import { signedOut } from "../slices/authSlice";
import { YEAR_VIEW_KEY, yearViewChanged } from "../slices/yearViewSlice";
import { clearTokens, setTokens } from "../../utils/auth";

/**
 * Looking at a past academic year (2026-11-08). The year chosen is sent to the API with the reads that know how to answer for a year
 * (students, classes, attendance, exams), the screens that show it ask again when it changes, a year the server refuses is dropped, and
 * signing out forgets it.
 */

type Seen = { method: string; path: string; year: string | null };

/** `fetch` replaced: every request is remembered with the year it carried; `refuse` answers some paths with an error. */
function stubApi(refuse: Record<string, { status: number; code: string }> = {}) {
  const seen: Seen[] = [];
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = input instanceof Request ? input : new Request(input, init);
    const path = new URL(request.url).pathname.replace("/api/v1", "");
    seen.push({ method: request.method, path, year: request.headers.get("X-Academic-Year") });
    const refused = refuse[path];
    const body = refused ? { success: false, message: "Refused", code: refused.code } : { success: true, data: {} };
    return new Response(JSON.stringify(body), { status: refused?.status ?? 200, headers: { "Content-Type": "application/json" } });
  });
  return seen;
}
const askedFor = (seen: Seen[], path: string) => seen.filter((s) => s.path === path);

/** A read started the way a screen starts one: it stays subscribed (so it is asked again when it goes stale) until `unsubscribe`. */
type Started = Promise<unknown> & { unsubscribe: () => void };
const run = (start: () => unknown) => store.dispatch(start() as never) as unknown as Started;

/** The reads of the four screens that can show a past year, and some that are never about one. */
const YEAR_READS: readonly (readonly [string, () => unknown])[] = [
  ["/academics/structure", () => academicsApi.endpoints.getStructure.initiate()],
  ["/students", () => studentsApi.endpoints.getStudents.initiate({} as never)],
  ["/attendance/students/today", () => attendanceApi.endpoints.getStudentsToday.initiate()],
  ["/exams", () => examsApi.endpoints.getExams.initiate()],
  // The timetable and a teacher's classes are about a year too (what a class studies, who teaches it).
  ["/timetable/overview", () => timetableApi.endpoints.getOverview.initiate({ status: "all" } as never)],
  ["/staff/teachers", () => timetableApi.endpoints.getTeachers.initiate({ status: "active" } as never)],
  ["/subjects/allotments", () => timetableApi.endpoints.getAllotments.initiate({ classId: "c6", sectionId: "c6-A" } as never)],
];

/** Reads that carry the year so that a change is refused while a year that is over is open, but whose answer is the same for every year. */
const YEAR_FREE_READS: readonly (readonly [string, () => unknown])[] = [
  ["/staff/members", () => staffApi.endpoints.getStaffMembers.initiate({} as never)],
  ["/classroom/calendar", () => classroomApi.endpoints.getCalendar.initiate()],
];

// The store is shared by the tests of this file: what one test fetched must not answer the next one.
const forgetEverything = () => {
  for (const api of allApiSlices) store.dispatch(api.util.resetApiState());
  store.dispatch(yearViewChanged(null));
  sessionStorage.clear();
};
beforeEach(() => {
  setTokens("token-1", "refresh-1");
  forgetEverything();
});
afterEach(() => {
  vi.unstubAllGlobals();
  clearTokens();
  forgetEverything();
});

describe("the year that is looked at", () => {
  it("is sent with the reads that answer for a year, and with nothing else", async () => {
    const seen = stubApi();
    store.dispatch(yearViewChanged("year-old"));
    for (const [, start] of [...YEAR_READS, ...YEAR_FREE_READS]) await run(start);
    // The year's own workflows (the list of years, the promotion list) and the rest of the app are not about a viewed year.
    await run(() => academicsApi.endpoints.getAcademicYears.initiate());
    await run(() => studentsApi.endpoints.getPromotion.initiate("year-next"));
    await run(() => authApi.endpoints.getMe.initiate());

    for (const [path] of [...YEAR_READS, ...YEAR_FREE_READS]) expect(askedFor(seen, path).map((s) => s.year), path).toEqual(["year-old"]);
    for (const path of ["/academics/academic-years", "/students/promotions", "/auth/me"]) expect(askedFor(seen, path).map((s) => s.year), path).toEqual([null]);
  });

  it("is not sent at all when no past year is chosen", async () => {
    const seen = stubApi();
    for (const [, start] of YEAR_READS) await run(start);
    expect(seen).toHaveLength(YEAR_READS.length);
    expect(seen.every((s) => s.year === null)).toBe(true);
  });

  it("makes every screen that shows a year ask again, with the year; what is not about a year is left alone", async () => {
    const seen = stubApi();
    const open = [...YEAR_READS.map(([, start]) => run(start)), run(() => academicsApi.endpoints.getAcademicYears.initiate())];
    await Promise.all(open);
    const before = seen.length;

    store.dispatch(yearViewChanged("year-old"));
    await waitFor(() => {
      for (const [path] of YEAR_READS) expect(askedFor(seen, path), path).toHaveLength(2);
    });
    for (const [path] of YEAR_READS) expect(askedFor(seen, path).at(-1)?.year, path).toBe("year-old");
    // Four screens asked again, nothing more: the list of years is the same whichever year is shown.
    expect(seen.length - before).toBe(YEAR_READS.length);
    expect(askedFor(seen, "/academics/academic-years")).toHaveLength(1);
    open.forEach((o) => o.unsubscribe());
  });

  it("goes back to the running year (and the screens ask again) when the server refuses the year", async () => {
    const seen = stubApi({ "/students": { status: 404, code: "YEAR_NOT_FOUND" } });
    store.dispatch(yearViewChanged("year-gone"));
    const open = run(() => studentsApi.endpoints.getStudents.initiate({} as never));
    await open;
    await waitFor(() => expect(store.getState().yearView.yearId).toBeNull());
    await waitFor(() => expect(askedFor(seen, "/students").length).toBeGreaterThanOrEqual(2));
    open.unsubscribe();
  });

  it("is kept in this tab (so a reload stays on the year) and forgotten when the session ends", () => {
    stubApi();
    store.dispatch(yearViewChanged("year-old"));
    expect(sessionStorage.getItem(YEAR_VIEW_KEY)).toBe("year-old");
    store.dispatch(yearViewChanged(null));
    expect(sessionStorage.getItem(YEAR_VIEW_KEY)).toBeNull();

    store.dispatch(yearViewChanged("year-old"));
    store.dispatch(signedOut());
    expect(store.getState().yearView.yearId).toBeNull();
    expect(sessionStorage.getItem(YEAR_VIEW_KEY)).toBeNull();
  });
});
