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
const refused = (status: number, message: string, code?: string) => () => new Response(JSON.stringify({ success: false, message, code }), { status, headers: { "Content-Type": "application/json" } });

describe("School timings: every department can have its own timing", () => {
  it("each department has a card that follows the school, says what it follows, and has Change timing; no boxes in the page", async () => {
    openPage();
    expect(await screen.findByRole("heading", { name: "Department timings" })).toBeInTheDocument();
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
    expect(screen.queryByRole("heading", { name: "Department timings" })).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: /timing$/ })).not.toBeInTheDocument();
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
    fireEvent.change(within(dialog).getByLabelText("Primary: school starts"), { target: { value: "09:00" } });
    expect(windowSave(dialog)).toBeEnabled();
    expect(weeks(calls)).toHaveLength(0);
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

  it("Save in the window sends that department only, on the school's usual days, closes the window, and the card says Own timing", async () => {
    const { calls, user } = openPage();
    const dialog = await openWindow(user, "Primary");
    fireEvent.change(within(dialog).getByLabelText("Primary: school starts"), { target: { value: "07:30" } });
    await user.click(windowSave(dialog));
    await waitFor(() => expect(weeks(calls)).toHaveLength(1));
    const body = weeks(calls)[0];
    expect(body.departmentId).toBe("d2");
    expect(body.days.map((d) => d.day)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(body.days[0].slots[0].start).toBe("07:30");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    const r = await region("Primary timing");
    expect(r).toHaveTextContent("Own timing");
    expect(r).toHaveTextContent(/07:30 to \d\d:\d\d · 8 periods · lunch 10:30 to 11:00/);
    // The page's own Save is about the school's week: it has nothing to save.
    expect(saveButton()).toBeDisabled();
  });

  it("reads a timing a department already has: the card says so, and the window opens with its numbers", async () => {
    const { user } = openPage([SIX, PRIMARY_OWN]);
    const r = await region("Primary timing");
    expect(r).toHaveTextContent("Own timing");
    expect(r).toHaveTextContent("08:30 to 11:10 · 4 periods · no lunch");
    // Another department still follows the school.
    expect(await region("Pre-Primary timing")).toHaveTextContent("Same as school");
    const dialog = await openWindow(user, "Primary");
    expect(within(dialog).getByLabelText("Primary: number of periods")).toHaveValue(4);
    expect(windowSave(dialog)).toBeDisabled();
  });

  it("Same as school (only in the window of a department that has its own timing) takes its own timing away at once", async () => {
    const { calls, user } = openPage([SIX, PRIMARY_OWN]);
    const dialog = await openWindow(user, "Primary");
    await user.click(within(dialog).getByRole("button", { name: "Same as school" }));
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
    await user.click(within(screen.getByRole("radiogroup", { name: "Saturday" })).getByRole("radio", { name: "Holiday" }));
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
    fireEvent.change(within(dialog).getByLabelText("Primary: school starts"), { target: { value: "07:30" } });
    await user.click(windowSave(dialog));
    expect(await within(dialog).findByText(message)).toBeInTheDocument();
    expect(within(dialog).getByLabelText("Primary: school starts")).toHaveValue("07:30");
    expect(windowSave(dialog)).toBeEnabled();
  });
});

