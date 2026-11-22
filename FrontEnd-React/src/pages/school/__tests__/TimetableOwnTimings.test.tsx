import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Provider } from "react-redux";
import { RouterProvider, createMemoryRouter } from "react-router";
import { ToastProvider } from "../../../components/ui/toast-context";
import { allApiSlices } from "../../../redux/api/apiRoot";
import store from "../../../redux/store";
import { fakeApi, type Call, type Handler } from "../../../test/fakeApi";
import { OVERVIEW, REGULAR } from "../../../test/timetableFixtures";
import type { AcademicStructure, ClassDayInput, Schedule, SchoolDayInput, Slot } from "../../../types";
import SchoolTimingsPage from "../SchoolTimings";

/**
 * School timings, 2026-11-13 (user, with the reference pictures): every department can keep a timing of its own, not only Pre-Primary, and so
 * can any one class. Departments sit in a card beside the school's day, each with Same as school on or off; classes are listed in a card of
 * their own, added and changed in a window. One Save changes (in the bar at the bottom) saves the school's week and the departments.
 */

const STRUCTURE: AcademicStructure = {
  academicYear: { id: "y1", name: "2026-2027" },
  settings: { sectionDetailsRequired: false },
  departments: [
    { id: "d1", name: "Pre-Primary", classCount: 1 },
    { id: "d2", name: "Primary", classCount: 2 },
  ],
  classes: [
    { id: "c1", name: "Nursery", order: 1, departmentId: "d1", capacity: null, sections: [] },
    { id: "c2", name: "Class 1", order: 2, departmentId: "d2", capacity: null, sections: [] },
    { id: "c3", name: "Class 2", order: 3, departmentId: "d2", capacity: null, sections: [] },
  ],
  totals: { departments: 2, classes: 3, sections: 0, seats: 0 },
};

const FOUR_ROWS: Slot[] = [
  { kind: "period", label: "", start: "08:30", end: "09:10" },
  { kind: "period", label: "", start: "09:10", end: "09:50" },
  { kind: "period", label: "", start: "09:50", end: "10:30" },
  { kind: "period", label: "", start: "10:30", end: "11:10" },
];
const SIX: Schedule = { ...REGULAR, days: [1, 2, 3, 4, 5, 6] };
/** Primary keeps its own timing (four periods, Monday to Saturday); Pre-Primary follows the school. */
const PRIMARY_OWN: Schedule = { id: "q1", name: "Primary", days: [1, 2, 3, 4, 5, 6], scope: "only", classIds: ["c2", "c3"], departmentId: "d2", slots: FOUR_ROWS, periods: 4 };
/** Class 1 comes at its own hours (four periods, Monday to Saturday). */
const CLASS_OWN: Schedule = { id: "k1", name: "Class 1", days: [1, 2, 3, 4, 5, 6], scope: "only", classIds: ["c2"], departmentId: null, slots: FOUR_ROWS, periods: 4 };

const periodsOf = (slots: Slot[]) => slots.filter((s) => s.kind === "period").length;

/** A school's timings that change like the server's do: the answer of every save is the whole list as it is now. */
function server(initial: Schedule[], extra: Record<string, Handler> = {}): Record<string, Handler> {
  let items = [...initial];
  const grouped = (days: { day: number; slots: Slot[] }[], make: (n: number, d: number[], slots: Slot[]) => Schedule) => {
    const groups = new Map<string, { days: number[]; slots: Slot[] }>();
    for (const d of days) {
      const key = JSON.stringify(d.slots);
      const found = groups.get(key);
      if (found) found.days.push(d.day);
      else groups.set(key, { days: [d.day], slots: d.slots });
    }
    return [...groups.values()].map((g, i) => make(i, g.days, g.slots));
  };
  return {
    "GET /timetable/overview": () => ({ ...OVERVIEW, counts: { ...OVERVIEW.counts, timings: items.length } }),
    "GET /timetable/schedules": () => ({ items }),
    "GET /academics/structure": () => STRUCTURE,
    "PUT /timetable/school-day": (body) => {
      const b = body as SchoolDayInput;
      const mine = (s: Schedule) => (b.departmentId ? s.departmentId === b.departmentId : s.scope === "all");
      const classIds = STRUCTURE.classes.filter((c) => c.departmentId === b.departmentId).map((c) => c.id);
      items = [
        ...items.filter((s) => !mine(s)),
        ...grouped(b.days, (i, days, slots) => ({
          id: `${b.departmentId ?? "school"}-${i}`,
          name: b.departmentId ? "Department" : "Regular",
          days,
          scope: b.departmentId ? "only" : "all",
          classIds: b.departmentId ? classIds : [],
          departmentId: b.departmentId ?? null,
          slots,
          periods: periodsOf(slots),
        })),
      ];
      return { items };
    },
    "DELETE /timetable/school-day/d1": () => {
      items = items.filter((s) => s.departmentId !== "d1");
      return { items };
    },
    "DELETE /timetable/school-day/d2": () => {
      items = items.filter((s) => s.departmentId !== "d2");
      return { items };
    },
    "PUT /timetable/class-day": (body) => {
      const b = body as ClassDayInput;
      const own = (s: Schedule) => s.scope === "only" && !s.departmentId && s.classIds.length === 1 && s.classIds[0] === b.classId;
      items = [
        ...items.filter((s) => !own(s)),
        ...grouped(b.days, (i, days, slots) => ({ id: `own-${b.classId}-${i}`, name: b.classId, days, scope: "only", classIds: [b.classId], departmentId: null, slots, periods: periodsOf(slots) })),
      ];
      return { items };
    },
    ...extra,
  };
}

