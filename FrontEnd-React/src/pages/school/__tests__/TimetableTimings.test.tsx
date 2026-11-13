import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Provider } from "react-redux";
import { RouterProvider, createMemoryRouter } from "react-router";
import { ToastProvider } from "../../../components/ui/toast-context";
import { allApiSlices } from "../../../redux/api/apiRoot";
import store from "../../../redux/store";
import { fakeApi, type Call, type Handler } from "../../../test/fakeApi";
import { OVERVIEW, REGULAR, REGULAR_ROWS } from "../../../test/timetableFixtures";
import type { AcademicStructure, Schedule, SchoolDayInput, Slot } from "../../../types";
import SchoolTimingsPage from "../SchoolTimings";

const STRUCTURE: AcademicStructure = {
  academicYear: { id: "y1", name: "2026-2027" },
  settings: { sectionDetailsRequired: false },
  departments: [],
  classes: [{ id: "c1", name: "Nursery", order: 1, departmentId: null, capacity: null, sections: [] }],
  totals: { departments: 0, classes: 1, sections: 0, seats: 0 },
};

/** A short Saturday: four periods of 40 minutes from 08:30, no lunch. */
const SATURDAY_ROWS: Slot[] = [
  { kind: "period", label: "", start: "08:30", end: "09:10" },
  { kind: "period", label: "", start: "09:10", end: "09:50" },
  { kind: "period", label: "", start: "09:50", end: "10:30" },
  { kind: "period", label: "", start: "10:30", end: "11:10" },
];
const SATURDAY: Schedule = { id: "t2", name: "Saturday", days: [6], scope: "all", classIds: [], departmentId: null, slots: SATURDAY_ROWS, periods: 4 };
const LITTLE: Schedule = { id: "t3", name: "Little ones", days: [1, 2, 3, 4, 5], scope: "only", classIds: ["c1"], departmentId: null, slots: SATURDAY_ROWS, periods: 4 };

/** The server's answer to the week: one timing for every group of days with the same rows. */
function savedWeek(body: unknown): { items: Schedule[] } {
  const groups = new Map<string, Schedule>();
  for (const d of (body as SchoolDayInput).days) {
    const key = JSON.stringify(d.slots);
    const found = groups.get(key);
    if (found) found.days.push(d.day);
    else groups.set(key, { id: `s${groups.size}`, name: groups.size === 0 ? "Regular" : "Saturday", days: [d.day], scope: "all", classIds: [], departmentId: null, slots: d.slots, periods: d.slots.filter((s) => s.kind === "period").length });
  }
  return { items: [...groups.values()] };
}

