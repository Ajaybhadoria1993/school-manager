import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Provider } from "react-redux";
import { RouterProvider, createMemoryRouter } from "react-router";
import { ToastProvider } from "../../../components/ui/toast-context";
import { allApiSlices } from "../../../redux/api/apiRoot";
import store from "../../../redux/store";
import { fakeApi, type Call, type Handler } from "../../../test/fakeApi";
import { GRID, OVERVIEW, REGULAR, REGULAR_ROWS } from "../../../test/timetableFixtures";
import type { AcademicStructure, GridView, Schedule, Slot } from "../../../types";
import { periodCount } from "../../../utils/classWeek";
import TimetablePage from "../Timetable";

/** The "Periods per day" box of a class's timetable: Class 5 (sections A and B), the school's day Monday to Friday with eight periods. */

const STRUCTURE: AcademicStructure = {
  academicYear: { id: "y1", name: "2026-2027" },
  settings: { sectionDetailsRequired: false },
  departments: [],
  classes: [
    {
      id: "c5",
      name: "Class 5",
      order: 5,
      departmentId: null,
      capacity: null,
      sections: [
        { id: "c5-A", classId: "c5", name: "A", capacity: 40, room: null },
        { id: "c5-B", classId: "c5", name: "B", capacity: 40, room: null },
      ],
    },
  ],
  totals: { departments: 0, classes: 1, sections: 2, seats: 80 },
};

const FIVE_ROWS: Slot[] = REGULAR_ROWS.slice(0, 6);
const own = (over: Partial<Schedule> = {}): Schedule => ({ id: "own1", name: "Class 5", days: [1], scope: "only", classIds: ["c5"], departmentId: null, slots: FIVE_ROWS, periods: 5, ...over });

function openPage(schedules: Schedule[] = [REGULAR], extra: Record<string, Handler> = {}, view: GridView = GRID) {
  const calls = fakeApi({
    "GET /timetable/overview": () => OVERVIEW,
    "GET /timetable/grid": () => view,
    "GET /academics/structure": () => STRUCTURE,
    "GET /subjects": () => ({ items: [] }),
    "GET /staff/teachers": () => ({ items: [] }),
    "GET /timetable/schedules": () => ({ items: schedules }),
    "PUT /timetable/class-day": () => ({ items: schedules }),
    ...extra,
  });
  const router = createMemoryRouter(
    [
      { path: "/school/timetable", element: <TimetablePage /> },
      { path: "/dashboard", element: <p>The dashboard</p> },
    ],
    { initialEntries: ["/school/timetable?tab=classes&class=c5&section=c5-A"] }
  );
  render(
    <Provider store={store}>
      <ToastProvider>
        <RouterProvider router={router} />
      </ToastProvider>
    </Provider>
  );
  return { calls, router, user: userEvent.setup() };
}

afterEach(() => {
  cleanup();
  for (const api of allApiSlices) store.dispatch(api.util.resetApiState());
  vi.unstubAllGlobals();
});

type User = ReturnType<typeof userEvent.setup>;
const server = (status: number, message: string, code?: string, details?: object[]) => () =>
  new Response(JSON.stringify({ success: false, message, code, details }), { status, headers: { "Content-Type": "application/json" } });
const classDays = (calls: Call[]) => calls.filter((c) => c.method === "PUT" && c.path === "/timetable/class-day");
const gets = (calls: Call[], path: string) => calls.filter((c) => c.method === "GET" && c.path === path).length;

/** Opens the box and waits for the school's timings. */
async function openBox(user: User) {
  await screen.findByRole("table", { name: "Weekly timetable" });
  await user.click(screen.getByRole("button", { name: "Periods per day" }));
  const dialog = await screen.findByRole("dialog", { name: "Periods per day: Class 5" });
  await within(dialog).findByRole("group", { name: "Monday" });
  return dialog;
}
const day = (dialog: HTMLElement, name: string) => within(dialog).getByRole("group", { name });
const count = (dialog: HTMLElement, name: string) => day(dialog, name).querySelector("span")!.textContent;
const more = (dialog: HTMLElement, name: string) => within(dialog).getByRole("button", { name: `More periods on ${name}` });
const fewer = (dialog: HTMLElement, name: string) => within(dialog).getByRole("button", { name: `Fewer periods on ${name}` });
const row = (dialog: HTMLElement, name: string) => day(dialog, name).closest("li")!;