function openPage(schedules: Schedule[] = [SIX], extra: Record<string, Handler> = {}, structure: AcademicStructure = STRUCTURE) {
  const calls = fakeApi(server(schedules, { "GET /academics/structure": () => structure, ...extra }));
  const router = createMemoryRouter(
    [
      { path: "/school/timings", element: <SchoolTimingsPage /> },
      { path: "/school/timetable", element: <p>The class timetables</p> },
    ],
    { initialEntries: ["/school/timings"] }
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

const puts = (calls: Call[], path: "/timetable/school-day" | "/timetable/class-day") => calls.filter((c) => c.method === "PUT" && c.path === path).map((c) => c.body);
const weeks = (calls: Call[]) => puts(calls, "/timetable/school-day") as SchoolDayInput[];
const classDays = (calls: Call[]) => puts(calls, "/timetable/class-day") as ClassDayInput[];
const saveButton = () => screen.getByRole("button", { name: "Save changes" });
const region = (name: string) => screen.findByRole("region", { name });
const changeTiming = (r: HTMLElement) => within(r).getByRole("button", { name: "Change timing" });
/** Opens a department's window (Change timing) and answers it. */
async function openWindow(user: ReturnType<typeof userEvent.setup>, department: string) {
  await user.click(changeTiming(await region(`${department} timing`)));
  return screen.findByRole("dialog", { name: `${department} timing` });
}
const windowSave = (dialog: HTMLElement) => within(dialog).getByRole("button", { name: "Save" });
/** A day's pill (2026-11-22): pressed when the school runs that day; a click makes it a holiday and back. */
const pill = (day: string) => within(screen.getByRole("group", { name: "School days" })).getByRole("button", { name: day });
/** The card beside the school's day (2026-11-22: one card, Class & department timings). */
/** Saved / Unsaved changes, at the top of the page. */
const saveState = () => screen.getByRole("status", { name: /^(Saved|Unsaved changes)/ });
const groupCard = () => screen.findByRole("heading", { name: "Class & department timings" });
const refused = (status: number, message: string, code?: string) => () => new Response(JSON.stringify({ success: false, message, code }), { status, headers: { "Content-Type": "application/json" } });

describe("School timings: every department can have its own timing", () => {
  it("each department has a card that follows the school, says what it follows, and has Change timing; no boxes in the page", async () => {
    openPage();
    expect(await groupCard()).toBeInTheDocument();
    expect(screen.getByRole("list", { name: "Department timings" })).toBeInTheDocument();
    for (const name of ["Pre-Primary", "Primary"]) {
      const r = await region(`${name} timing`);
      expect(r).toHaveTextContent("Same as school");
      // Pre-Primary's day is said as hours (see the last describe); the others count their periods.
      expect(r).toHaveTextContent(name === "Pre-Primary" ? "08:30 to 14:20 · lunch 10:30 to 11:00" : "08:30 to 14:20 · 8 periods · lunch 10:30 to 11:00");
      expect(changeTiming(r)).toBeInTheDocument();
      expect(screen.queryByLabelText(`${name}: school starts`)).not.toBeInTheDocument();
    }
  });

  it("a school with no department has no such card", async () => {
    openPage([SIX], {}, { ...STRUCTURE, departments: [], classes: STRUCTURE.classes.map((c) => ({ ...c, departmentId: null })) });
    await screen.findByLabelText("Usual day: school starts");
    expect(screen.queryByRole("list", { name: "Department timings" })).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: /timing$/ })).not.toBeInTheDocument();
    // The card is still there for a class that needs hours of its own.
    expect(screen.getByRole("button", { name: "Add class timing" })).toBeInTheDocument();
  });

  it("Change timing opens a window with the usual boxes, starting from the school's day; its Save waits until something is different", async () => {
    const { calls, user } = openPage();
    const dialog = await openWindow(user, "Primary");
    expect(within(dialog).getByLabelText("Primary: school starts")).toHaveValue("08:30");
    expect(within(dialog).getByLabelText("Primary: number of periods")).toHaveValue(8);
    expect(within(dialog).getByLabelText("Primary: lunch from")).toHaveValue("10:30");
    expect(windowSave(dialog)).toBeDisabled();
    // Nothing is a change in the page behind it (a window hides the page from the accessibility tree: asked for as hidden).
    expect(screen.getByRole("button", { name: "Save changes", hidden: true })).toBeDisabled();
    // 07:50: four periods end just as lunch starts (nothing runs into it).
    fireEvent.change(within(dialog).getByLabelText("Primary: school starts"), { target: { value: "07:50" } });
    expect(windowSave(dialog)).toBeEnabled();
    expect(weeks(calls)).toHaveLength(0);
  });

  it("a start that makes a period run into the lunch: the window says so, its Save waits, and Move lunch puts the lunch after that period (2026-11-22)", async () => {
    const { user } = openPage();
    const dialog = await openWindow(user, "Primary");
    fireEvent.change(within(dialog).getByLabelText("Primary: school starts"), { target: { value: "09:00" } });
    expect(within(dialog).getByRole("alert")).toHaveTextContent("Lunch starts at 10:30, in the middle of Period 3 (10:20 to 11:00).");
    expect(windowSave(dialog)).toBeDisabled();
    await user.click(within(dialog).getByRole("button", { name: "Move lunch to 11:00" }));
    expect(within(dialog).getByLabelText("Primary: lunch from")).toHaveValue("11:00");
    expect(within(dialog).queryByRole("alert")).not.toBeInTheDocument();
    expect(windowSave(dialog)).toBeEnabled();
  });

  it("Cancel sends nothing and leaves the department following the school", async () => {
    const { calls, user } = openPage();
    const dialog = await openWindow(user, "Primary");
    fireEvent.change(within(dialog).getByLabelText("Primary: school starts"), { target: { value: "09:00" } });
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(await region("Primary timing")).toHaveTextContent("Same as school");
    expect(weeks(calls)).toHaveLength(0);
  });

  it("Save in the window sends that department only, on the school's usual days, closes the window, and the card says Custom timing", async () => {
    const { calls, user } = openPage();
    const dialog = await openWindow(user, "Primary");
    fireEvent.change(within(dialog).getByLabelText("Primary: school starts"), { target: { value: "07:30" } });
    // Period 5 (10:10 to 10:50) would run into the lunch: it goes after it, so every period stays 40 minutes.
    await user.click(within(dialog).getByRole("button", { name: "Move lunch to 10:50" }));
    await user.click(windowSave(dialog));
    await waitFor(() => expect(weeks(calls)).toHaveLength(1));
    const body = weeks(calls)[0];
    expect(body.departmentId).toBe("d2");
    expect(body.days.map((d) => d.day)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(body.days[0].slots[0].start).toBe("07:30");
    expect(body.days[0].slots.find((s) => s.kind === "lunch")).toMatchObject({ start: "10:50", end: "11:20" });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    const r = await region("Primary timing");
    expect(r).toHaveTextContent("Custom timing");
    expect(r).toHaveTextContent(/07:30 to \d\d:\d\d · 8 periods · lunch 10:50 to 11:20/);
    // The page's own Save is about the school's week: it has nothing to save.
    expect(saveButton()).toBeDisabled();
  });

  it("reads a timing a department already has: the card says so, and the window opens with its numbers", async () => {
    const { user } = openPage([SIX, PRIMARY_OWN]);
    const r = await region("Primary timing");
    expect(r).toHaveTextContent("Custom timing");
    expect(r).toHaveTextContent("08:30 to 11:10 · 4 periods · no lunch");
    // Another department still follows the school.
    expect(await region("Pre-Primary timing")).toHaveTextContent("Same as school");
    const dialog = await openWindow(user, "Primary");
    expect(within(dialog).getByLabelText("Primary: number of periods")).toHaveValue(4);
    expect(windowSave(dialog)).toBeDisabled();
  });

  it("Same as school (only in the window of a department that has its own timing) asks first, then takes its own timing away", async () => {
    const { calls, user } = openPage([SIX, PRIMARY_OWN]);
    const dialog = await openWindow(user, "Primary");
    await user.click(within(dialog).getByRole("button", { name: "Same as school" }));
    // The window asks first: Back keeps everything, nothing is sent.
    expect(await within(dialog).findByText("Primary will follow the school's timing again.")).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Back" }));
    expect(calls.some((c) => c.method === "DELETE")).toBe(false);
    expect(within(dialog).getByRole("button", { name: "Same as school" })).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Same as school" }));
    await user.click(within(dialog).getByRole("button", { name: "Use the school's timing" }));
    await waitFor(() => expect(calls.some((c) => c.method === "DELETE" && c.path === "/timetable/school-day/d2")).toBe(true));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(await region("Primary timing")).toHaveTextContent("Same as school");
    // A department that follows the school has nothing to go back to.
    const other = await openWindow(user, "Pre-Primary");
    expect(within(other).queryByRole("button", { name: "Same as school" })).not.toBeInTheDocument();
  });

  it("a department's days follow the school's usual days: a school week saved alone also sends a department whose days no longer match", async () => {
    const { calls, user } = openPage([SIX, PRIMARY_OWN]);
    await screen.findByLabelText("Usual day: school starts");
    await user.click(pill("Saturday"));
    await user.click(saveButton());
    await waitFor(() => expect(weeks(calls)).toHaveLength(2));
    expect(weeks(calls)[0].departmentId).toBeUndefined();
    expect(weeks(calls)[0].days.map((d) => d.day)).toEqual([1, 2, 3, 4, 5]);
    expect(weeks(calls)[1]).toMatchObject({ departmentId: "d2" });
    expect(weeks(calls)[1].days.map((d) => d.day)).toEqual([1, 2, 3, 4, 5]);
    // Its numbers are what it had.
    expect(periodsOf(weeks(calls)[1].days[0].slots)).toBe(4);
    await waitFor(() => expect(saveButton()).toBeDisabled());
  });

  it("will not send numbers that make no day: the window says why and its Save waits", async () => {
    const { calls, user } = openPage();
    const dialog = await openWindow(user, "Primary");
    await user.clear(within(dialog).getByLabelText("Primary: number of periods"));
    await user.type(within(dialog).getByLabelText("Primary: number of periods"), "0");
    expect(within(dialog).getByRole("alert")).toHaveTextContent("Add at least one period");
    expect(windowSave(dialog)).toBeDisabled();
    expect(weeks(calls)).toHaveLength(0);
  });

  it("shows the server's reason in the window, keeps it open and keeps what was typed", async () => {
    const message = "This change would leave 1 period with lessons in 1 class without a place in the day.";
    const { user } = openPage([SIX], { "PUT /timetable/school-day": refused(409, message, "SCHEDULE_IN_USE") });
    const dialog = await openWindow(user, "Primary");
    fireEvent.change(within(dialog).getByLabelText("Primary: school starts"), { target: { value: "07:50" } });
    await user.click(windowSave(dialog));
    expect(await within(dialog).findByText(message)).toBeInTheDocument();
    expect(within(dialog).getByLabelText("Primary: school starts")).toHaveValue("07:50");
    expect(windowSave(dialog)).toBeEnabled();
  });
});