function openPage(schedules: Schedule[] = [REGULAR], extra: Record<string, Handler> = {}, entry = "/school/timings") {
  const calls = fakeApi({
    "GET /timetable/overview": () => ({ ...OVERVIEW, counts: { ...OVERVIEW.counts, timings: schedules.length } }),
    "GET /timetable/schedules": () => ({ items: schedules }),
    "GET /academics/structure": () => STRUCTURE,
    "PUT /timetable/school-day": savedWeek,
    ...extra,
  });
  const router = createMemoryRouter(
    [
      { path: "/school/timings", element: <SchoolTimingsPage /> },
      { path: "/school/timetable", element: <p>The class timetables</p> },
    ],
    { initialEntries: [entry] }
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

const sent = (calls: Call[]) => calls.filter((c) => c.method === "PUT" && c.path === "/timetable/school-day").map((c) => c.body as SchoolDayInput);
const mode = (day: string, label: "Usual" | "Different" | "Holiday") => within(screen.getByRole("radiogroup", { name: day })).getByRole("radio", { name: label });
const box = (label: string) => screen.getByLabelText(label);
const saveButton = () => screen.getByRole("button", { name: "Save changes" });
const server = (status: number, message: string, code?: string, details?: object[]) => () =>
  new Response(JSON.stringify({ success: false, message, code, details }), { status, headers: { "Content-Type": "application/json" } });
const times = (slots: Slot[]) => slots.map((s) => `${s.kind} ${s.start}-${s.end}`);

describe("School timings: a school that has none yet", () => {
  it("opens with the usual numbers, Monday to Saturday as usual days and Sunday a holiday, and the day drawn period by period", async () => {
    openPage([]);
    // The title is drawn again when the loaded page replaces the loading one, so it is asked for after the numbers are there.
    expect(await screen.findByLabelText("Usual day: school starts")).toHaveValue("08:30");
    expect(screen.getByRole("heading", { name: "School timings", level: 1 })).toBeInTheDocument();
    expect(box("Usual day: minutes in a period")).toHaveValue(40);
    expect(box("Usual day: number of periods")).toHaveValue(8);
    expect(box("Usual day: lunch from")).toHaveValue("10:30");
    expect(mode("Monday", "Usual")).toHaveAttribute("aria-checked", "true");
    expect(mode("Saturday", "Usual")).toHaveAttribute("aria-checked", "true");
    expect(mode("Sunday", "Holiday")).toHaveAttribute("aria-checked", "true");
    const preview = screen.getByRole("list", { name: "Usual day, period by period" });
    expect(within(preview).getAllByRole("listitem")).toHaveLength(9);
    expect(within(preview).getByText("Lunch")).toBeInTheDocument();
    expect(screen.getAllByText("08:30 to 14:20 · 8 periods · lunch 10:30 to 11:00").length).toBeGreaterThan(0);
  });

  it("sends the whole week in one request: the rows of each day with school, Sunday left out", async () => {
    const { calls, user } = openPage([]);
    await user.click(await screen.findByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(sent(calls)).toHaveLength(1));
    const body = sent(calls)[0];
    expect(body.days.map((d) => d.day)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(times(body.days[0].slots)).toEqual(times(REGULAR_ROWS));
    expect(await screen.findByText("Saved.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Now make each class's timetable" })).toBeInTheDocument();
  });
});

describe("School timings: the days of the week", () => {
  it("reads the school's timings: the usual days, a different Saturday, and a holiday on the day nothing covers", async () => {
    openPage([REGULAR, SATURDAY]);
    await screen.findByLabelText("Usual day: school starts");
    expect(mode("Friday", "Usual")).toHaveAttribute("aria-checked", "true");
    expect(mode("Saturday", "Different")).toHaveAttribute("aria-checked", "true");
    expect(mode("Sunday", "Holiday")).toHaveAttribute("aria-checked", "true");
    expect(box("Saturday: number of periods")).toHaveValue(4);
    expect(screen.getByText("08:30 to 11:10 · 4 periods · no lunch")).toBeInTheDocument();
    expect(saveButton()).toBeDisabled();
  });

  it("makes Saturday a short day of its own, starting from the usual day, and sends its own rows", async () => {
    const { calls, user } = openPage([REGULAR]);
    await screen.findByLabelText("Usual day: school starts");
    expect(mode("Saturday", "Holiday")).toHaveAttribute("aria-checked", "true");
    await user.click(mode("Saturday", "Different"));
    expect(box("Saturday: number of periods")).toHaveValue(8);
    await user.clear(box("Saturday: number of periods"));
    await user.type(box("Saturday: number of periods"), "4");
    await user.click(box("Saturday: lunch break"));
    expect(screen.getByRole("list", { name: "Saturday, period by period" }).children).toHaveLength(4);
    await user.click(saveButton());
    await waitFor(() => expect(sent(calls)).toHaveLength(1));
    const body = sent(calls)[0];
    expect(body.days.map((d) => d.day)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(times(body.days[5].slots)).toEqual(times(SATURDAY_ROWS));
  });

  it("changes every usual day at once, and can throw the change away", async () => {
    const { user } = openPage([REGULAR]);
    await screen.findByLabelText("Usual day: school starts");
    await user.clear(box("Usual day: minutes in a period"));
    await user.type(box("Usual day: minutes in a period"), "45");
    expect(saveButton()).toBeEnabled();
    expect(within(screen.getByRole("list", { name: "Days of the week" })).getAllByText(/^08:30 to .* · 8 periods/)[0]).not.toHaveTextContent("14:20");
    await user.click(screen.getByRole("button", { name: "Throw away changes" }));
    expect(box("Usual day: minutes in a period")).toHaveValue(40);
    expect(saveButton()).toBeDisabled();
  });
});

describe("School timings: what is said before and after sending", () => {
  it("will not send a day without periods, and says so", async () => {
    const { calls, user } = openPage([REGULAR]);
    await screen.findByLabelText("Usual day: school starts");
    await user.clear(box("Usual day: number of periods"));
    await user.type(box("Usual day: number of periods"), "0");
    expect(await screen.findByRole("alert")).toHaveTextContent("Add at least one period");
    expect(saveButton()).toBeDisabled();
    expect(sent(calls)).toHaveLength(0);
  });

  it("needs at least one day with school", async () => {
    const { user } = openPage([REGULAR]);
    await screen.findByLabelText("Usual day: school starts");
    for (const d of ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"]) await user.click(mode(d, "Holiday"));
    expect(await screen.findByRole("alert")).toHaveTextContent("Keep at least one day with school");
    expect(saveButton()).toBeDisabled();
  });

  it("shows the server's reason when a timetable has lessons in a period the change takes away", async () => {
    const message = "This change would leave 1 period with lessons in 1 class without a place in the day (for example Class 5 - A, Friday period 8). Take those lessons out of the timetable first.";
    const { user } = openPage([REGULAR], { "PUT /timetable/school-day": server(409, message, "SCHEDULE_IN_USE") });
    await screen.findByLabelText("Usual day: school starts");
    await user.clear(box("Usual day: number of periods"));
    await user.type(box("Usual day: number of periods"), "7");
    await user.click(saveButton());
    expect(await screen.findByRole("alert")).toHaveTextContent(message);
  });

  it("names the day of a box the server refused", async () => {
    const { user } = openPage([REGULAR], { "PUT /timetable/school-day": server(400, "Invalid request data", "VALIDATION_ERROR", [{ path: "days.4.slots.0.end", message: "A period lasts 10 to 120 minutes" }]) });
    await screen.findByLabelText("Usual day: school starts");
    await user.click(mode("Saturday", "Usual"));
    await user.click(saveButton());
    expect(await screen.findByRole("alert")).toHaveTextContent("Friday: A period lasts 10 to 120 minutes");
  });

  it("warns that rows changed by hand are made again from the numbers", async () => {
    const hand = { ...REGULAR, slots: REGULAR_ROWS.map((s, i) => (i === 0 ? { ...s, end: "09:05" } : s)) };
    openPage([hand]);
    expect(await screen.findByText(/Some times of Regular were changed by hand/)).toBeInTheDocument();
  });
});

describe("School timings: the school's week is saved on its own", () => {
  it("saves the week of the whole school: no department in the request", async () => {
    const { calls, user } = openPage([{ ...REGULAR, days: [1, 2, 3, 4, 5, 6] }]);
    const periods = await screen.findByLabelText("Usual day: number of periods");
    await user.clear(periods);
    await user.type(periods, "7");
    await user.click(saveButton());
    await waitFor(() => expect(sent(calls)).toHaveLength(1));
    expect(sent(calls)[0].departmentId).toBeUndefined();
    expect(sent(calls)[0].days.map((d) => d.slots.filter((r) => r.kind === "period").length)).toEqual([7, 7, 7, 7, 7, 7]);
  });

  it("a timing made for one class is not part of the school's week (Saturday stays a holiday)", async () => {
    openPage([REGULAR, LITTLE]);
    await screen.findByLabelText("Usual day: school starts");
    expect(mode("Saturday", "Holiday")).toHaveAttribute("aria-checked", "true");
  });

  it("has no line of help under Days of the week", async () => {
    openPage([REGULAR]);
    await screen.findByLabelText("Usual day: school starts");
    expect(screen.getByRole("heading", { name: "Days of the week" })).toBeInTheDocument();
    expect(screen.queryByText(/Each day follows the usual day/)).not.toBeInTheDocument();
  });
});

describe("School timings: the usual day's numbers, in minutes, with the breaks at their times", () => {
  /** The REGULAR day with a short break from 09:50 to 10:05 (the rows the server would hold). */
  const WITH_BREAK_ROWS: Slot[] = [
    { kind: "period", label: "", start: "08:30", end: "09:10" },
    { kind: "period", label: "", start: "09:10", end: "09:50" },
    { kind: "break", label: "Short break", start: "09:50", end: "10:05" },
    { kind: "period", label: "", start: "10:05", end: "10:30" },
    { kind: "lunch", label: "Lunch", start: "10:30", end: "11:00" },
    { kind: "period", label: "", start: "11:00", end: "11:40" },
  ];

  it("says in words how long a period, the assembly and the breaks are: 60 minutes is 1 hr, 90 is 1 hr 30 min", async () => {
    const { user } = openPage([REGULAR]);
    await screen.findByLabelText("Usual day: school starts");
    // 40 minutes needs no words; the unit is in the box.
    expect(screen.queryByText(/^= /)).not.toBeInTheDocument();
    await user.clear(box("Usual day: minutes in a period"));
    await user.type(box("Usual day: minutes in a period"), "60");
    expect(screen.getByText("= 1 hr")).toBeInTheDocument();
    await user.clear(box("Usual day: assembly minutes"));
    await user.type(box("Usual day: assembly minutes"), "90");
    expect(screen.getByText("= 1 hr 30 min")).toBeInTheDocument();
    // The lunch says how long it is, from its two times.
    expect(screen.getByText("30 min")).toBeInTheDocument();
  });

  it("has a lunch and one short break, each with a from time and a to time; the short break is off until it is asked for", async () => {
    const { user } = openPage([REGULAR]);
    await screen.findByLabelText("Usual day: school starts");
    expect(box("Usual day: lunch break")).toBeChecked();
    expect(box("Usual day: short break")).not.toBeChecked();
    expect(screen.queryByLabelText("Usual day: short break from")).not.toBeInTheDocument();
    // No "after period" boxes and no button to add more breaks.
    expect(screen.queryByRole("button", { name: "Add a short break" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/short break 1 after period/)).not.toBeInTheDocument();
    await user.click(box("Usual day: short break"));
    expect(box("Usual day: short break from")).toHaveValue("09:50");
    expect(box("Usual day: short break to")).toHaveValue("10:00");
    expect(screen.getAllByText("10 min").length).toBeGreaterThan(0);
  });

  it("draws the short break in the day and sends it as a row at its time", async () => {
    const { calls, user } = openPage([REGULAR]);
    await screen.findByLabelText("Usual day: school starts");
    await user.click(box("Usual day: short break"));
    fireEvent.change(box("Usual day: short break from"), { target: { value: "09:50" } });
    fireEvent.change(box("Usual day: short break to"), { target: { value: "10:05" } });
    const preview = screen.getByRole("list", { name: "Usual day, period by period" });
    expect(within(preview).getByText("Short break")).toBeInTheDocument();
    expect(within(preview).getByText("09:50–10:05")).toBeInTheDocument();
    expect(screen.getAllByText(/short break 09:50 to 10:05/).length).toBeGreaterThan(0);
    await user.click(saveButton());
    await waitFor(() => expect(sent(calls)).toHaveLength(1));
    const rows = sent(calls)[0].days[0].slots;
    expect(rows.find((r) => r.kind === "break")).toMatchObject({ label: "Short break", start: "09:50", end: "10:05" });
    expect(rows.filter((r) => r.kind === "break")).toHaveLength(1);
  });

  it("reads a saved short break back into its boxes", async () => {
    openPage([{ ...REGULAR, slots: WITH_BREAK_ROWS, periods: 4 }]);
    expect(await screen.findByLabelText("Usual day: short break from")).toHaveValue("09:50");
    expect(box("Usual day: short break to")).toHaveValue("10:05");
    expect(box("Usual day: short break")).toBeChecked();
    expect(saveButton()).toBeDisabled();
  });

  it("says when the short break and the lunch share time, or a break ends before it starts, and sends nothing", async () => {
    const { calls, user } = openPage([REGULAR]);
    await screen.findByLabelText("Usual day: school starts");
    await user.click(box("Usual day: short break"));
    fireEvent.change(box("Usual day: short break from"), { target: { value: "10:20" } });
    fireEvent.change(box("Usual day: short break to"), { target: { value: "10:40" } });
    expect(await screen.findByRole("alert")).toHaveTextContent("The short break and the lunch overlap");
    expect(saveButton()).toBeDisabled();
    fireEvent.change(box("Usual day: short break to"), { target: { value: "10:10" } });
    expect(await screen.findByRole("alert")).toHaveTextContent("The short break must end after it starts");
    expect(sent(calls)).toHaveLength(0);
  });

  it("turning the short break off takes it out of the day again", async () => {
    const { user } = openPage([{ ...REGULAR, slots: WITH_BREAK_ROWS, periods: 4 }]);
    await screen.findByLabelText("Usual day: short break from");
    await user.click(box("Usual day: short break"));
    expect(screen.queryByLabelText("Usual day: short break from")).not.toBeInTheDocument();
    expect(within(screen.getByRole("list", { name: "Usual day, period by period" })).queryByText("Short break")).not.toBeInTheDocument();
    expect(saveButton()).toBeEnabled();
  });

  it("a day of its own has the same boxes (Saturday with a short break)", async () => {
    const { calls, user } = openPage([REGULAR]);
    await screen.findByLabelText("Usual day: school starts");
    await user.click(mode("Saturday", "Different"));
    await user.click(box("Saturday: short break"));
    expect(box("Saturday: short break from")).toBeInTheDocument();
    await user.click(saveButton());
    await waitFor(() => expect(sent(calls)).toHaveLength(1));
    expect(sent(calls)[0].days[5].slots.some((r) => r.kind === "break")).toBe(true);
    expect(sent(calls)[0].days[0].slots.some((r) => r.kind === "break")).toBe(false);
  });
});

describe("School timings: changes that are not saved are asked about before leaving them", () => {
  const open = (schedules: Schedule[] = [{ ...REGULAR, days: [1, 2, 3, 4, 5, 6] }], extra: Record<string, Handler> = {}) => openPage(schedules, extra);
  const asked = (title: string) => screen.findByRole("dialog", { name: title });
  /** Goes to the Class timetables page (what the menu entry does). */
  const leave = (router: ReturnType<typeof openPage>["router"]) => act(async () => void router.navigate("/school/timetable"));

  it("asks nothing when the change was thrown away", async () => {
    const { router, user } = open();
    const periods = await screen.findByLabelText("Usual day: number of periods");
    await user.clear(periods);
    await user.type(periods, "6");
    await user.click(screen.getByRole("button", { name: "Throw away changes" }));
    await leave(router);
    await waitFor(() => expect(router.state.location.pathname).toBe("/school/timetable"));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("asks before another page is opened, saves when told to, and then opens it", async () => {
    const { calls, router, user } = open();
    const periods = await screen.findByLabelText("Usual day: number of periods");
    await user.clear(periods);
    await user.type(periods, "7");
    await leave(router);
    const dialog = await asked("Save the changes to the school's timing?");
    expect(router.state.location.pathname).toBe("/school/timings");
    await user.click(within(dialog).getByRole("button", { name: "Save and continue" }));
    await waitFor(() => expect(sent(calls)).toHaveLength(1));
    await waitFor(() => expect(router.state.location.pathname).toBe("/school/timetable"));
  });

  it("Don't save opens the other page without sending anything, and Cancel stays on this one", async () => {
    const { calls, router, user } = open();
    const periods = await screen.findByLabelText("Usual day: number of periods");
    await user.clear(periods);
    await user.type(periods, "7");
    await leave(router);
    await user.click(within(await asked("Save the changes to the school's timing?")).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(router.state.location.pathname).toBe("/school/timings");
    await leave(router);
    await user.click(within(await asked("Save the changes to the school's timing?")).getByRole("button", { name: "Don't save" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/school/timetable"));
    expect(sent(calls)).toHaveLength(0);
  });

  it("opening the other page asks nothing when nothing was changed", async () => {
    const { router } = open();
    await screen.findByLabelText("Usual day: school starts");
    await leave(router);
    await waitFor(() => expect(router.state.location.pathname).toBe("/school/timetable"));
  });

  it("says why when the server refuses the save, and stays where it was", async () => {
    const message = "This change would leave 1 period with lessons in 1 class without a place in the day (for example Class 5 - A, Friday period 8). Take those lessons out of the timetable first.";
    const { router, user } = open(undefined, { "PUT /timetable/school-day": server(409, message, "SCHEDULE_IN_USE") });
    const periods = await screen.findByLabelText("Usual day: number of periods");
    await user.clear(periods);
    await user.type(periods, "7");
    await leave(router);
    const dialog = await asked("Save the changes to the school's timing?");
    await user.click(within(dialog).getByRole("button", { name: "Save and continue" }));
    expect(await within(dialog).findByText(message)).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/school/timings");
    expect(screen.getByRole("dialog", { name: "Save the changes to the school's timing?" })).toBeInTheDocument();
  });

  it("cannot save what is not right yet: it says what to fix, and Save and continue waits", async () => {
    const { calls, router, user } = open();
    const periods = await screen.findByLabelText("Usual day: number of periods");
    await user.clear(periods);
    await user.type(periods, "0");
    await leave(router);
    const dialog = await asked("Save the changes to the school's timing?");
    expect(within(dialog).getByText("Add at least one period")).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Save and continue" })).toBeDisabled();
    expect(sent(calls)).toHaveLength(0);
  });
});