describe("School timings: the day drawn as a timeline, and the Save bar", () => {
  it("draws the usual day as a timeline of its periods and lunch", async () => {
    openPage();
    const line = await screen.findByRole("list", { name: "Usual day, period by period" });
    const items = within(line).getAllByRole("listitem");
    expect(items).toHaveLength(9);
    expect(items[0]).toHaveTextContent("Period 1");
    expect(items[0]).toHaveTextContent("08:30–09:10");
    expect(within(line).getByText("Lunch")).toBeInTheDocument();
  });

  it("has one Save changes, off until something changes, and a quiet line saying everything is saved", async () => {
    openPage();
    await screen.findByLabelText("Usual day: school starts");
    expect(saveButton()).toBeDisabled();
    expect(screen.getAllByRole("button", { name: "Save changes" })).toHaveLength(1);
    expect(screen.getByText("Everything is saved.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Throw away changes" })).not.toBeInTheDocument();
  });

  it("Save changes is fixed to the bottom of the screen, outside the page that scrolls, and is only the buttons: no white card round them", async () => {
    openPage();
    await screen.findByLabelText("Usual day: school starts");
    expect(saveButton().closest(".fixed")).not.toBeNull();
    expect(saveButton().closest(".bg-surface")).toBeNull();
    expect(saveButton().closest(".shadow-float")).toBeNull();
    // What is said when everything is saved is in the page, not in the bar.
    expect(screen.getByText("Everything is saved.").closest(".fixed")).toBeNull();
    expect(screen.getByRole("button", { name: "Now make each class's timetable" }).closest(".fixed")).toBeNull();
  });

  it("shows Class timings first in the column beside the day, above Department timings, level with the Usual school day card, under the title", async () => {
    openPage();
    const classes = await screen.findByRole("heading", { name: "Class timings" });
    const departments = await screen.findByRole("heading", { name: "Department timings" });
    const usual = screen.getByRole("heading", { name: "Usual school day" });
    const title = screen.getByRole("heading", { name: "School timings", level: 1 });
    expect(classes.compareDocumentPosition(departments) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // The two columns are the cells of one grid that starts under the title (user, 2026-11-13: the column beside the day starts level with it).
    const grid = usual.closest(".grid");
    expect(grid).not.toBeNull();
    expect(grid).toContainElement(classes);
    expect(grid).toContainElement(departments);
    expect(grid).not.toContainElement(title);
    expect(title.compareDocumentPosition(usual) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("the last card of the column beside the day grows to the foot of the page, so no blank space is left under it", async () => {
    openPage();
    const departments = await screen.findByRole("heading", { name: "Department timings" });
    const column = departments.closest("div.flex-col");
    expect(column).not.toBeNull();
    // The column makes its last card stretch (`[&>:last-child]:flex-1`).
    expect(column?.className).toContain("[&>:last-child]:flex-1");
    expect(column?.lastElementChild).toContainElement(departments);
  });

  it("Throw away changes stands beside Save once the school's week is changed, and puts it back", async () => {
    const { user } = openPage();
    await screen.findByLabelText("Usual day: school starts");
    await user.click(within(screen.getByRole("radiogroup", { name: "Saturday" })).getByRole("radio", { name: "Holiday" }));
    expect(screen.getByRole("button", { name: "Throw away changes" }).closest(".fixed")).not.toBeNull();
    expect(screen.queryByText("Everything is saved.")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Throw away changes" }));
    expect(saveButton()).toBeDisabled();
    expect(screen.getByText("Everything is saved.")).toBeInTheDocument();
  });
});

describe("School timings: a class can have its own timing", () => {
  const classes = () => screen.findByRole("heading", { name: "Class timings" });
  const dialogOf = (name: string) => screen.findByRole("dialog", { name });
  /** Opens the class list of the window and picks one (the box says "Choose a class" until it is picked). */
  async function pickClass(user: ReturnType<typeof userEvent.setup>, dialog: HTMLElement, name: string) {
    await user.click(within(dialog).getByRole("button", { name: /Choose a class/ }));
    await user.click(await screen.findByRole("option", { name }));
  }

  it("says no class has its own timing yet, and offers Add class", async () => {
    openPage();
    await classes();
    expect(screen.getByText("No class has its own timing")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add class" })).toBeEnabled();
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
    await user.click(await screen.findByRole("button", { name: "Add class" }));
    const dialog = await dialogOf("Add class timing");
    // Nothing to fill in before a class is picked.
    expect(within(dialog).queryByLabelText(/school starts/)).not.toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Save" })).toBeDisabled();
    await pickClass(user, dialog, "Class 1");
    expect(within(dialog).getByLabelText("Class 1: school starts")).toHaveValue("08:30");
    // Nothing is different yet, so there is nothing to save.
    expect(within(dialog).getByRole("button", { name: "Save" })).toBeDisabled();
    fireEvent.change(within(dialog).getByLabelText("Class 1: school starts"), { target: { value: "09:00" } });
    await user.click(within(dialog).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(classDays(calls)).toHaveLength(1));
    const body = classDays(calls)[0];
    expect(body).toMatchObject({ classId: "c2", removeLessons: false });
    expect(body.days.map((d) => d.day)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(body.days[0].slots[0].start).toBe("09:00");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    const item = within(await screen.findByRole("list", { name: "Classes with their own timing" })).getByRole("listitem");
    expect(item).toHaveTextContent("Class 1");
    expect(item).toHaveTextContent("09:00 to");
  });

  it("a class that already has a timing is not offered again when adding", async () => {
    const { user } = openPage([SIX, CLASS_OWN]);
    await user.click(await screen.findByRole("button", { name: "Add class" }));
    const dialog = await dialogOf("Add class timing");
    await user.click(within(dialog).getByRole("button", { name: /Choose a class/ }));
    const list = await screen.findByRole("listbox");
    expect(within(list).queryByRole("option", { name: "Class 1" })).not.toBeInTheDocument();
    expect(within(list).getByRole("option", { name: "Class 2" })).toBeInTheDocument();
    expect(within(list).getByRole("option", { name: "Nursery" })).toBeInTheDocument();
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

  it("Use the school's timing sends no days of its own, and the class leaves the list", async () => {
    const { calls, user } = openPage([SIX, CLASS_OWN]);
    await user.click(await screen.findByRole("button", { name: "Edit Class 1 timing" }));
    const dialog = await dialogOf("Class 1 timing");
    await user.click(within(dialog).getByRole("button", { name: "Use the school's timing" }));
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

  it("Change timing asks only when school starts and ends, and the lunch: no period boxes", async () => {
    const { user } = openPage();
    const dialog = await pre(user);
    expect(within(dialog).getByLabelText("Pre-Primary: school starts")).toHaveValue("08:30");
    expect(within(dialog).getByLabelText("Pre-Primary: school ends")).toHaveValue("14:20");
    expect(within(dialog).getByLabelText("Pre-Primary: lunch break")).toBeChecked();
    expect(within(dialog).getByLabelText("Pre-Primary: lunch from")).toHaveValue("10:30");
    expect(within(dialog).getByLabelText("Pre-Primary: lunch to")).toHaveValue("11:00");
    for (const gone of ["Pre-Primary: number of periods", "Pre-Primary: minutes in a period", "Pre-Primary: assembly minutes", "Pre-Primary: short break"]) {
      expect(screen.queryByLabelText(gone)).not.toBeInTheDocument();
    }
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    // Primary, beside it, is still set by periods.
    const primary = await openWindow(user, "Primary");
    expect(within(primary).getByLabelText("Primary: number of periods")).toHaveValue(8);
    expect(screen.queryByLabelText("Primary: school ends")).not.toBeInTheDocument();
  });

  it("sends the hours as periods of the school's length on the school's usual days, the last one ending where the day ends, and the card says it in hours", async () => {
    const { calls, user } = openPage();
    const dialog = await pre(user);
    fireEvent.change(within(dialog).getByLabelText("Pre-Primary: school starts"), { target: { value: "09:00" } });
    fireEvent.change(within(dialog).getByLabelText("Pre-Primary: school ends"), { target: { value: "12:00" } });
    await user.click(windowSave(dialog));
    await waitFor(() => expect(weeks(calls)).toHaveLength(1));
    const body = weeks(calls)[0];
    expect(body.departmentId).toBe("d1");
    expect(body.days.map((d) => d.day)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(body.days[0].slots[0].start).toBe("09:00");
    expect(lastSlot(body)).toMatchObject({ kind: "period", end: "12:00" });
    expect(body.days[0].slots.find((s) => s.kind === "lunch")).toMatchObject({ start: "10:30", end: "11:00" });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    const r = await region("Pre-Primary timing");
    expect(r).toHaveTextContent("Own timing");
    expect(r).toHaveTextContent("09:00 to 12:00 · lunch 10:30 to 11:00");
    expect(r).not.toHaveTextContent(/period/);
  });

  it("without a lunch the day has no lunch row", async () => {
    const { calls, user } = openPage();
    const dialog = await pre(user);
    await user.click(within(dialog).getByLabelText("Pre-Primary: lunch break"));
    expect(within(dialog).queryByLabelText("Pre-Primary: lunch from")).not.toBeInTheDocument();
    fireEvent.change(within(dialog).getByLabelText("Pre-Primary: school ends"), { target: { value: "12:00" } });
    await user.click(windowSave(dialog));
    await waitFor(() => expect(weeks(calls)).toHaveLength(1));
    expect(weeks(calls)[0].days[0].slots.some((s) => s.kind === "lunch")).toBe(false);
    expect(lastSlot(weeks(calls)[0]).end).toBe("12:00");
  });

  it("reads a timing it already has (made by periods before) back as its hours, and Save waits until they change", async () => {
    const { user } = openPage([SIX, PRE_OWN]);
    const r = await region("Pre-Primary timing");
    expect(r).toHaveTextContent("Own timing");
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
    await user.click(within(screen.getByRole("radiogroup", { name: "Saturday" })).getByRole("radio", { name: "Holiday" }));
    await user.click(saveButton());
    await waitFor(() => expect(weeks(calls)).toHaveLength(2));
    expect(weeks(calls)[1]).toMatchObject({ departmentId: "d1" });
    expect(weeks(calls)[1].days.map((d) => d.day)).toEqual([1, 2, 3, 4, 5]);
    expect(weeks(calls)[1].days[0].slots).toEqual(FOUR_ROWS);
  });
});
