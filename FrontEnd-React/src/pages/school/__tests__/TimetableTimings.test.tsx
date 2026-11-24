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
import type { AcademicStructure, Schedule, SchoolDayInput, Slot, SpecialDay, SpecialDayInput } from "../../../types";
import { addDays } from "../../../utils/calendar";
import { todayInIndia } from "../../../utils/students";
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
/** A day's pill (2026-11-22, the reference pictures): pressed when the school runs that day; a click turns it into a holiday and back. */
const pill = (day: string) => within(screen.getByRole("group", { name: "School days" })).getByRole("button", { name: day });
/** The boxes of a day that has a timing of its own (under the pills), or null. */
const ownDay = (day: string) => screen.queryByRole("region", { name: `${day} timing` });
/** Gives a day that runs on the usual timing a timing of its own ("Another day", then the day; Saturday has its own link). */
async function makeOwn(user: ReturnType<typeof userEvent.setup>, day: string) {
  if (day === "Saturday") return user.click(screen.getByRole("button", { name: "Set different Saturday timing" }));
  await user.click(screen.getByRole("button", { name: /Another day|Set a different timing for a day/ }));
  await user.click(within(screen.getByRole("group", { name: "Day with a different timing" })).getByRole("button", { name: day }));
}
const box = (label: string) => screen.getByLabelText(label);
const saveButton = () => screen.getByRole("button", { name: "Save changes" });
const server = (status: number, message: string, code?: string, details?: object[]) => () =>
  new Response(JSON.stringify({ success: false, message, code, details }), { status, headers: { "Content-Type": "application/json" } });
const times = (slots: Slot[]) => slots.map((s) => `${s.kind} ${s.start}-${s.end}`);
/** A time of day moved by some minutes ("08:30", -10 is "08:20"). */
const shift = (clock: string, by: number) => {
  const [h, m] = clock.split(":").map(Number);
  const t = h * 60 + m + by;
  return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
};