describe("the Periods per day box", () => {
  it("is a button beside the fill (the old Periods & teachers one is gone) and opens a box with every day of the week and its periods", async () => {
    const { calls, user } = openPage();
    const dialog = await openBox(user);
    expect(screen.queryByRole("button", { name: "Periods & teachers" })).not.toBeInTheDocument();
    expect(["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"].map((d) => `${d} ${count(dialog, d)}`)).toEqual([
      "Monday 8",
      "Tuesday 8",
      "Wednesday 8",
      "Thursday 8",
      "Friday 8",
      "Saturday 0",
      "Sunday 0",
    ]);
    expect(row(dialog, "Monday")).toHaveTextContent("08:30 to 14:20 · lunch 10:30 to 11:00");
    expect(row(dialog, "Saturday")).toHaveTextContent("No school");
    // Nothing to save yet; the timings were asked once for the box.
    expect(within(dialog).getByRole("button", { name: "Save" })).toBeDisabled();
    expect(gets(calls, "/timetable/schedules")).toBe(1);
    expect(within(dialog).getByText(/Changes only Class 5 \(all its sections\)/)).toBeInTheDocument();
    // The week's total: five days of eight.
    expect(within(dialog).getByText("40")).toBeInTheDocument();
  });

  it("fewer periods on one day: the day is cut after that period, the rest follows the school; Save sends only that day, and the week is read again", async () => {
    const { calls, user } = openPage();
    const dialog = await openBox(user);
    for (let i = 0; i < 3; i += 1) await user.click(fewer(dialog, "Monday"));
    expect(count(dialog, "Monday")).toBe("5");
    expect(row(dialog, "Monday")).toHaveTextContent("08:30 to 12:20 · lunch 10:30 to 11:00");
    expect(within(row(dialog, "Monday")).getByText("Different from the school")).toBeInTheDocument();
    expect(within(row(dialog, "Tuesday")).queryByText("Different from the school")).not.toBeInTheDocument();
    // The week's total follows: 5 + 4 x 8.
    expect(within(dialog).getByText("37")).toBeInTheDocument();
    const before = gets(calls, "/timetable/grid");
    await user.click(within(dialog).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(classDays(calls)).toHaveLength(1));
    const sent = classDays(calls)[0].body as { classId: string; removeLessons: boolean; days: { day: number; slots: Slot[] }[] };
    expect(sent.classId).toBe("c5");
    expect(sent.removeLessons).toBe(false);
    expect(sent.days.map((d) => `${d.day}:${periodCount(d.slots)}`)).toEqual(["1:5"]);
    expect(sent.days[0].slots).toEqual(FIVE_ROWS);
    expect(await screen.findByText("Class 5: periods saved")).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Periods per day: Class 5" })).not.toBeInTheDocument());
    await waitFor(() => expect(gets(calls, "/timetable/grid")).toBe(before + 1));
  });

  it("more periods go after the last one, as long as it; a day with no school can be given some, and one with some can be made a holiday", async () => {
    const { calls, user } = openPage();
    const dialog = await openBox(user);
    await user.click(more(dialog, "Friday"));
    expect(count(dialog, "Friday")).toBe("9");
    expect(row(dialog, "Friday")).toHaveTextContent("08:30 to 15:00");
    await user.click(more(dialog, "Saturday"));
    expect(count(dialog, "Saturday")).toBe("1");
    for (let i = 0; i < 8; i += 1) await user.click(fewer(dialog, "Thursday"));
    expect(count(dialog, "Thursday")).toBe("0");
    expect(row(dialog, "Thursday")).toHaveTextContent("No school");
    await user.click(within(dialog).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(classDays(calls)).toHaveLength(1));
    const sent = (classDays(calls)[0].body as { days: { day: number; slots: Slot[] }[] }).days;
    expect(sent.map((d) => `${d.day}:${periodCount(d.slots)}`)).toEqual(["4:0", "5:9", "6:1"]);
    expect(sent[0].slots).toEqual([]);
    expect(sent[1].slots.slice(9)).toEqual([{ kind: "period", label: "", start: "14:20", end: "15:00" }]);
  });

  it("stops at twelve periods", async () => {
    const { user } = openPage();
    const dialog = await openBox(user);
    for (let i = 0; i < 4; i += 1) await user.click(more(dialog, "Monday"));
    expect(count(dialog, "Monday")).toBe("12");
    expect(more(dialog, "Monday")).toBeDisabled();
    expect(fewer(dialog, "Sunday")).toBeDisabled();
  });

  it("'Same on every school day' sets every day that has school at once, and leaves the days without school alone", async () => {
    const { calls, user } = openPage();
    const dialog = await openBox(user);
    await user.click(within(dialog).getByRole("button", { name: /Set every school day to/ }));
    await user.click(await screen.findByRole("option", { name: "6 periods" }));
    expect(["Monday", "Wednesday", "Friday", "Saturday", "Sunday"].map((d) => count(dialog, d))).toEqual(["6", "6", "6", "0", "0"]);
    await user.click(within(dialog).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(classDays(calls)).toHaveLength(1));
    const sent = (classDays(calls)[0].body as { days: { day: number; slots: Slot[] }[] }).days;
    expect(sent.map((d) => `${d.day}:${periodCount(d.slots)}`)).toEqual(["1:6", "2:6", "3:6", "4:6", "5:6"]);
  });

  it("going back to the number the school has, on every day, sends no days (the class follows the school) and Save is off while nothing is different", async () => {
    const { user } = openPage();
    const dialog = await openBox(user);
    await user.click(fewer(dialog, "Monday"));
    expect(within(dialog).getByRole("button", { name: "Save" })).toBeEnabled();
    await user.click(more(dialog, "Monday"));
    expect(within(dialog).getByRole("button", { name: "Save" })).toBeDisabled();
  });

  it("Cancel sends nothing", async () => {
    const { calls, user } = openPage();
    const dialog = await openBox(user);
    await user.click(fewer(dialog, "Monday"));
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Periods per day: Class 5" })).not.toBeInTheDocument());
    expect(classDays(calls)).toHaveLength(0);
  });

  it("a class that already has days of its own shows them, keeps them when another day changes, and can go back to the school's periods", async () => {
    const { calls, user } = openPage([REGULAR, own()]);
    const dialog = await openBox(user);
    expect(count(dialog, "Monday")).toBe("5");
    expect(count(dialog, "Tuesday")).toBe("8");
    expect(within(row(dialog, "Monday")).getByText("Different from the school")).toBeInTheDocument();
    // Another day changes: Monday stays its own.
    await user.click(fewer(dialog, "Friday"));
    await user.click(within(dialog).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(classDays(calls)).toHaveLength(1));
    expect((classDays(calls)[0].body as { days: { day: number; slots: Slot[] }[] }).days.map((d) => `${d.day}:${periodCount(d.slots)}`)).toEqual(["1:5", "5:7"]);
  });

  it("'Back to the school's periods' takes the class's own days away: Monday has eight again and nothing is sent as its own", async () => {
    const { calls, user } = openPage([REGULAR, own()]);
    const dialog = await openBox(user);
    await user.click(within(dialog).getByRole("button", { name: "Back to the school's periods" }));
    expect(count(dialog, "Monday")).toBe("8");
    expect(within(dialog).queryByRole("button", { name: "Back to the school's periods" })).not.toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(classDays(calls)).toHaveLength(1));
    expect(classDays(calls)[0].body).toMatchObject({ classId: "c5", days: [], removeLessons: false });
    expect(await screen.findByText("Class 5 follows the school's periods")).toBeInTheDocument();
  });

  it("has no 'Back to the school's periods' for a class that follows the school already", async () => {
    const { user } = openPage();
    const dialog = await openBox(user);
    expect(within(dialog).queryByRole("button", { name: "Back to the school's periods" })).not.toBeInTheDocument();
  });
});