describe("School timings: the day drawn as a timeline, and the Save bar", () => {
  it("draws the usual day at a glance: one bar of its periods (P1...) and lunch, each slot with its times", async () => {
    openPage();
    const line = await screen.findByRole("list", { name: "Usual day, period by period" });
    const items = within(line).getAllByRole("listitem");
    expect(items).toHaveLength(9);
    expect(items[0]).toHaveTextContent("P1");
    expect(items[0]).toHaveTextContent("08:30–09:10");
    expect(items[0]).toHaveAttribute("title", "Period 1 · 08:30–09:10");
    expect(within(line).getByText("Lunch")).toBeInTheDocument();
    // Every box holds its own times, for everyone to see (2026-11-22: boxes of one size, the time inside, not a line of times under the bar).
    expect(within(items[0]).getByText("08:30–09:10")).not.toHaveClass("sr-only");
    expect(within(line).getByText("10:30–11:00")).not.toHaveClass("sr-only");
  });

  it("has one Save changes, off until something changes, and the top says Saved", async () => {
    openPage();
    await screen.findByLabelText("Usual day: school starts");
    expect(saveButton()).toBeDisabled();
    expect(screen.getAllByRole("button", { name: "Save changes" })).toHaveLength(1);
    expect(saveState()).toHaveTextContent("Saved");
    expect(screen.queryByRole("button", { name: "Discard" })).not.toBeInTheDocument();
    expect(screen.queryByText("You have unsaved changes")).not.toBeInTheDocument();
  });

  it("Save changes is fixed to the bottom of the screen, outside the page that scrolls, and is only the buttons: no white card round them", async () => {
    openPage();
    await screen.findByLabelText("Usual day: school starts");
    expect(saveButton().closest(".fixed")).not.toBeNull();
    expect(saveButton().closest(".bg-surface")).toBeNull();
    expect(saveButton().closest(".shadow-float")).toBeNull();
    // Saved is said at the top of the page, not in the bar.
    expect(saveState().closest(".fixed")).toBeNull();
    expect(screen.getByRole("button", { name: "Now make each class's timetable" }).closest(".fixed")).toBeNull();
  });

  it("shows Class & department timings beside the day, level with the Usual school day card, under the title: Add class timing first, then the departments", async () => {
    openPage();
    const card = await groupCard();
    const usual = screen.getByRole("heading", { name: "Usual school day" });
    const title = screen.getByRole("heading", { name: "School timings", level: 1 });
    const add = screen.getByRole("button", { name: "Add class timing" });
    const departments = screen.getByRole("list", { name: "Department timings" });
    expect(add.compareDocumentPosition(departments) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // The two columns are the cells of one grid that starts under the title (user, 2026-11-13: the column beside the day starts level with it).
    const grid = usual.closest(".grid");
    expect(grid).not.toBeNull();
    expect(grid).toContainElement(card);
    expect(grid).toContainElement(departments);
    expect(grid).not.toContainElement(title);
    expect(title.compareDocumentPosition(usual) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("each department row has a thin bar of its day", async () => {
    openPage();
    const r = await region("Primary timing");
    // The bar is only drawn (hidden from a screen reader): its day is said in words beside it.
    expect(r.querySelector('[aria-hidden="true"].h-2\\.5')?.children.length).toBe(9);
  });

  it("Discard stands beside Save once the school's week is changed, says what waits to be saved, and puts it back", async () => {
    const { user } = openPage();
    await screen.findByLabelText("Usual day: school starts");
    await user.click(pill("Saturday"));
    expect(screen.getByRole("button", { name: "Discard" }).closest(".fixed")).not.toBeNull();
    expect(saveState()).toHaveTextContent("Unsaved changes");
    // Pre-Primary and Primary follow the school: all three classes.
    expect(screen.getByText("Days of the week was updated · applies to 3 classes")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Discard" }));
    expect(saveButton()).toBeDisabled();
    expect(saveState()).toHaveTextContent("Saved");
  });
});

describe("School timings: a class can have its own timing", () => {
  const classes = () => groupCard();
  const dialogOf = (name: string) => screen.findByRole("dialog", { name });
  /** Picks the class in the window (2026-11-22: the classes are chips). */
  async function pickClass(user: ReturnType<typeof userEvent.setup>, dialog: HTMLElement, name: string) {
    await user.click(within(within(dialog).getByRole("radiogroup", { name: "Class" })).getByRole("radio", { name }));
  }

  it("says no class has its own timing yet, and offers Add class", async () => {
    openPage();
    await classes();
    expect(screen.getByText("No class has its own timing")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add class timing" })).toBeEnabled();
  });

  it("lists a class that has a timing of its own with what it has, and a button to change it", async () => {
    openPage([SIX, CLASS_OWN]);
    const list = await screen.findByRole("list", { name: "Classes with their own timing" });
    const item = within(list).getByRole("listitem");
    expect(item).toHaveTextContent("Class 1");
    expect(item).toHaveTextContent("Primary");
    expect(item).toHaveTextContent("08:30 to 11:10 · 4 periods · no lunch");
    expect(within(item).getByRole("button", { name: "Edit Class 1 timing" })).toBeInTheDocument();
    expect(screen.queryByText("No class has its own timing")).not.toBeInTheDocument();
  });

  it("a department's timing and one made for several classes are not listed as a class's own", async () => {
    openPage([SIX, PRIMARY_OWN, { ...CLASS_OWN, id: "few", classIds: ["c2", "c3"] }]);
    await classes();
    expect(screen.getByText("No class has its own timing")).toBeInTheDocument();
  });

  it("Add class: pick the class, give it the usual boxes, Save sends its rows for the school's usual days, and it is listed", async () => {
    const { calls, user } = openPage();
    await user.click(await screen.findByRole("button", { name: "Add class timing" }));
    const dialog = await dialogOf("Add class timing");
    // Nothing to fill in before a class is picked.
    expect(within(dialog).queryByLabelText(/school starts/)).not.toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Save" })).toBeDisabled();
    await pickClass(user, dialog, "Class 1");
    expect(within(dialog).getByRole("radio", { name: "Class 1" })).toHaveAttribute("aria-checked", "true");
    expect(within(dialog).getByLabelText("Class 1: school starts")).toHaveValue("08:30");
    // When it ends is worked out, and the preview beside the boxes says the day fits.
    expect(within(dialog).getByLabelText("Class 1: school ends")).toHaveTextContent("14:20");
    const preview = within(dialog).getByRole("complementary", { name: "Day preview" });
    expect(within(preview).getAllByRole("listitem")).toHaveLength(9);
    expect(preview).toHaveTextContent("No clashes. 8 periods fit between 08:30 and 14:20.");
    // Nothing is different yet, so there is nothing to save.
    expect(within(dialog).getByRole("button", { name: "Save" })).toBeDisabled();
    fireEvent.change(within(dialog).getByLabelText("Class 1: school starts"), { target: { value: "07:50" } });
    await user.click(within(dialog).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(classDays(calls)).toHaveLength(1));
    const body = classDays(calls)[0];
    expect(body).toMatchObject({ classId: "c2", removeLessons: false });
    expect(body.days.map((d) => d.day)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(body.days[0].slots[0].start).toBe("07:50");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    const item = within(await screen.findByRole("list", { name: "Classes with their own timing" })).getByRole("listitem");
    expect(item).toHaveTextContent("Class 1");
    expect(item).toHaveTextContent("07:50 to");
  });

  it("a class that already has a timing is not offered again when adding", async () => {
    const { user } = openPage([SIX, CLASS_OWN]);
    await user.click(await screen.findByRole("button", { name: "Add class timing" }));
    const dialog = await dialogOf("Add class timing");
    const chips = within(within(dialog).getByRole("radiogroup", { name: "Class" }));
    expect(chips.queryByRole("radio", { name: "Class 1" })).not.toBeInTheDocument();
    expect(chips.getByRole("radio", { name: "Class 2" })).toBeInTheDocument();
    expect(chips.getByRole("radio", { name: "Nursery" })).toBeInTheDocument();
  });

  it("changing a class starts from its own numbers and sends the new rows", async () => {
    const { calls, user } = openPage([SIX, CLASS_OWN]);
    await user.click(await screen.findByRole("button", { name: "Edit Class 1 timing" }));
    const dialog = await dialogOf("Class 1 timing");
    expect(within(dialog).getByLabelText("Class 1: number of periods")).toHaveValue(4);
    expect(within(dialog).getByRole("button", { name: "Save" })).toBeDisabled();
    await user.clear(within(dialog).getByLabelText("Class 1: number of periods"));
    await user.type(within(dialog).getByLabelText("Class 1: number of periods"), "5");
    await user.click(within(dialog).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(classDays(calls)).toHaveLength(1));
    expect(periodsOf(classDays(calls)[0].days[0].slots)).toBe(5);
  });

  it("Use the school's timing, in the class window, is a button that asks first: the window closes, Are you sure? opens, and Yes sends no days of its own", async () => {
    const { calls, user } = openPage([SIX, CLASS_OWN]);
    await user.click(await screen.findByRole("button", { name: "Edit Class 1 timing" }));
    const dialog = await dialogOf("Class 1 timing");
    await user.click(within(dialog).getByRole("button", { name: "Use the school's timing" }));
    const sure = await screen.findByRole("dialog", { name: "Are you sure?" });
    expect(screen.queryByRole("dialog", { name: "Class 1 timing" })).not.toBeInTheDocument();
    expect(classDays(calls)).toHaveLength(0);
    await user.click(within(sure).getByRole("button", { name: "Yes, use the school's timing" }));
    await waitFor(() => expect(classDays(calls)).toHaveLength(1));
    expect(classDays(calls)[0]).toMatchObject({ classId: "c2", days: [], removeLessons: false });
    expect(await screen.findByText("No class has its own timing")).toBeInTheDocument();
  });

  it("asks before taking lessons out of periods the class will no longer have, and sends that agreement only when told to", async () => {
    const message = "Class 1 has lessons in periods 5 to 8. They would have to be taken out.";
    let first = true;
    const { calls, user } = openPage([SIX, CLASS_OWN], {
      "PUT /timetable/class-day": (body) => {
        if (first) {
          first = false;
          return refused(409, message, "LESSONS_IN_REMOVED_PERIODS")();
        }
        return { items: [SIX, { ...CLASS_OWN, slots: (body as ClassDayInput).days[0].slots }] };
      },
    });
    await user.click(await screen.findByRole("button", { name: "Edit Class 1 timing" }));
    const dialog = await dialogOf("Class 1 timing");
    await user.clear(within(dialog).getByLabelText("Class 1: number of periods"));
    await user.type(within(dialog).getByLabelText("Class 1: number of periods"), "2");
    await user.click(within(dialog).getByRole("button", { name: "Save" }));
    expect(await within(dialog).findByText(message)).toBeInTheDocument();
    expect(classDays(calls)[0].removeLessons).toBe(false);
    await user.click(within(dialog).getByRole("button", { name: "Take those lessons out and save" }));
    await waitFor(() => expect(classDays(calls)).toHaveLength(2));
    expect(classDays(calls)[1].removeLessons).toBe(true);
  });

  it("will not send numbers that make no day", async () => {
    const { calls, user } = openPage([SIX, CLASS_OWN]);
    await user.click(await screen.findByRole("button", { name: "Edit Class 1 timing" }));
    const dialog = await dialogOf("Class 1 timing");
    await user.clear(within(dialog).getByLabelText("Class 1: number of periods"));
    await user.type(within(dialog).getByLabelText("Class 1: number of periods"), "0");
    expect(within(dialog).getByRole("alert")).toHaveTextContent("Add at least one period");
    expect(within(dialog).getByRole("button", { name: "Save" })).toBeDisabled();
    expect(classDays(calls)).toHaveLength(0);
  });
});

describe("School timings: back to the school's timing asks first (2026-11-17)", () => {
  const item = async () => within(await screen.findByRole("list", { name: "Classes with their own timing" })).getByRole("listitem");
  const back = (row: HTMLElement) => within(row).getByRole("button", { name: "Use the school's timing for Class 1" });

  it("a second icon stands beside the pencil in the row of a class with its own timing", async () => {
    openPage([SIX, CLASS_OWN]);
    const row = await item();
    expect(within(row).getByRole("button", { name: "Edit Class 1 timing" })).toBeInTheDocument();
    expect(back(row)).toBeInTheDocument();
    expect(back(row)).toHaveAttribute("title", "Use the school's timing");
  });

  it("the icon opens Are you sure? and sends nothing at the first click; Cancel leaves the class as it was", async () => {
    const { calls, user } = openPage([SIX, CLASS_OWN]);
    await user.click(back(await item()));
    const sure = await screen.findByRole("dialog", { name: "Are you sure?" });
    expect(sure).toHaveTextContent("Class 1 will follow the school's timing again.");
    expect(classDays(calls)).toHaveLength(0);
    await user.click(within(sure).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Are you sure?" })).not.toBeInTheDocument());
    expect(classDays(calls)).toHaveLength(0);
    expect(within(await item()).getByText(/4 periods/)).toBeInTheDocument();
  });

  it("Yes takes the class's own timing away: no days of its own are sent, and the class leaves the list", async () => {
    const { calls, user } = openPage([SIX, CLASS_OWN]);
    await user.click(back(await item()));
    await user.click(within(await screen.findByRole("dialog", { name: "Are you sure?" })).getByRole("button", { name: "Yes, use the school's timing" }));
    await waitFor(() => expect(classDays(calls)).toHaveLength(1));
    expect(classDays(calls)[0]).toMatchObject({ classId: "c2", days: [], removeLessons: false });
    expect(await screen.findByText("No class has its own timing")).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Are you sure?" })).not.toBeInTheDocument());
  });

  it("a class with lessons in periods the school's day does not have is asked a second time, and lessons go only when told to", async () => {
    const message = "Class 1 has lessons in periods 5 to 8. They would have to be taken out.";
    let first = true;
    const { calls, user } = openPage([SIX, CLASS_OWN], {
      "PUT /timetable/class-day": () => {
        if (first) {
          first = false;
          return refused(409, message, "LESSONS_IN_REMOVED_PERIODS")();
        }
        return { items: [SIX] };
      },
    });
    await user.click(back(await item()));
    const sure = await screen.findByRole("dialog", { name: "Are you sure?" });
    await user.click(within(sure).getByRole("button", { name: "Yes, use the school's timing" }));
    const again = await screen.findByRole("dialog", { name: "Take those lessons out?" });
    expect(again).toHaveTextContent(message);
    expect(classDays(calls)[0].removeLessons).toBe(false);
    await user.click(within(again).getByRole("button", { name: "Take those lessons out and use the school's timing" }));
    await waitFor(() => expect(classDays(calls)).toHaveLength(2));
    expect(classDays(calls)[1]).toMatchObject({ days: [], removeLessons: true });
  });

  it("Go back, on the second question, returns to the first and sends nothing more", async () => {
    const { calls, user } = openPage([SIX, CLASS_OWN], { "PUT /timetable/class-day": refused(409, "Class 1 has lessons in periods 5 to 8.", "LESSONS_IN_REMOVED_PERIODS") });
    await user.click(back(await item()));
    await user.click(within(await screen.findByRole("dialog", { name: "Are you sure?" })).getByRole("button", { name: "Yes, use the school's timing" }));
    await user.click(within(await screen.findByRole("dialog", { name: "Take those lessons out?" })).getByRole("button", { name: "Go back" }));
    expect(await screen.findByRole("dialog", { name: "Are you sure?" })).toBeInTheDocument();
    expect(classDays(calls)).toHaveLength(1);
  });
});

describe("School timings: the winter shift (2026-11-17)", () => {
  const startBox = () => screen.findByLabelText("Usual day: school starts");
  const box = (name: string) => screen.getByLabelText(`Usual day: ${name}`);

  it("moving the school's start moves the lunch with it, so no period is cut", async () => {
    openPage();
    fireEvent.change(await startBox(), { target: { value: "09:30" } });
    expect(box("lunch from")).toHaveValue("11:30");
    expect(box("lunch to")).toHaveValue("12:00");
    // The card's own line says the whole day (the days of the week say it too).
    expect(screen.getAllByText("09:30 to 15:20 · 8 periods · lunch 11:30 to 12:00").length).toBeGreaterThan(0);
    expect(screen.queryByText(/is cut to/)).not.toBeInTheDocument();
  });

  it("a start box that is cleared and typed again moves the lunch by what the start was before", async () => {
    openPage();
    const start = await startBox();
    fireEvent.change(start, { target: { value: "" } });
    expect(box("lunch from")).toHaveValue("10:30");
    fireEvent.change(start, { target: { value: "09:30" } });
    expect(box("lunch from")).toHaveValue("11:30");
  });

  it("changing the length of a period moves nothing else", async () => {
    openPage();
    await startBox();
    fireEvent.change(box("minutes in a period"), { target: { value: "45" } });
    expect(box("school starts")).toHaveValue("08:30");
    expect(box("lunch from")).toHaveValue("10:30");
  });

  it("a day of the week that has hours of its own moves too", async () => {
    // Saturday is a short day of its own, starting at 08:30 like the usual day.
    const SATURDAY: Schedule = { ...SIX, id: "sat", name: "Saturday", days: [6], slots: FOUR_ROWS, periods: 4 };
    const { calls, user } = openPage([{ ...SIX, days: [1, 2, 3, 4, 5] }, SATURDAY]);
    fireEvent.change(await startBox(), { target: { value: "09:30" } });
    expect(screen.getByLabelText("Saturday: school starts")).toHaveValue("09:30");
    await user.click(saveButton());
    await waitFor(() => expect(weeks(calls)).toHaveLength(1));
    expect(weeks(calls)[0].days.find((d) => d.day === 6)?.slots[0].start).toBe("09:30");
  });

  it("with no class or department keeping hours of its own there is nothing else to say, and Save sends the school's week alone", async () => {
    const { calls, user } = openPage();
    fireEvent.change(await startBox(), { target: { value: "09:30" } });
    expect(screen.queryByText(/^Also start/)).not.toBeInTheDocument();
    await user.click(saveButton());
    await waitFor(() => expect(weeks(calls)).toHaveLength(1));
    expect(weeks(calls)[0].shiftOthers).toBeUndefined();
    expect(weeks(calls)[0].days[0].slots[0].start).toBe("09:30");
  });

  // 2026-11-22, user: a tick beside each; "check na kare to time nahi badhega, check kare to badh jayega". None is ticked to begin with.
  it("a tick for each class and department with hours of its own, none ticked: Save moves none of them", async () => {
    const { calls, user } = openPage([SIX, PRIMARY_OWN, CLASS_OWN]);
    fireEvent.change(await startBox(), { target: { value: "09:30" } });
    expect(await screen.findByText("Also start 1 hr later?")).toBeInTheDocument();
    const list = screen.getByRole("list", { name: "Start 1 hr later too" });
    expect(within(list).getAllByRole("listitem")).toHaveLength(2);
    expect(screen.getByLabelText("Move Primary too")).not.toBeChecked();
    expect(screen.getByLabelText("Move Class 1 too")).not.toBeChecked();
    // Where each would go is said beside its hours, ticked or not.
    expect(list).toHaveTextContent("Primary08:30–11:10 → 09:30–12:10");
    expect(list).toHaveTextContent("Class 108:30–11:10 → 09:30–12:10");
    await user.click(saveButton());
    await waitFor(() => expect(weeks(calls)).toHaveLength(1));
    expect(weeks(calls)[0].shiftOthers).toBeUndefined();
    expect(weeks(calls)[0].shiftOnly).toBeUndefined();
  });

  it("a ticked one moves with the school (its new hours are said), in the same save; the others stay", async () => {
    const { calls, user } = openPage([SIX, PRIMARY_OWN, CLASS_OWN]);
    fireEvent.change(await startBox(), { target: { value: "09:30" } });
    await user.click(await screen.findByLabelText("Move Primary too"));
    expect(screen.getByLabelText("Move Primary too")).toBeChecked();
    expect(screen.getByRole("list", { name: "Start 1 hr later too" })).toHaveTextContent("Primary08:30–11:10 → 09:30–12:10");
    // Nothing of theirs is sent before Save.
    expect(weeks(calls)).toHaveLength(0);
    expect(classDays(calls)).toHaveLength(0);
    await user.click(saveButton());
    await waitFor(() => expect(weeks(calls)).toHaveLength(1));
    expect(weeks(calls)[0]).toMatchObject({ shiftOthers: 60, shiftOnly: ["q1"] });
    expect(weeks(calls)[0].departmentId).toBeUndefined();
    // The shift is the server's: no extra request for each class or department.
    expect(classDays(calls)).toHaveLength(0);
  });

  it("earlier is said as earlier, and goes as a negative number of minutes", async () => {
    const { calls, user } = openPage([SIX, CLASS_OWN]);
    fireEvent.change(await startBox(), { target: { value: "08:00" } });
    expect(await screen.findByText("Also start 30 min earlier?")).toBeInTheDocument();
    await user.click(screen.getByLabelText("Move Class 1 too"));
    await user.click(saveButton());
    await waitFor(() => expect(weeks(calls)).toHaveLength(1));
    expect(weeks(calls)[0]).toMatchObject({ shiftOthers: -30, shiftOnly: ["k1"] });
  });

  it("putting the start back where it was says nothing and sends no shift", async () => {
    const { calls } = openPage([SIX, CLASS_OWN]);
    const start = await startBox();
    fireEvent.change(start, { target: { value: "09:30" } });
    expect(await screen.findByText("Also start 1 hr later?")).toBeInTheDocument();
    fireEvent.change(start, { target: { value: "08:30" } });
    await waitFor(() => expect(screen.queryByText(/^Also start/)).not.toBeInTheDocument());
    expect(box("lunch from")).toHaveValue("10:30");
    expect(weeks(calls)).toHaveLength(0);
  });

  it("a department sent again with the school's week goes with the same shift when it is ticked", async () => {
    const { calls, user } = openPage([SIX, PRIMARY_OWN]);
    await screen.findByLabelText("Usual day: school starts");
    await user.click(pill("Saturday"));
    fireEvent.change(box("school starts"), { target: { value: "09:30" } });
    await user.click(screen.getByLabelText("Move Primary too"));
    await user.click(saveButton());
    await waitFor(() => expect(weeks(calls)).toHaveLength(2));
    expect(weeks(calls)[0]).toMatchObject({ shiftOthers: 60 });
    expect(weeks(calls)[1]).toMatchObject({ departmentId: "d2" });
    // The rows it had (08:30) an hour later, not the old ones.
    expect(weeks(calls)[1].days[0].slots[0].start).toBe("09:30");
    expect(weeks(calls)[1].days[0].slots.at(-1)?.end).toBe("12:10");
  });

  it("an unticked department sent again with the school's week keeps its hours", async () => {
    const { calls, user } = openPage([SIX, PRIMARY_OWN]);
    await screen.findByLabelText("Usual day: school starts");
    await user.click(pill("Saturday"));
    fireEvent.change(box("school starts"), { target: { value: "09:30" } });
    await user.click(saveButton());
    await waitFor(() => expect(weeks(calls)).toHaveLength(2));
    expect(weeks(calls)[0].shiftOthers).toBeUndefined();
    expect(weeks(calls)[1].days[0].slots[0].start).toBe("08:30");
  });

  it("will not save when a ticked class's timing would go past midnight: it says which, and Save waits (unticked, it does not matter)", async () => {
    const LATE: Schedule = { ...CLASS_OWN, slots: [{ kind: "period", label: "", start: "22:00", end: "22:40" }, { kind: "period", label: "", start: "22:40", end: "23:20" }], periods: 2 };
    const { calls, user } = openPage([SIX, LATE]);
    fireEvent.change(await startBox(), { target: { value: "10:30" } });
    await screen.findByText("Also start 2 hr later?");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    await user.click(screen.getByLabelText("Move Class 1 too"));
    expect(await screen.findByRole("alert")).toHaveTextContent("Class 1 would go past midnight if everything starts 2 hr later");
    expect(saveButton()).toBeDisabled();
    await user.click(saveButton());
    expect(weeks(calls)).toHaveLength(0);
  });

  it("Throw away changes puts the start and the lunch back", async () => {
    const { user } = openPage([SIX, CLASS_OWN]);
    fireEvent.change(await startBox(), { target: { value: "09:30" } });
    await user.click(await screen.findByRole("button", { name: "Discard" }));
    expect(box("school starts")).toHaveValue("08:30");
    expect(box("lunch from")).toHaveValue("10:30");
    expect(screen.queryByText(/^Also start/)).not.toBeInTheDocument();
  });
});

describe("School timings: Pre-Primary is set by hours, not by periods", () => {
  // User, 2026-11-13: in Pre-Primary one teacher teaches one thing a day, so periods do not matter: from when to when is what is asked.
  const pre = (user: ReturnType<typeof userEvent.setup>) => openWindow(user, "Pre-Primary");
  const lastSlot = (b: SchoolDayInput) => b.days[0].slots[b.days[0].slots.length - 1];
  const PRE_OWN: Schedule = { id: "p1", name: "Pre-Primary", days: [1, 2, 3, 4, 5, 6], scope: "only", classIds: ["c1"], departmentId: "d1", slots: FOUR_ROWS, periods: 4 };

  it("says the school's day it follows as hours, without counting periods", async () => {
    openPage();
    const r = await region("Pre-Primary timing");
    expect(r).toHaveTextContent("Same as school");
    expect(r).toHaveTextContent("08:30 to 14:20 · lunch 10:30 to 11:00");
    expect(r).not.toHaveTextContent(/period/);
  });

  it("Change timing asks when school starts and ends, how long a period is (the school's to start with, 2026-11-22) and the lunch: no count of periods", async () => {
    const { user } = openPage();
    const dialog = await pre(user);
    expect(within(dialog).getByLabelText("Pre-Primary: school starts")).toHaveValue("08:30");
    expect(within(dialog).getByLabelText("Pre-Primary: school ends")).toHaveValue("14:20");
    expect(within(dialog).getByLabelText("Pre-Primary: minutes in a period")).toHaveValue(40);
    expect(within(dialog).getByLabelText("Pre-Primary: lunch break")).toBeChecked();
    expect(within(dialog).getByLabelText("Pre-Primary: lunch from")).toHaveValue("10:30");
    expect(within(dialog).getByLabelText("Pre-Primary: lunch to")).toHaveValue("11:00");
    for (const gone of ["Pre-Primary: number of periods", "Pre-Primary: assembly minutes", "Pre-Primary: short break"]) {
      expect(screen.queryByLabelText(gone)).not.toBeInTheDocument();
    }
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    // Primary, beside it, is still set by periods.
    const primary = await openWindow(user, "Primary");
    expect(within(primary).getByLabelText("Primary: number of periods")).toHaveValue(8);
    expect(screen.queryByLabelText("Primary: school ends")).not.toBeInTheDocument();
  });

  it("sends the hours as whole periods of its length on the school's usual days, and the card says it in hours", async () => {
    const { calls, user } = openPage();
    const dialog = await pre(user);
    // 09:10 to 12:20, lunch 10:30 to 11:00: two periods before lunch, two after, every one 40 minutes.
    fireEvent.change(within(dialog).getByLabelText("Pre-Primary: school starts"), { target: { value: "09:10" } });
    fireEvent.change(within(dialog).getByLabelText("Pre-Primary: school ends"), { target: { value: "12:20" } });
    expect(within(dialog).queryByRole("alert")).not.toBeInTheDocument();
    await user.click(windowSave(dialog));
    await waitFor(() => expect(weeks(calls)).toHaveLength(1));
    const body = weeks(calls)[0];
    expect(body.departmentId).toBe("d1");
    expect(body.days.map((d) => d.day)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(body.days[0].slots[0].start).toBe("09:10");
    expect(lastSlot(body)).toMatchObject({ kind: "period", end: "12:20" });
    expect(body.days[0].slots.find((s) => s.kind === "lunch")).toMatchObject({ start: "10:30", end: "11:00" });
    expect(body.days[0].slots.filter((s) => s.kind === "period").map((s) => `${s.start}-${s.end}`)).toEqual(["09:10-09:50", "09:50-10:30", "11:00-11:40", "11:40-12:20"]);
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    const r = await region("Pre-Primary timing");
    expect(r).toHaveTextContent("Custom timing");
    expect(r).toHaveTextContent("09:10 to 12:20 · lunch 10:30 to 11:00");
    expect(r).not.toHaveTextContent(/period/);
  });

  it("the window says the day's figures like the school's day, and classes can start after school does (2026-11-22)", async () => {
    const { calls, user } = openPage();
    const dialog = await pre(user);
    const figure = (label: string) => within(dialog).getByText(label).parentElement;
    expect(figure("School time")).toHaveTextContent("08:30–14:20");
    expect(figure("Class time")).toHaveTextContent("08:30–14:20From when school starts");
    expect(within(dialog).getByLabelText("Pre-Primary: classes start")).toHaveValue("08:30");
    // School 08:30, classes 08:50: the lunch moves the same 20 min (it stays after Period 3), and the day ends 20 min later.
    fireEvent.change(within(dialog).getByLabelText("Pre-Primary: classes start"), { target: { value: "08:50" } });
    expect(within(dialog).getByLabelText("Pre-Primary: lunch from")).toHaveValue("10:50");
    fireEvent.change(within(dialog).getByLabelText("Pre-Primary: school ends"), { target: { value: "14:40" } });
    expect(within(dialog).queryByRole("alert")).not.toBeInTheDocument();
    expect(figure("School time")).toHaveTextContent("08:30–14:40");
    expect(figure("Class time")).toHaveTextContent("08:50–14:40Arrival 08:30–08:50");
    await user.click(windowSave(dialog));
    await waitFor(() => expect(weeks(calls)).toHaveLength(1));
    const rows = weeks(calls)[0].days[0].slots;
    expect(rows[0]).toMatchObject({ kind: "break", label: "Arrival", start: "08:30", end: "08:50" });
    expect(rows[1]).toMatchObject({ kind: "period", start: "08:50", end: "09:30" });
  });

  it("classes typed before school starts in the window: said, and Save waits", async () => {
    const { user } = openPage();
    const dialog = await pre(user);
    fireEvent.change(within(dialog).getByLabelText("Pre-Primary: classes start"), { target: { value: "08:10" } });
    expect(within(dialog).getByRole("alert")).toHaveTextContent("Classes can start at 08:30 at the earliest, when school starts");
    expect(windowSave(dialog)).toBeDisabled();
  });

  it("a department's own length of a period (30 min) makes its periods", async () => {
    const { calls, user } = openPage();
    const dialog = await pre(user);
    await user.click(within(dialog).getByRole("button", { name: "Pre-Primary: minutes in a period: less" }));
    await user.click(within(dialog).getByRole("button", { name: "Pre-Primary: minutes in a period: less" }));
    expect(within(dialog).getByLabelText("Pre-Primary: minutes in a period")).toHaveValue(30);
    fireEvent.change(within(dialog).getByLabelText("Pre-Primary: school ends"), { target: { value: "12:30" } });
    await user.click(windowSave(dialog));
    await waitFor(() => expect(weeks(calls)).toHaveLength(1));
    const periods = weeks(calls)[0].days[0].slots.filter((s) => s.kind === "period");
    expect(periods.map((s) => `${s.start}-${s.end}`)).toEqual(["08:30-09:00", "09:00-09:30", "09:30-10:00", "10:00-10:30", "11:00-11:30", "11:30-12:00", "12:00-12:30"]);
  });

  it("a lunch inside a period (the picture: 09:00 to 12:30, lunch 10:30): says how many minutes earlier or later it goes, with a button for each; Save waits", async () => {
    const { user } = openPage();
    const dialog = await pre(user);
    fireEvent.change(within(dialog).getByLabelText("Pre-Primary: school starts"), { target: { value: "09:00" } });
    fireEvent.change(within(dialog).getByLabelText("Pre-Primary: school ends"), { target: { value: "12:30" } });
    const warning = within(dialog).getByRole("alert");
    expect(warning).toHaveTextContent("Lunch starts at 10:30, in the middle of Period 3 (10:20 to 11:00). Move it 10 min earlier (to 10:20) or 30 min later (to 11:00) so that every period is 40 min.");
    expect(windowSave(dialog)).toBeDisabled();
    await user.click(within(dialog).getByRole("button", { name: "Move lunch to 10:20" }));
    expect(within(dialog).getByLabelText("Pre-Primary: lunch from")).toHaveValue("10:20");
    expect(within(dialog).getByLabelText("Pre-Primary: lunch to")).toHaveValue("10:50");
    // 10:50 + three periods of 40 ends at 12:50, not 12:30: the end is said the same way.
    expect(within(dialog).getByRole("alert")).toHaveTextContent("School ends at 12:30, in the middle of Period 5 (12:10 to 12:50). End it 20 min earlier (at 12:10) or 20 min later (at 12:50) so that every period is 40 min.");
    await user.click(within(dialog).getByRole("button", { name: "End at 12:50" }));
    expect(within(dialog).getByLabelText("Pre-Primary: school ends")).toHaveValue("12:50");
    expect(within(dialog).queryByRole("alert")).not.toBeInTheDocument();
    expect(windowSave(dialog)).toBeEnabled();
  });

  it("without a lunch the day has no lunch row", async () => {
    const { calls, user } = openPage();
    const dialog = await pre(user);
    await user.click(within(dialog).getByLabelText("Pre-Primary: lunch break"));
    expect(within(dialog).queryByLabelText("Pre-Primary: lunch from")).not.toBeInTheDocument();
    fireEvent.change(within(dialog).getByLabelText("Pre-Primary: school ends"), { target: { value: "11:50" } });
    await user.click(windowSave(dialog));
    await waitFor(() => expect(weeks(calls)).toHaveLength(1));
    expect(weeks(calls)[0].days[0].slots.some((s) => s.kind === "lunch")).toBe(false);
    expect(lastSlot(weeks(calls)[0]).end).toBe("11:50");
  });

  it("reads a timing it already has (made by periods before) back as its hours, and Save waits until they change", async () => {
    const { user } = openPage([SIX, PRE_OWN]);
    const r = await region("Pre-Primary timing");
    expect(r).toHaveTextContent("Custom timing");
    expect(r).toHaveTextContent("08:30 to 11:10");
    const dialog = await pre(user);
    expect(within(dialog).getByLabelText("Pre-Primary: school starts")).toHaveValue("08:30");
    expect(within(dialog).getByLabelText("Pre-Primary: school ends")).toHaveValue("11:10");
    expect(within(dialog).getByLabelText("Pre-Primary: lunch break")).not.toBeChecked();
    expect(windowSave(dialog)).toBeDisabled();
  });

  it("will not send hours that make no day or a lunch outside them, and says why", async () => {
    const { calls, user } = openPage();
    const dialog = await pre(user);
    fireEvent.change(within(dialog).getByLabelText("Pre-Primary: school ends"), { target: { value: "08:00" } });
    expect(within(dialog).getByRole("alert")).toHaveTextContent("School must end after it starts");
    expect(windowSave(dialog)).toBeDisabled();
    fireEvent.change(within(dialog).getByLabelText("Pre-Primary: school ends"), { target: { value: "10:00" } });
    expect(within(dialog).getByRole("alert")).toHaveTextContent("The lunch must be inside the school hours");
    expect(windowSave(dialog)).toBeDisabled();
    expect(weeks(calls)).toHaveLength(0);
  });

  it("a Pre-Primary day that follows the school's usual days is sent again with the school's week, with the rows it had", async () => {
    const { calls, user } = openPage([SIX, PRE_OWN]);
    await screen.findByLabelText("Usual day: school starts");
    await user.click(pill("Saturday"));
    await user.click(saveButton());
    await waitFor(() => expect(weeks(calls)).toHaveLength(2));
    expect(weeks(calls)[1]).toMatchObject({ departmentId: "d1" });
    expect(weeks(calls)[1].days.map((d) => d.day)).toEqual([1, 2, 3, 4, 5]);
    expect(weeks(calls)[1].days[0].slots).toEqual(FOUR_ROWS);
  });
});
