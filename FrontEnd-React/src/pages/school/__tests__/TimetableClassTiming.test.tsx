import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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
import ClassTimetablesPage from "../ClassTimetables";

/**
 * The "Periods & time" box of a class's timetable (2026-11-09; it replaced "Periods per day"): a class has the school's times and is there
 * for as many periods as it has lessons, nothing is set for it. Only a class that is called at other hours (9 to 2) is given them here:
 * a start and an end. Class 5 (sections A and B), the school's day Monday to Friday with eight periods.
 */

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
const own = (over: Partial<Schedule> = {}): Schedule => ({ id: "own1", name: "Class 5", days: [1, 2, 3, 4, 5], scope: "only", classIds: ["c5"], departmentId: null, slots: FIVE_ROWS, periods: 5, ...over });

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
      { path: "/school/timetable", element: <ClassTimetablesPage /> },
      { path: "/school/timings", element: <p>The school timings</p> },
      { path: "/dashboard", element: <p>The dashboard</p> },
    ],
    { initialEntries: ["/school/timetable?class=c5&section=c5-A"] }
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
type Sent = { classId: string; removeLessons: boolean; days: { day: number; slots: Slot[] }[] };

/** Opens the box and waits for the school's timings. */
async function openBox(user: User) {
  await screen.findByRole("table", { name: "Weekly timetable" });
  await user.click(screen.getByRole("button", { name: "Periods & time" }));
  const dialog = await screen.findByRole("dialog", { name: "Periods & time: Class 5" });
  await within(dialog).findByLabelText("Class starts");
  return dialog;
}
const starts = (dialog: HTMLElement) => within(dialog).getByLabelText("Class starts");
const ends = (dialog: HTMLElement) => within(dialog).getByLabelText("Class ends");
const setHours = (dialog: HTMLElement, from: string, to: string) => {
  fireEvent.change(starts(dialog), { target: { value: from } });
  fireEvent.change(ends(dialog), { target: { value: to } });
};
const save = (dialog: HTMLElement) => within(dialog).getByRole("button", { name: "Save" });