describe("the Periods per day box: lessons in the periods that go", () => {
  const LESSONS = "Class 5 has 3 lessons in periods that would no longer be there (Class 5 - A: 2, Class 5 - B: 1).";
  const refusal = server(409, LESSONS, "LESSONS_IN_REMOVED_PERIODS", [{ path: "lessons", message: "Class 5 - A: 2, Class 5 - B: 1", lessons: 3 }]);

  it("asks before taking lessons away, in the server's words, and saves again with removeLessons when the person agrees", async () => {
    let first = true;
    const { calls, user } = openPage([REGULAR], { "PUT /timetable/class-day": () => (first ? ((first = false), refusal()) : { items: [REGULAR] }) });
    const dialog = await openBox(user);
    for (let i = 0; i < 3; i += 1) await user.click(fewer(dialog, "Monday"));
    await user.click(within(dialog).getByRole("button", { name: "Save" }));
    expect(await within(dialog).findByText(LESSONS)).toBeInTheDocument();
    expect(within(dialog).getByText(/those lessons are taken out of the timetable of every section of Class 5/)).toBeInTheDocument();
    expect(classDays(calls)).toHaveLength(1);
    expect((classDays(calls)[0].body as { removeLessons: boolean }).removeLessons).toBe(false);
    await user.click(within(dialog).getByRole("button", { name: "Take those lessons out and save" }));
    await waitFor(() => expect(classDays(calls)).toHaveLength(2));
    expect((classDays(calls)[1].body as { removeLessons: boolean }).removeLessons).toBe(true);
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Periods per day: Class 5" })).not.toBeInTheDocument());
  });

  it("'Go back' returns to the days with what was set, and nothing is taken out", async () => {
    const { calls, user } = openPage([REGULAR], { "PUT /timetable/class-day": refusal });
    const dialog = await openBox(user);
    await user.click(fewer(dialog, "Monday"));
    await user.click(within(dialog).getByRole("button", { name: "Save" }));
    await within(dialog).findByText(LESSONS);
    await user.click(within(dialog).getByRole("button", { name: "Go back" }));
    expect(count(dialog, "Monday")).toBe("7");
    expect(within(dialog).queryByText(LESSONS)).not.toBeInTheDocument();
    expect(classDays(calls)).toHaveLength(1);
  });
});