describe("School timings: a school that has none yet", () => {
  it("opens with the usual numbers, Monday to Saturday as usual days and Sunday a holiday, and the day drawn period by period", async () => {
    openPage([]);
    // The title is drawn again when the loaded page replaces the loading one, so it is asked for after the numbers are there.
    expect(await screen.findByLabelText("Usual day: school starts")).toHaveValue("08:30");
    expect(screen.getByRole("heading", { name: "School timings", level: 1 })).toBeInTheDocument();
    expect(box("Usual day: minutes in a period")).toHaveValue(40);
    expect(box("Usual day: number of periods")).toHaveValue(8);
    expect(box("Usual day: lunch from")).toHaveValue("10:30");
    expect(pill("Monday")).toHaveAttribute("aria-pressed", "true");
    expect(pill("Saturday")).toHaveAttribute("aria-pressed", "true");
    expect(pill("Sunday")).toHaveAttribute("aria-pressed", "false");
    expect(ownDay("Saturday")).not.toBeInTheDocument();
    const preview = screen.getByRole("list", { name: "Usual day, period by period" });
    expect(within(preview).getAllByRole("listitem")).toHaveLength(9);
    expect(within(preview).getByText("Lunch")).toBeInTheDocument();
    // The day's figures (2026-11-22): the school's hours and the classes' hours, worked out from the numbers.
    expect(screen.getByText("School time").parentElement).toHaveTextContent("08:30–14:205 hr 50 min");
    expect(screen.getByText("Class time").parentElement).toHaveTextContent("08:30–14:20From when school starts");
    expect(screen.getByText("6-day week · all days use the usual timing")).toBeInTheDocument();
  });

  it("sends the whole week in one request: the rows of each day with school, Sunday left out", async () => {
    const { calls, user } = openPage([]);
    await user.click(await screen.findByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(sent(calls)).toHaveLength(1));
    const body = sent(calls)[0];
    expect(body.days.map((d) => d.day)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(times(body.days[0].slots)).toEqual(times(REGULAR_ROWS));
    // The top says when it was saved ("Saved · 2:51 PM").
    expect(await screen.findByText(/^Saved · \d{1,2}:\d{2} (AM|PM)$/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Now make each class's timetable" })).toBeInTheDocument();
  });
});

describe("School timings: the days of the week", () => {
  it("reads the school's timings: the usual days, a different Saturday, and a holiday on the day nothing covers", async () => {
    openPage([REGULAR, SATURDAY]);
    await screen.findByLabelText("Usual day: school starts");
    expect(pill("Friday")).toHaveAttribute("aria-pressed", "true");
    expect(pill("Saturday")).toHaveAttribute("aria-pressed", "true");
    expect(ownDay("Saturday")).toBeInTheDocument();
    expect(ownDay("Friday")).not.toBeInTheDocument();
    expect(pill("Sunday")).toHaveAttribute("aria-pressed", "false");
    expect(box("Saturday: number of periods")).toHaveValue(4);
    expect(ownDay("Saturday")).toHaveTextContent("08:30 to 11:10 · 4 periods · no lunch");
    expect(screen.getByText("6-day week · Saturday has its own timing")).toBeInTheDocument();
    expect(saveButton()).toBeDisabled();
  });

  it("makes Saturday a short day of its own, starting from the usual day, and sends its own rows", async () => {
    const { calls, user } = openPage([REGULAR]);
    await screen.findByLabelText("Usual day: school starts");
    expect(pill("Saturday")).toHaveAttribute("aria-pressed", "false");
    // The school opens on Saturday (usual timing), then Saturday gets its own.
    await user.click(pill("Saturday"));
    await makeOwn(user, "Saturday");
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
    // 30-minute periods (four of them end as lunch starts: nothing runs into it).
    await user.clear(box("Usual day: minutes in a period"));
    await user.type(box("Usual day: minutes in a period"), "30");
    expect(saveButton()).toBeEnabled();
    // Every usual day ends at another time now (the week is one usual day), and the bar says what waits to be saved.
    expect(screen.getByText("School time").parentElement).not.toHaveTextContent("14:20");
    expect(screen.getByText("You have unsaved changes")).toBeInTheDocument();
    expect(screen.getByText(/^Period length was updated · applies to 1 class$/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Discard" }));
    expect(box("Usual day: minutes in a period")).toHaveValue(40);
    expect(saveButton()).toBeDisabled();
    expect(screen.queryByText("You have unsaved changes")).not.toBeInTheDocument();
  });

  it("the − and + beside the number of periods step it by one; beside the minutes of a period by five (2026-11-22)", async () => {
    const { user } = openPage([REGULAR]);
    await screen.findByLabelText("Usual day: school starts");
    await user.click(screen.getByRole("button", { name: "Usual day: number of periods: more" }));
    expect(box("Usual day: number of periods")).toHaveValue(9);
    await user.click(screen.getByRole("button", { name: "Usual day: minutes in a period: less" }));
    expect(box("Usual day: minutes in a period")).toHaveValue(35);
    await user.click(screen.getByRole("button", { name: "Usual day: minutes in a period: more" }));
    await user.click(screen.getByRole("button", { name: "Usual day: minutes in a period: more" }));
    expect(box("Usual day: minutes in a period")).toHaveValue(45);
    // A number typed between two fives goes to the next five up (or down).
    await user.clear(box("Usual day: minutes in a period"));
    await user.type(box("Usual day: minutes in a period"), "42");
    await user.click(screen.getByRole("button", { name: "Usual day: minutes in a period: more" }));
    expect(box("Usual day: minutes in a period")).toHaveValue(45);
    await user.click(screen.getByRole("button", { name: "Usual day: minutes in a period: less" }));
    expect(box("Usual day: minutes in a period")).toHaveValue(40);
  });

  it("the assembly's − and + step by five too", async () => {
    const { user } = openPage([REGULAR]);
    await screen.findByLabelText("Usual day: school starts");
    await user.click(box("Usual day: assembly"));
    await user.click(screen.getByRole("button", { name: "Usual day: assembly minutes: more" }));
    expect(box("Usual day: assembly minutes")).toHaveValue(20);
  });

  it("Preview week shows each day of the week: the days with school as their bar, the others as a holiday", async () => {
    const { user } = openPage([REGULAR, SATURDAY]);
    await screen.findByLabelText("Usual day: school starts");
    await user.click(screen.getByRole("button", { name: "Preview week" }));
    const week = within(await screen.findByRole("dialog", { name: "This week" }));
    expect(week.getByRole("list", { name: "Monday preview, period by period" })).toBeInTheDocument();
    expect(week.getByRole("list", { name: "Saturday preview, period by period" })).toBeInTheDocument();
    expect(week.getByText("08:30 to 11:10 · 4 periods · no lunch")).toBeInTheDocument();
    expect(week.queryByRole("list", { name: "Sunday preview, period by period" })).not.toBeInTheDocument();
    expect(week.getByText("Holiday")).toBeInTheDocument();
  });

  it("a day of its own goes back to the usual timing with Use the usual timing", async () => {
    const { user } = openPage([REGULAR, SATURDAY]);
    await screen.findByLabelText("Usual day: school starts");
    await user.click(within(ownDay("Saturday")!).getByRole("button", { name: "Use the usual timing" }));
    expect(ownDay("Saturday")).not.toBeInTheDocument();
    expect(pill("Saturday")).toHaveAttribute("aria-pressed", "true");
    expect(saveButton()).toBeEnabled();
  });

  it("any other day can have its own timing too (Another day)", async () => {
    const { user } = openPage([{ ...REGULAR, days: [1, 2, 3, 4, 5, 6] }]);
    await screen.findByLabelText("Usual day: school starts");
    await makeOwn(user, "Wednesday");
    expect(ownDay("Wednesday")).toBeInTheDocument();
    expect(box("Wednesday: number of periods")).toHaveValue(8);
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
    for (const d of ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"]) await user.click(pill(d));
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
    await user.click(pill("Saturday"));
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
    expect(pill("Saturday")).toHaveAttribute("aria-pressed", "false");
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
    // The assembly is a row a switch turns on (before the first period, 15 minutes to start with).
    expect(screen.queryByLabelText("Usual day: assembly minutes")).not.toBeInTheDocument();
    expect(screen.getByText("No assembly")).toBeInTheDocument();
    await user.click(box("Usual day: assembly"));
    expect(box("Usual day: assembly minutes")).toHaveValue(15);
    await user.clear(box("Usual day: assembly minutes"));
    await user.type(box("Usual day: assembly minutes"), "90");
    expect(screen.getByText("= 1 hr 30 min")).toBeInTheDocument();
    // The lunch says how long it is, from its two times (and the figures on top say it too), and after which period it falls.
    expect(screen.getAllByText("30 min").length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText(/^After Period \d$/)).toBeInTheDocument();
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
    // Ten minutes at the end of a period where it cuts no later period short and does not meet the lunch: after Period 4 (2026-11-22).
    expect(box("Usual day: short break from")).toHaveValue("11:40");
    expect(box("Usual day: short break to")).toHaveValue("11:50");
    expect(screen.getAllByText("10 min").length).toBeGreaterThan(0);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("draws the short break in the day and sends it as a row at its time", async () => {
    const { calls, user } = openPage([REGULAR]);
    await screen.findByLabelText("Usual day: school starts");
    await user.click(box("Usual day: short break"));
    // After lunch, at the end of Period 5: nothing is cut short.
    fireEvent.change(box("Usual day: short break from"), { target: { value: "12:20" } });
    fireEvent.change(box("Usual day: short break to"), { target: { value: "12:35" } });
    const preview = screen.getByRole("list", { name: "Usual day, period by period" });
    expect(within(preview).getByText("Short break")).toBeInTheDocument();
    expect(within(preview).getByText("12:20–12:35")).toBeInTheDocument();
    await user.click(saveButton());
    await waitFor(() => expect(sent(calls)).toHaveLength(1));
    const rows = sent(calls)[0].days[0].slots;
    expect(rows.find((r) => r.kind === "break")).toMatchObject({ label: "Short break", start: "12:20", end: "12:35" });
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
    await user.click(pill("Saturday"));
    await makeOwn(user, "Saturday");
    await user.click(box("Saturday: short break"));
    expect(box("Saturday: short break from")).toBeInTheDocument();
    await user.click(saveButton());
    await waitFor(() => expect(sent(calls)).toHaveLength(1));
    expect(sent(calls)[0].days[5].slots.some((r) => r.kind === "break")).toBe(true);
    expect(sent(calls)[0].days[0].slots.some((r) => r.kind === "break")).toBe(false);
  });
});

/**
 * A time is picked in two clicks (2026-11-22, user: "time select karne ka UI accha karo, jaldi select kar paun"): the clock beside a time box opens
 * the hours of a school day and the minutes by fives; an hour, then a minute, and the box has it (typing in the box still works).
 */
describe("School timings: picking a time", () => {
  it("the clock beside a box opens the hours and the minutes; an hour then a minute sets the time and closes it", async () => {
    const { user } = openPage([REGULAR]);
    await screen.findByLabelText("Usual day: school starts");
    await user.click(screen.getByRole("button", { name: "Pick Usual day: lunch to" }));
    const picker = within(await screen.findByRole("dialog", { name: "Usual day: lunch to: pick a time" }));
    // The hours of a school day first (more on request), the minutes by fives; the time now is the one picked.
    expect(picker.getByRole("button", { name: "11 hours" })).toHaveAttribute("aria-pressed", "true");
    expect(picker.getByRole("button", { name: "00 minutes" })).toHaveAttribute("aria-pressed", "true");
    expect(picker.getAllByRole("button", { name: /minutes$/ }).map((b) => b.textContent)).toEqual(["00", "05", "10", "15", "20", "25", "30", "35", "40", "45", "50", "55"]);
    expect(picker.queryByRole("button", { name: "02 hours" })).not.toBeInTheDocument();
    // An hour keeps the minutes; a minute sets them and closes it.
    await user.click(picker.getByRole("button", { name: "12 hours" }));
    expect(box("Usual day: lunch to")).toHaveValue("12:00");
    await user.click(picker.getByRole("button", { name: "15 minutes" }));
    expect(box("Usual day: lunch to")).toHaveValue("12:15");
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Usual day: lunch to: pick a time" })).not.toBeInTheDocument());
    expect(saveButton()).toBeEnabled();
  });

  it("Show all hours offers the night and early morning too", async () => {
    const { user } = openPage([REGULAR]);
    await screen.findByLabelText("Usual day: school starts");
    await user.click(screen.getByRole("button", { name: "Pick Usual day: school starts" }));
    const picker = within(await screen.findByRole("dialog", { name: "Usual day: school starts: pick a time" }));
    await user.click(picker.getByRole("button", { name: "Show all hours" }));
    await user.click(picker.getByRole("button", { name: "05 hours" }));
    expect(box("Usual day: school starts")).toHaveValue("05:30");
  });

  it("the lunch's figure on top says from when to when, and how long", async () => {
    openPage([REGULAR]);
    await screen.findByLabelText("Usual day: school starts");
    // (The bar's lunch block says the same times to a screen reader.)
    expect(screen.getByText("10:30–11:00", { selector: "p" }).parentElement).toHaveTextContent("Lunch10:30–11:0030 min");
  });
});

/**
 * School and classes start apart (2026-11-22, user: "school 8 baje start, 8:20 se class; school aane ka time jaldi rakho jisse sab aa jayein, fir
 * assembly, fir class"): the time between is an "Arrival" row, the assembly comes after it, and the figures on top say both hours.
 */
describe("School timings: school time and class time", () => {
  it("Classes start later than school: the time between is sent as an Arrival row, the lunch moves with the periods, and both hours are said on top", async () => {
    const { calls, user } = openPage([REGULAR]);
    await screen.findByLabelText("Usual day: school starts");
    expect(box("Usual day: classes start")).toHaveValue("08:30");
    fireEvent.change(box("Usual day: classes start"), { target: { value: "08:50" } });
    expect(box("Usual day: school starts")).toHaveValue("08:30");
    // The lunch stays after Period 3 (it moves the same 20 min), so no period is cut.
    expect(box("Usual day: lunch from")).toHaveValue("10:50");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByText("School time").parentElement).toHaveTextContent("08:30–14:40");
    expect(screen.getByText("Class time").parentElement).toHaveTextContent("08:50–14:40Arrival 08:30–08:50");
    // The time to come in is not a box of the day at a glance (2026-11-22, user: "arrival wala section hatao"): the figures say it.
    expect(within(screen.getByRole("list", { name: "Usual day, period by period" })).queryByText("Arrival")).not.toBeInTheDocument();
    expect(screen.getByText(/^Classes start and Lunch time were updated · /)).toBeInTheDocument();
    await user.click(saveButton());
    await waitFor(() => expect(sent(calls)).toHaveLength(1));
    const rows = sent(calls)[0].days[0].slots;
    expect(rows[0]).toMatchObject({ kind: "break", label: "Arrival", start: "08:30", end: "08:50" });
    expect(rows[1]).toMatchObject({ kind: "period", start: "08:50", end: "09:30" });
  });

  it("an assembly comes out of the time to come in, so classes keep their start; its times are said", async () => {
    const { user } = openPage([REGULAR]);
    await screen.findByLabelText("Usual day: school starts");
    fireEvent.change(box("Usual day: classes start"), { target: { value: "08:50" } });
    await user.click(box("Usual day: assembly"));
    expect(box("Usual day: classes start")).toHaveValue("08:50");
    expect(screen.getByText("08:35–08:50", { selector: "p" })).toBeInTheDocument();
    expect(screen.getByText("Class time").parentElement).toHaveTextContent("08:50–14:40Arrival 08:30–08:35 · Assembly 08:35–08:50");
  });

  it("a saved Arrival row is read back: the school's start and the classes' start each in its box", async () => {
    const rows: Slot[] = [{ kind: "break", label: "Arrival", start: "08:00", end: "08:20" }, ...REGULAR_ROWS.map((s) => ({ ...s, start: shift(s.start, -10), end: shift(s.end, -10) }))];
    openPage([{ ...REGULAR, slots: rows }]);
    expect(await screen.findByLabelText("Usual day: school starts")).toHaveValue("08:00");
    expect(box("Usual day: classes start")).toHaveValue("08:20");
    expect(screen.getByText("School time").parentElement).toHaveTextContent("08:00–14:10");
  });

  it("classes typed before school starts: said, and Save waits", async () => {
    const { calls, user } = openPage([REGULAR]);
    await screen.findByLabelText("Usual day: school starts");
    fireEvent.change(box("Usual day: classes start"), { target: { value: "08:10" } });
    expect(await screen.findByRole("alert")).toHaveTextContent("Classes can start at 08:30 at the earliest, when school starts");
    expect(saveButton()).toBeDisabled();
    await user.click(saveButton());
    expect(sent(calls)).toHaveLength(0);
  });
});

/**
 * Every period is the same length (2026-11-22, user: "sab period ek hi time par rahega; lunch beech me aaye to warning, aur lunch time aage badha
 * do"): a lunch (or short break) that would start inside a period does not cut that period short. It is said, Save waits, and one click moves the
 * lunch to the end of that period (it keeps its length); "Change lunch time" puts the cursor in the lunch box.
 */
describe("School timings: no period is cut short by the lunch", () => {
  it("an assembly that pushes Period 3 into the lunch: a warning says where, and Save waits", async () => {
    const { calls, user } = openPage([REGULAR]);
    await screen.findByLabelText("Usual day: school starts");
    await user.click(box("Usual day: assembly"));
    const warning = await screen.findByRole("alert");
    expect(warning).toHaveTextContent("Lunch starts at 10:30, in the middle of Period 3 (10:05 to 10:45). Move it 25 min earlier (to 10:05) or 15 min later (to 10:45) so that every period is 40 min.");
    expect(saveButton()).toBeDisabled();
    await user.click(saveButton());
    expect(sent(calls)).toHaveLength(0);
  });

  it("Move lunch to 10:45 moves it to the end of that period, keeping its 30 min; the warning goes and the periods are all 40 min", async () => {
    const { calls, user } = openPage([REGULAR]);
    await screen.findByLabelText("Usual day: school starts");
    await user.click(box("Usual day: assembly"));
    await user.click(await screen.findByRole("button", { name: "Move lunch to 10:45" }));
    expect(box("Usual day: lunch from")).toHaveValue("10:45");
    expect(box("Usual day: lunch to")).toHaveValue("11:15");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    await user.click(saveButton());
    await waitFor(() => expect(sent(calls)).toHaveLength(1));
    const periods = sent(calls)[0].days[0].slots.filter((s) => s.kind === "period");
    expect(new Set(periods.map((p) => (Number(p.end.slice(0, 2)) * 60 + Number(p.end.slice(3))) - (Number(p.start.slice(0, 2)) * 60 + Number(p.start.slice(3)))))).toEqual(new Set([40]));
  });

  it("Move lunch to 10:05 moves it earlier, to where that period would start (it keeps its 30 min)", async () => {
    const { user } = openPage([REGULAR]);
    await screen.findByLabelText("Usual day: school starts");
    await user.click(box("Usual day: assembly"));
    await user.click(await screen.findByRole("button", { name: "Move lunch to 10:05" }));
    expect(box("Usual day: lunch from")).toHaveValue("10:05");
    expect(box("Usual day: lunch to")).toHaveValue("10:35");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("a break inside the first period goes only later (not before the first period)", async () => {
    const { user } = openPage([{ ...REGULAR, slots: REGULAR.slots }]);
    await screen.findByLabelText("Usual day: school starts");
    await user.click(box("Usual day: short break"));
    fireEvent.change(box("Usual day: short break from"), { target: { value: "08:50" } });
    fireEvent.change(box("Usual day: short break to"), { target: { value: "09:00" } });
    expect(await screen.findByRole("button", { name: "Move the short break to 09:10" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Move the short break to 08:30" })).not.toBeInTheDocument();
  });

  it("Change lunch time puts the cursor in the lunch box to type another time", async () => {
    const { user } = openPage([REGULAR]);
    await screen.findByLabelText("Usual day: school starts");
    await user.click(box("Usual day: assembly"));
    await user.click(await screen.findByRole("button", { name: "Change lunch time" }));
    expect(box("Usual day: lunch from")).toHaveFocus();
  });

  it("a longer period that runs into the lunch says so too; a short break inside a period the same way", async () => {
    const { user } = openPage([REGULAR]);
    await screen.findByLabelText("Usual day: school starts");
    await user.clear(box("Usual day: minutes in a period"));
    await user.type(box("Usual day: minutes in a period"), "45");
    expect(await screen.findByRole("alert")).toHaveTextContent("Lunch starts at 10:30, in the middle of Period 3 (10:00 to 10:45). Move it 30 min earlier (to 10:00) or 15 min later (to 10:45) so that every period is 45 min.");
    await user.click(screen.getByRole("button", { name: "Move lunch to 10:45" }));
    await user.click(box("Usual day: short break"));
    fireEvent.change(box("Usual day: short break from"), { target: { value: "09:00" } });
    fireEvent.change(box("Usual day: short break to"), { target: { value: "09:10" } });
    expect(await screen.findByRole("alert")).toHaveTextContent("The short break starts at 09:00, in the middle of Period 1 (08:30 to 09:15). Move it 15 min later (to 09:15) so that every period is 45 min.");
    await user.click(screen.getByRole("button", { name: "Move the short break to 09:15" }));
    expect(box("Usual day: short break from")).toHaveValue("09:15");
    expect(box("Usual day: short break to")).toHaveValue("09:25");
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
    await user.click(screen.getByRole("button", { name: "Discard" }));
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

/**
 * Special days (2026-11-22, user: "alag button do, jisse kisi date ka time change kar du aur bata saku, jaise PTM hai to kis kis class ka hai"): the
 * first day and, for days in a row, the last (2026-11-23: "3 se 6 tak"), what the day is (a list, and Other to type a name), for the whole school or
 * some classes, and that day's timing or no classes.
 */
describe("School timings: special days", () => {
  const today = todayInIndia();
  const tomorrow = addDays(today, 1);
  const PTM: SpecialDay = { id: "sp1", date: tomorrow, endDate: tomorrow, title: "PTM", classIds: ["c1"], classNames: ["Nursery"], slots: REGULAR_ROWS.slice(0, 3) };
  const posted = (calls: Call[]) => calls.filter((c) => c.method === "POST" && c.path === "/timetable/special-days").map((c) => c.body as SpecialDayInput);
  const openWith = (days: SpecialDay[] = []) =>
    openPage([REGULAR], {
      "GET /timetable/special-days": () => ({ items: days }),
      "POST /timetable/special-days": (body) => ({ id: "sp9", classNames: [], ...(body as SpecialDayInput) }),
      "PATCH /timetable/special-days/sp2": (body) => ({ id: "sp2", classNames: ["Nursery"], ...(body as SpecialDayInput) }),
      "DELETE /timetable/special-days/sp1": () => null,
    });
  /** Picks what the day is from the list. */
  async function chooseKind(user: ReturnType<typeof userEvent.setup>, dialog: ReturnType<typeof within>, option: string) {
    await user.click(dialog.getByRole("button", { name: /What is the day/ }));
    await user.click(await screen.findByRole("option", { name: option }));
  }

  it("Special day opens a window: the whole school with no classes that day, one day, is sent with no rows", async () => {
    const { calls, user } = openWith();
    await screen.findByLabelText("Usual day: school starts");
    fireEvent.click(screen.getByRole("tab", { name: "Special Day Timings" }));
    await user.click(await screen.findByRole("button", { name: "Add special day" }));
    const dialog = within(await screen.findByRole("dialog"));
    // Nothing can be saved before the day and what it is.
    expect(dialog.getByRole("button", { name: "Save" })).toBeDisabled();
    await user.click(dialog.getByRole("button", { name: "Tomorrow" }));
    await chooseKind(user, dialog, "Annual day");
    await user.click(dialog.getByLabelText("Classes this day"));
    expect(dialog.getByText("No classes this day")).toBeInTheDocument();
    await user.click(dialog.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(posted(calls)).toHaveLength(1));
    expect(posted(calls)[0]).toEqual({ date: tomorrow, endDate: tomorrow, title: "Annual day", classIds: [], slots: [] });
  });

  it("the list of days has the usual ones; Other opens a box to type another name", async () => {
    const { calls, user } = openWith();
    await screen.findByLabelText("Usual day: school starts");
    fireEvent.click(screen.getByRole("tab", { name: "Special Day Timings" }));
    await user.click(await screen.findByRole("button", { name: "Add special day" }));
    const dialog = within(await screen.findByRole("dialog"));
    await user.click(dialog.getByRole("button", { name: "Tomorrow" }));
    await user.click(dialog.getByRole("button", { name: /What is the day/ }));
    for (const name of ["PTM", "Half day", "Annual day", "Sports day", "Exam day"]) expect(await screen.findByRole("option", { name })).toBeInTheDocument();
    await user.click(screen.getByRole("option", { name: "Other (type a name)" }));
    expect(dialog.getByRole("button", { name: "Save" })).toBeDisabled();
    await user.type(dialog.getByLabelText(/^Name of the day/), "Science fair");
    await user.click(dialog.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(posted(calls)).toHaveLength(1));
    expect(posted(calls)[0].title).toBe("Science fair");
  });

  it("for some classes, with that day's timing (the usual day to start with, its figures on top)", async () => {
    const { calls, user } = openWith();
    await screen.findByLabelText("Usual day: school starts");
    fireEvent.click(screen.getByRole("tab", { name: "Special Day Timings" }));
    await user.click(await screen.findByRole("button", { name: "Add special day" }));
    const dialog = within(await screen.findByRole("dialog"));
    await user.click(dialog.getByRole("button", { name: "Tomorrow" }));
    await chooseKind(user, dialog, "PTM");
    await user.click(dialog.getByRole("radio", { name: "Some classes" }));
    expect(dialog.getByRole("button", { name: "Save" })).toBeDisabled();
    await user.click(dialog.getByRole("button", { name: /Choose the classes/ }));
    await user.click(await screen.findByRole("option", { name: "Nursery" }));
    await user.keyboard("{Escape}");
    expect(dialog.getByText("School time").parentElement).toHaveTextContent("08:30–14:20");
    // A half day: three periods.
    fireEvent.change(dialog.getByLabelText("Special day: number of periods"), { target: { value: "3" } });
    await user.click(dialog.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(posted(calls)).toHaveLength(1));
    const sent = posted(calls)[0];
    expect(sent).toMatchObject({ date: tomorrow, endDate: tomorrow, title: "PTM", classIds: ["c1"] });
    expect(sent.slots.filter((s) => s.kind === "period").map((s) => s.start)).toEqual(["08:30", "09:10", "09:50"]);
  });

  it("lists the special days to come (days in a row from the first to the last), for whom and their hours; Take off asks first", async () => {
    const WEEK: SpecialDay = { ...PTM, id: "sp2", title: "Sports week", date: tomorrow, endDate: addDays(tomorrow, 3), classIds: [], classNames: [], slots: [] };
    const { calls, user } = openWith([PTM, WEEK, { ...PTM, id: "old", date: addDays(today, -3), endDate: addDays(today, -3), title: "Sports day" }]);
    fireEvent.click(await screen.findByRole("tab", { name: "Special Day Timings" }));
    const card = within(await screen.findByRole("region", { name: "Special days" }));
    expect(await card.findByRole("listitem", { name: /^PTM · / })).toHaveTextContent("Nursery · 08:30 to 10:30");
    const week = card.getByRole("listitem", { name: /^Sports week · / });
    expect(week).toHaveTextContent(" to ");
    expect(week).toHaveTextContent("Whole school · No classes");
    // Days that are over are not listed.
    expect(card.queryByText(/Sports day/)).not.toBeInTheDocument();
    await user.click(card.getByRole("button", { name: "Take off PTM" }));
    const ask = within(await screen.findByRole("dialog"));
    await user.click(ask.getByRole("button", { name: "Take off" }));
    await waitFor(() => expect(calls.some((c) => c.method === "DELETE" && c.path === "/timetable/special-days/sp1")).toBe(true));
  });

  it("Change opens the window with the days as they are, and Save sends the first and the last day", async () => {
    const WEEK: SpecialDay = { ...PTM, id: "sp2", title: "Sports week", date: tomorrow, endDate: addDays(tomorrow, 3) };
    const { calls, user } = openWith([WEEK]);
    fireEvent.click(await screen.findByRole("tab", { name: "Special Day Timings" }));
    const card = within(await screen.findByRole("region", { name: "Special days" }));
    await user.click(await card.findByRole("button", { name: "Change Sports week" }));
    const dialog = within(await screen.findByRole("dialog"));
    // Not one of the list: Other, with its name.
    expect(dialog.getByLabelText(/^Name of the day/)).toHaveValue("Sports week");
    expect(dialog.getByRole("radio", { name: "Some classes" })).toBeChecked();
    expect(dialog.getByLabelText("Special day: number of periods")).toHaveValue(3);
    await user.click(dialog.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(calls.some((c) => c.method === "PATCH")).toBe(true));
    expect(calls.find((c) => c.method === "PATCH")?.body).toMatchObject({ date: tomorrow, endDate: addDays(tomorrow, 3), title: "Sports week" });
  });
});

/**
 * Assembly, Lunch and Short break in one line (2026-11-23, user: "assembly lunch aur short break ko ek hi line mein rakho"): the three rows are one group
 * that is a grid of three columns when its box is wide (a container query), and one under the other when it is narrow. Each row keeps its switch and boxes.
 */
describe("School timings: assembly, lunch and short break side by side", () => {
  it("the three rows are one group laid out in three columns in a wide box, and each row is across (switch and name on top, boxes under)", async () => {
    openPage([REGULAR]);
    await screen.findByLabelText("Usual day: school starts");
    const group = screen.getByRole("group", { name: "Usual day: assembly, lunch and short break" });
    expect(group).toHaveClass("grid", "@4xl:grid-cols-3");
    for (const name of ["Usual day: assembly", "Usual day: lunch break", "Usual day: short break"]) {
      const row = box(name).closest("div.rounded-xl");
      expect(row).not.toBeNull();
      expect(group).toContainElement(row as HTMLElement);
      expect(row).toHaveClass("@4xl:flex-col");
    }
    // Same order as before: assembly, lunch, short break.
    const switches = within(group).getAllByRole("checkbox").map((c) => c.getAttribute("aria-label"));
    expect(switches).toEqual(["Usual day: assembly", "Usual day: lunch break", "Usual day: short break"]);
  });

  // 2026-11-23, user: "20 min right end par dikhao, nahi to section ki height badhti hai".
  it("the length of the lunch and of the short break sits at the row's top right in a wide box (not after the boxes, where it made the row taller)", async () => {
    openPage([REGULAR]);
    await screen.findByLabelText("Usual day: school starts");
    fireEvent.click(box("Usual day: short break"));
    const group = screen.getByRole("group", { name: "Usual day: assembly, lunch and short break" });
    const lunch = within(group).getByText("30 min");
    expect(lunch).toHaveClass("@4xl:absolute", "@4xl:right-4");
    // The row it is in is the one the badge is placed against.
    expect(lunch.closest("div.rounded-xl")).toHaveClass("relative");
    const rest = within(group).getByText("10 min");
    expect(rest).toHaveClass("@4xl:absolute", "@4xl:right-4");
    expect(rest.closest("div.rounded-xl")).not.toBe(lunch.closest("div.rounded-xl"));
  });

  it("each row still works from inside the group: the assembly switch and the lunch boxes", async () => {
    openPage([REGULAR]);
    await screen.findByLabelText("Usual day: school starts");
    expect(box("Usual day: lunch from")).toHaveValue("10:30");
    expect(screen.getByText("No assembly")).toBeInTheDocument();
    fireEvent.click(box("Usual day: assembly"));
    expect(box("Usual day: assembly minutes")).toHaveValue(15);
  });
});