describe("the Periods & time box", () => {
  it("is a button beside the fill (Periods per day is gone) and shows the hours the class has now: the school's day, with nothing to save", async () => {
    const { calls, user } = openPage();
    const dialog = await openBox(user);
    expect(screen.queryByRole("button", { name: "Periods per day" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Periods & teachers" })).not.toBeInTheDocument();
    expect(starts(dialog)).toHaveValue("08:30");
    expect(ends(dialog)).toHaveValue("14:20");
    expect(within(dialog).getByText("8 periods · 08:30 to 14:20 · lunch 10:30 to 11:00")).toBeInTheDocument();
    expect(save(dialog)).toBeDisabled();
    // No stepper for the periods of each day: they follow the lessons.
    expect(within(dialog).queryByRole("group", { name: "Monday" })).not.toBeInTheDocument();
    // The school's timings were asked once for the box.
    expect(gets(calls, "/timetable/schedules")).toBe(1);
    expect(within(dialog).getByText("Applies to every section of Class 5.")).toBeInTheDocument();
  });

  it("other hours (9 to 2): the day is shown in words, Save sends the days that differ from the school's, and the week is read again", async () => {
    const { calls, user } = openPage();
    const dialog = await openBox(user);
    setHours(dialog, "08:30", "12:20");
    expect(within(dialog).getByText("5 periods · 08:30 to 12:20 · lunch 10:30 to 11:00")).toBeInTheDocument();
    setHours(dialog, "09:00", "14:00");
    expect(within(dialog).getByText(/^8 periods · 09:00 to 14:00 · lunch 10:30 to 11:00$/)).toBeInTheDocument();
    const before = gets(calls, "/timetable/grid");
    await user.click(save(dialog));
    await waitFor(() => expect(classDays(calls)).toHaveLength(1));
    const sent = classDays(calls)[0].body as Sent;
    expect(sent.classId).toBe("c5");
    expect(sent.removeLessons).toBe(false);
    expect(sent.days.map((d) => d.day)).toEqual([1, 2, 3, 4, 5]);
    expect(sent.days[0].slots[0]).toMatchObject({ kind: "period", start: "09:00", end: "09:40" });
    expect(sent.days[0].slots.at(-1)).toMatchObject({ kind: "period", end: "14:00" });
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Periods & time: Class 5" })).not.toBeInTheDocument());
    await waitFor(() => expect(gets(calls, "/timetable/grid")).toBe(before + 1));
  });

  it("shorter hours: five periods from the usual start, and only those days are sent", async () => {
    const { calls, user } = openPage();
    const dialog = await openBox(user);
    setHours(dialog, "08:30", "12:20");
    await user.click(save(dialog));
    await waitFor(() => expect(classDays(calls)).toHaveLength(1));
    const sent = classDays(calls)[0].body as Sent;
    expect(sent.days.map((d) => `${d.day}:${periodCount(d.slots)}`)).toEqual(["1:5", "2:5", "3:5", "4:5", "5:5"]);
    expect(sent.days[0].slots).toEqual(FIVE_ROWS);
  });

  it("says when the hours make no day, and offers no Save", async () => {
    const { calls, user } = openPage();
    const dialog = await openBox(user);
    setHours(dialog, "12:00", "09:00");
    expect(within(dialog).getByRole("alert")).toHaveTextContent("The class must end after it starts");
    expect(save(dialog)).toBeDisabled();
    setHours(dialog, "08:30", "08:35");
    expect(within(dialog).getByRole("alert")).toHaveTextContent("These hours are too short for a period");
    expect(save(dialog)).toBeDisabled();
    expect(classDays(calls)).toHaveLength(0);
  });

  it("a class with hours of its own shows them, and Back to the school's timing puts the school's hours back (Save then sends no days)", async () => {
    const { calls, user } = openPage([REGULAR, own()]);
    const dialog = await openBox(user);
    expect(starts(dialog)).toHaveValue("08:30");
    expect(ends(dialog)).toHaveValue("12:20");
    expect(save(dialog)).toBeDisabled();
    await user.click(within(dialog).getByRole("button", { name: "Back to the school's timing" }));
    expect(ends(dialog)).toHaveValue("14:20");
    await user.click(save(dialog));
    await waitFor(() => expect(classDays(calls)).toHaveLength(1));
    expect((classDays(calls)[0].body as Sent).days).toEqual([]);
  });

  it("has no Back to the school's timing for a class that follows the school", async () => {
    const { user } = openPage();
    const dialog = await openBox(user);
    expect(within(dialog).queryByRole("button", { name: "Back to the school's timing" })).not.toBeInTheDocument();
  });
});

describe("the Periods & time box: lessons in the periods that go", () => {
  const LESSONS = "Class 5 has 3 lessons in periods that would no longer be there (Class 5 - A: 2, Class 5 - B: 1).";
  const refusal = server(409, LESSONS, "LESSONS_IN_REMOVED_PERIODS", [{ path: "lessons", message: "Class 5 - A: 2, Class 5 - B: 1", lessons: 3 }]);

  it("asks before taking lessons away, in the server's words, and saves again with removeLessons when the person agrees", async () => {
    let first = true;
    const { calls, user } = openPage([REGULAR], { "PUT /timetable/class-day": () => (first ? ((first = false), refusal()) : { items: [REGULAR] }) });
    const dialog = await openBox(user);
    setHours(dialog, "08:30", "12:20");
    await user.click(save(dialog));
    expect(await within(dialog).findByText(LESSONS)).toBeInTheDocument();
    expect(within(dialog).getByText(/those lessons are taken out of the timetable of every section of Class 5/)).toBeInTheDocument();
    expect(classDays(calls)).toHaveLength(1);
    expect((classDays(calls)[0].body as Sent).removeLessons).toBe(false);
    await user.click(within(dialog).getByRole("button", { name: "Take those lessons out and save" }));
    await waitFor(() => expect(classDays(calls)).toHaveLength(2));
    expect((classDays(calls)[1].body as Sent).removeLessons).toBe(true);
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Periods & time: Class 5" })).not.toBeInTheDocument());
  });

  it("'Go back' returns to the hours that were set, and nothing is taken out", async () => {
    const { calls, user } = openPage([REGULAR], { "PUT /timetable/class-day": refusal });
    const dialog = await openBox(user);
    setHours(dialog, "08:30", "12:20");
    await user.click(save(dialog));
    await within(dialog).findByText(LESSONS);
    await user.click(within(dialog).getByRole("button", { name: "Go back" }));
    expect(ends(dialog)).toHaveValue("12:20");
    expect(within(dialog).queryByText(LESSONS)).not.toBeInTheDocument();
    expect(classDays(calls)).toHaveLength(1);
  });
});

describe("the Periods & time box: what the server refuses, and other ways in", () => {
  it("says why when the server refuses (two timings for the class on one day), and stays open with the hours kept", async () => {
    const { user } = openPage([REGULAR], { "PUT /timetable/class-day": server(409, 'Class 5 already follows "Little ones" on Monday. A class follows one timing a day: give one of them other days or other classes.', "SCHEDULE_CLASH") });
    const dialog = await openBox(user);
    setHours(dialog, "08:30", "12:20");
    await user.click(save(dialog));
    expect(await within(dialog).findByText(/Class 5 already follows "Little ones" on Monday/)).toBeInTheDocument();
    expect(ends(dialog)).toHaveValue("12:20");
    expect(screen.getByRole("dialog", { name: "Periods & time: Class 5" })).toBeInTheDocument();
  });

  it("says when the timings could not be read, and offers no Save", async () => {
    openPage([REGULAR], { "GET /timetable/schedules": server(500, "The server is busy") });
    await screen.findByRole("table", { name: "Weekly timetable" });
    await userEvent.setup().click(screen.getByRole("button", { name: "Periods & time" }));
    const dialog = await screen.findByRole("dialog", { name: "Periods & time: Class 5" });
    expect(await within(dialog).findByText(/Could not load the school's timings/)).toBeInTheDocument();
    expect(save(dialog)).toBeDisabled();
  });

  it("leads to the School timings tab for the whole school (no department)", async () => {
    const { router, user } = openPage();
    const dialog = await openBox(user);
    expect(within(dialog).queryByText(/department/i)).not.toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "School timings" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/school/timings"));
  });

  it("a class with no timing at all can be given hours right on its page: Monday to Friday, made from the usual day", async () => {
    const { calls, user } = openPage([], {}, { ...GRID, days: [] });
    expect(await screen.findByText(/This class has no school timing yet/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Set periods & time" }));
    const dialog = await screen.findByRole("dialog", { name: "Periods & time: Class 5" });
    await within(dialog).findByLabelText("Class starts");
    expect(starts(dialog)).toHaveValue("08:30");
    expect(ends(dialog)).toHaveValue("14:20");
    // The usual day is given as it is: that is something to save for a class that had nothing.
    setHours(dialog, "08:30", "12:20");
    await user.click(save(dialog));
    await waitFor(() => expect(classDays(calls)).toHaveLength(1));
    const sent = (classDays(calls)[0].body as Sent).days;
    expect(sent.map((d) => `${d.day}:${periodCount(d.slots)}`)).toEqual(["1:5", "2:5", "3:5", "4:5", "5:5"]);
  });
});

describe("the Periods & time box: how many periods a class has", () => {
  const group = (dialog: HTMLElement) => within(dialog).getByRole("group", { name: "Periods in a day" });
  const number = (dialog: HTMLElement) => group(dialog).querySelector("span")!.textContent;
  const fewer = (dialog: HTMLElement) => within(dialog).getByRole("button", { name: "Fewer periods" });
  const more = (dialog: HTMLElement) => within(dialog).getByRole("button", { name: "More periods" });

  it("shows the number of periods the class has (the school's eight), with a − and a + beside it", async () => {
    const { user } = openPage();
    const dialog = await openBox(user);
    expect(number(dialog)).toBe("8");
  });

  it("fewer periods end the day sooner: 8 to 5 is a day to 12:20 for every school day of the class, and Save sends five periods each", async () => {
    const { calls, user } = openPage();
    const dialog = await openBox(user);
    for (let i = 0; i < 3; i += 1) await user.click(fewer(dialog));
    expect(number(dialog)).toBe("5");
    expect(starts(dialog)).toHaveValue("08:30");
    expect(ends(dialog)).toHaveValue("12:20");
    expect(within(dialog).getByText("5 periods · 08:30 to 12:20 · lunch 10:30 to 11:00")).toBeInTheDocument();
    await user.click(save(dialog));
    await waitFor(() => expect(classDays(calls)).toHaveLength(1));
    const sent = classDays(calls)[0].body as Sent;
    expect(sent.classId).toBe("c5");
    expect(sent.days.map((d) => `${d.day}:${periodCount(d.slots)}`)).toEqual(["1:5", "2:5", "3:5", "4:5", "5:5"]);
    expect(sent.days[0].slots).toEqual(FIVE_ROWS);
  });

  it("more periods than the school's day: nine go on after the last one, to 15:00", async () => {
    const { calls, user } = openPage();
    const dialog = await openBox(user);
    await user.click(more(dialog));
    expect(number(dialog)).toBe("9");
    expect(ends(dialog)).toHaveValue("15:00");
    await user.click(save(dialog));
    await waitFor(() => expect(classDays(calls)).toHaveLength(1));
    expect((classDays(calls)[0].body as Sent).days.map((d) => periodCount(d.slots))).toEqual([9, 9, 9, 9, 9]);
  });

  it("the number follows the hours typed: an end of 12:20 is five periods", async () => {
    const { user } = openPage();
    const dialog = await openBox(user);
    fireEvent.change(ends(dialog), { target: { value: "12:20" } });
    expect(number(dialog)).toBe("5");
  });

  it("another start keeps the number of periods: the day moves, so the end moves", async () => {
    const { user } = openPage();
    const dialog = await openBox(user);
    for (let i = 0; i < 3; i += 1) await user.click(fewer(dialog));
    fireEvent.change(starts(dialog), { target: { value: "09:10" } });
    expect(number(dialog)).toBe("5");
    expect(ends(dialog)).toHaveValue("13:00");
  });

  it("goes down to one period and up to twelve, and no further", async () => {
    const { user } = openPage();
    const dialog = await openBox(user);
    for (let i = 0; i < 7; i += 1) await user.click(fewer(dialog));
    expect(number(dialog)).toBe("1");
    expect(fewer(dialog)).toBeDisabled();
    for (let i = 0; i < 11; i += 1) await user.click(more(dialog));
    expect(number(dialog)).toBe("12");
    expect(more(dialog)).toBeDisabled();
  });

  it("a day the school keeps short (Saturday) keeps the school's times: only the usual days are sent", async () => {
    const SATURDAY: Schedule = { id: "sat", name: "Saturday", days: [6], scope: "all", classIds: [], departmentId: null, slots: REGULAR_ROWS.slice(0, 5), periods: 4 };
    const { calls, user } = openPage([REGULAR, SATURDAY]);
    const dialog = await openBox(user);
    for (let i = 0; i < 3; i += 1) await user.click(fewer(dialog));
    await user.click(save(dialog));
    await waitFor(() => expect(classDays(calls)).toHaveLength(1));
    expect((classDays(calls)[0].body as Sent).days.map((d) => d.day)).toEqual([1, 2, 3, 4, 5]);
  });
});