describe("the Periods per day box: what the server refuses, and other ways in", () => {
  it("says why when the server refuses (two timings for the class on one day), and stays open with the numbers kept", async () => {
    const { user } = openPage([REGULAR], { "PUT /timetable/class-day": server(409, 'Class 5 already follows "Little ones" on Monday. A class follows one timing a day: give one of them other days or other classes.', "SCHEDULE_CLASH") });
    const dialog = await openBox(user);
    await user.click(fewer(dialog, "Monday"));
    await user.click(within(dialog).getByRole("button", { name: "Save" }));
    expect(await within(dialog).findByText(/Class 5 already follows "Little ones" on Monday/)).toBeInTheDocument();
    expect(count(dialog, "Monday")).toBe("7");
    expect(screen.getByRole("dialog", { name: "Periods per day: Class 5" })).toBeInTheDocument();
  });

  it("says when the timings could not be read, and offers no Save", async () => {
    openPage([REGULAR], { "GET /timetable/schedules": server(500, "The server is busy") });
    await screen.findByRole("table", { name: "Weekly timetable" });
    await userEvent.setup().click(screen.getByRole("button", { name: "Periods per day" }));
    const dialog = await screen.findByRole("dialog", { name: "Periods per day: Class 5" });
    expect(await within(dialog).findByText(/Could not load the school's timings/)).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Save" })).toBeDisabled();
  });

  it("leads to the School timings tab for the whole school or a department", async () => {
    const { router, user } = openPage();
    const dialog = await openBox(user);
    await user.click(within(dialog).getByRole("button", { name: "School timings" }));
    await waitFor(() => expect(router.state.location.search).toContain("tab=timings"));
  });

  it("a class with no timing at all can be given periods right on its page: five periods on every school day start from the usual day", async () => {
    const { calls, user } = openPage([], {}, { ...GRID, days: [] });
    expect(await screen.findByText(/This class has no school timing yet/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Set the periods of this class" }));
    const dialog = await screen.findByRole("dialog", { name: "Periods per day: Class 5" });
    await within(dialog).findByRole("group", { name: "Monday" });
    expect(count(dialog, "Monday")).toBe("0");
    await user.click(within(dialog).getByRole("button", { name: /Set every school day to/ }));
    await user.click(await screen.findByRole("option", { name: "5 periods" }));
    expect(["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"].map((d) => count(dialog, d))).toEqual(["5", "5", "5", "5", "5", "0"]);
    expect(row(dialog, "Monday")).toHaveTextContent("08:30 to 12:20");
    await user.click(within(dialog).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(classDays(calls)).toHaveLength(1));
    const sent = (classDays(calls)[0].body as { days: { day: number; slots: Slot[] }[] }).days;
    expect(sent.map((d) => `${d.day}:${periodCount(d.slots)}`)).toEqual(["1:5", "2:5", "3:5", "4:5", "5:5"]);
  });
});
