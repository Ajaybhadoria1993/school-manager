import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Provider } from "react-redux";
import { RouterProvider, createMemoryRouter } from "react-router";
import { ToastProvider } from "../../../components/ui/toast-context";
import { allApiSlices } from "../../../redux/api/apiRoot";
import store from "../../../redux/store";
import { fakeApi, type Call, type Handler } from "../../../test/fakeApi";
import { ALLOTMENT, ART, ENGLISH, GRID, MATHS, MEENA, OVERVIEW } from "../../../test/timetableFixtures";
import type { AcademicStructure, GridCell, GridView } from "../../../types";
import ClassTimetablesPage from "../ClassTimetables";

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

/** What the server answers to a save: the grid as sent, saved. */
const saved = (view: GridView) => (body: unknown): GridView => {
  const cells = (body as { cells: GridCell[] }).cells;
  return { ...view, exists: true, cells, updatedAt: "2026-10-31T10:00:00.000Z", issues: [], stats: { ...view.stats, filled: cells.length, free: view.stats.total - cells.length } };
};

function openPage(view: GridView = GRID, extra: Record<string, Handler> = {}) {
  const calls = fakeApi({
    "GET /timetable/overview": () => OVERVIEW,
    "GET /timetable/grid": () => view,
    "GET /academics/structure": () => STRUCTURE,
    "PUT /timetable/grid": saved(view),
    "GET /subjects": () => ({ items: [MATHS, ENGLISH] }),
    "GET /staff/teachers": () => ({ items: [MEENA] }),
    "GET /subjects/allotments": () => ALLOTMENT,
    "PUT /subjects/allotments": () => ALLOTMENT,
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

const puts = (calls: Call[]) => calls.filter((c) => c.method === "PUT");
const posts = (calls: Call[], path: string) => calls.filter((c) => c.method === "POST" && c.path === path);
const server = (status: number, message: string, code?: string, details?: object[]) => () =>
  new Response(JSON.stringify({ success: false, message, code, details }), { status, headers: { "Content-Type": "application/json" } });
type User = ReturnType<typeof userEvent.setup>;
/** The box that opens beside a period: the subjects to pick from. */
const box = () => screen.getByRole("dialog", { name: /: choose the subject$/ });
const search = () => screen.getByRole("combobox", { name: "Subject for this period" });
/** The subjects the box lists (and, last, the offer to add what was typed): the name of each row. */
const rows = () => screen.getAllByRole("option").map((o) => o.getAttribute("aria-label"));
/**
 * Clicks a period and opens its list of subjects. A period that has a lesson opens on its teacher (the box has two steps: the subject, then the
 * teacher), so for that one the way to the list is **Change**.
 */
async function subjectsOf(user: User, period: HTMLElement) {
  await user.click(period);
  const dialog = await screen.findByRole("dialog");
  const change = within(dialog).queryByRole("button", { name: "Change" });
  if (change) await user.click(change);
  await screen.findAllByRole("option");
}
/** Clicks a period, then the subject in the box that opens beside it. */
async function put(user: User, period: HTMLElement, name: string) {
  await subjectsOf(user, period);
  await user.click(await screen.findByRole("option", { name }));
}
const slot = (day: string, period: number, times: string) => screen.getByRole("button", { name: new RegExp(`^${day}, Period ${period}, ${times}:`) });
const MON1 = () => slot("Monday", 1, "08:30 to 09:10");
const MON2 = () => slot("Monday", 2, "09:10 to 09:50");
const TUE1 = () => slot("Tuesday", 1, "08:30 to 09:10");
const lesson = (subjectId: string) => ({ subjectId, teacherId: null, room: null });

describe("A class's timetable: the page", () => {
  it("shows the days as columns, the periods as rows with their times, the lunch between, and what the class studies with how many periods are in", async () => {
    openPage();
    expect(await screen.findByRole("heading", { name: "Class 5 - A", level: 1 })).toBeInTheDocument();
    const table = screen.getByRole("table", { name: "Weekly timetable" });
    expect(within(table).getAllByRole("columnheader").map((h) => h.textContent)).toEqual(["Period", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday"]);
    expect(within(table).getByRole("rowheader", { name: /^Period 1/ })).toHaveTextContent("08:30 to 09:10");
    expect(within(table).getByRole("rowheader", { name: "Lunch" })).toBeInTheDocument();
    expect(within(table).getByText("10:30 to 11:00")).toBeInTheDocument();
    expect(within(table).getByRole("rowheader", { name: /^Period 8/ })).toHaveTextContent("13:40 to 14:20");
    expect(MON1()).toHaveAccessibleName("Monday, Period 1, 08:30 to 09:10: empty");
    expect(screen.getByText("0 of 40 periods have a lesson")).toBeInTheDocument();
    // Nothing is placed: the server's checks say what is missing.
    expect(screen.getByText("Mathematics has none of its 6 periods")).toBeInTheDocument();
    // There is no subject to pick first: nothing above the week but its tools, and every period is a button that opens its own box.
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("opens a box beside the period that was clicked, with the cursor in it, and nothing is changed by opening it", async () => {
    const { user } = openPage();
    await screen.findByRole("table", { name: "Weekly timetable" });
    await user.click(MON1());
    expect(await screen.findByRole("dialog", { name: "Monday, Period 1: choose the subject" })).toBeInTheDocument();
    expect(box()).toHaveTextContent("08:30 to 09:10");
    expect(search()).toHaveFocus();
    expect(MON1()).toHaveAttribute("aria-expanded", "true");
    expect(MON1()).toHaveAccessibleName(/empty$/);
    expect(screen.queryByText("Not saved")).not.toBeInTheDocument();
    // An empty period has no teacher and room to set, and nothing to take out.
    expect(within(box()).queryByRole("button", { name: /Teacher & room/ })).not.toBeInTheDocument();
    expect(within(box()).queryByRole("button", { name: "Take it out" })).not.toBeInTheDocument();
  });

  it("lists the class's subjects first, then the school's others, then the usual subjects the school does not have yet", async () => {
    const { user } = openPage(GRID, { "GET /subjects": () => ({ items: [MATHS, ENGLISH, ART] }) });
    await screen.findByRole("table", { name: "Weekly timetable" });
    await user.click(MON1());
    await screen.findAllByRole("option");
    const names = rows();
    expect(names.slice(0, 3)).toEqual(["Mathematics", "English", "Art & Craft"]);
    expect(names).toContain("Hindi");
    expect(names).toContain("EVS");
    expect(names.filter((n) => n === "English")).toHaveLength(1);
  });

  it("says what each subject has: how many periods are in, of how many, and its teacher (or that it has none yet)", async () => {
    const { user } = openPage();
    await screen.findByRole("table", { name: "Weekly timetable" });
    await user.click(MON1());
    const maths = await screen.findByRole("option", { name: "Mathematics" });
    expect(maths).toHaveTextContent("Meena Singh");
    expect(maths).toHaveTextContent("0/6");
    const english = screen.getByRole("option", { name: "English" });
    expect(english).toHaveTextContent("No teacher yet");
    expect(english).toHaveTextContent("0/5");
    // A subject of the school the class does not study yet says so, and a usual subject says it will be added.
    expect(screen.getByRole("option", { name: "Hindi" })).toHaveTextContent("Usual subject, added to your school");
  });

  it("finds a subject by typing: the subjects with those letters, and, last, the offer to add what was typed as a new subject", async () => {
    const { user } = openPage();
    await screen.findByRole("table", { name: "Weekly timetable" });
    await user.click(MON1());
    await user.type(search(), "eng");
    expect(rows()).toEqual(["English", "Add “eng” as a new subject"]);
    // Words that no subject has: only the offer.
    await user.clear(search());
    await user.type(search(), "zzq");
    expect(rows()).toEqual(["Add “zzq” as a new subject"]);
    // The exact name of a subject offers nothing to add.
    await user.clear(search());
    await user.type(search(), "english");
    expect(rows()).toEqual(["English"]);
  });

  it("is a calm page when the class has no timing, and leads to the School timings page", async () => {
    const { router, user } = openPage({ ...GRID, days: [] });
    expect(await screen.findByText(/This class has no school timing yet/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Set the school timings" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/school/timings"));
  });

  it("shows the week at once for a class with no subjects: any subject of the school can be put in, and is sent with the lessons", async () => {
    const { calls, user } = openPage({ ...GRID, allotments: [] });
    await screen.findByRole("table", { name: "Weekly timetable" });
    expect(screen.getByRole("button", { name: /Fill the empty periods/ })).toBeEnabled();
    await put(user, MON1(), "Mathematics");
    expect(MON1()).toHaveAccessibleName("Monday, Period 1, 08:30 to 09:10: Mathematics");
    await user.click(screen.getByRole("button", { name: "Save the timetable" }));
    await waitFor(() => expect(puts(calls)).toHaveLength(1));
    expect(puts(calls)[0].body).toMatchObject({ cells: [1, 2, 3, 4, 5].map((day) => ({ day, period: 1, lessons: [lesson("maths")] })) });
  });

  it("adds a usual subject the school does not have yet when it is picked, and uses it", async () => {
    const { calls, user } = openPage(GRID, { "POST /subjects/quick-add": () => ({ created: [{ ...ART, id: "hindi", name: "Hindi", category: "academic" }], skipped: [] }) });
    await screen.findByRole("table", { name: "Weekly timetable" });
    await put(user, MON1(), "Hindi");
    await waitFor(() => expect(posts(calls, "/subjects/quick-add")).toHaveLength(1));
    expect(posts(calls, "/subjects/quick-add")[0].body).toEqual({ names: ["Hindi"] });
    expect(await screen.findByText("Hindi is added to your school's subjects")).toBeInTheDocument();
    // It goes into the period that was clicked, and the box stays to ask for the teacher.
    await waitFor(() => expect(MON1()).toHaveAccessibleName("Monday, Period 1, 08:30 to 09:10: Hindi"));
    expect(await screen.findByRole("radiogroup", { name: "Teacher for Hindi" })).toBeInTheDocument();
  });

  it("adds a subject typed that is in no list", async () => {
    const { calls, user } = openPage(GRID, { "POST /subjects/quick-add": () => ({ created: [{ ...ART, id: "robotics", name: "Robotics" }], skipped: [] }) });
    await screen.findByRole("table", { name: "Weekly timetable" });
    await user.click(MON1());
    await user.type(search(), "Robotics");
    await user.click(await screen.findByRole("option", { name: /Add “Robotics” as a new subject/ }));
    await waitFor(() => expect(posts(calls, "/subjects/quick-add")[0]?.body).toEqual({ names: ["Robotics"] }));
    await waitFor(() => expect(MON1()).toHaveAccessibleName("Monday, Period 1, 08:30 to 09:10: Robotics"));
  });

  it("a subject typed that is in no list is added with Enter too (it is the only row)", async () => {
    const { calls, user } = openPage(GRID, { "POST /subjects/quick-add": () => ({ created: [{ ...ART, id: "robotics", name: "Robotics" }], skipped: [] }) });
    await screen.findByRole("table", { name: "Weekly timetable" });
    await user.click(MON1());
    await user.type(search(), "Robotics{Enter}");
    await waitFor(() => expect(posts(calls, "/subjects/quick-add")[0]?.body).toEqual({ names: ["Robotics"] }));
    await waitFor(() => expect(MON1()).toHaveAccessibleName(/Robotics$/));
  });

  it("says so when adding the subject failed, and puts nothing in the period", async () => {
    const { user } = openPage(GRID, { "POST /subjects/quick-add": server(500, "The server is busy") });
    await screen.findByRole("table", { name: "Weekly timetable" });
    await user.click(MON1());
    await user.type(search(), "Robotics{Enter}");
    expect(await screen.findByRole("alert")).toHaveTextContent("The server is busy");
    expect(MON1()).toHaveAccessibleName(/empty$/);
    expect(screen.queryByText("Not saved")).not.toBeInTheDocument();
  });

  it("has no Periods & teachers button and no line of help; the periods a week and teachers open from the fill when no subject has any, and go back to the week with Close", async () => {
    const { user } = openPage({ ...GRID, allotments: [] });
    await screen.findByRole("table", { name: "Weekly timetable" });
    expect(screen.queryByRole("button", { name: "Periods & teachers" })).not.toBeInTheDocument();
    expect(screen.queryByText(/Click a period, type the subject/)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "change periods a week" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Fill the empty periods/ }));
    expect(await screen.findByRole("heading", { name: "Class 5 - A: periods a week and teachers" })).toBeInTheDocument();
    await screen.findByLabelText("Mathematics: periods a week");
    await user.click(screen.getByRole("button", { name: "Close" }));
    expect(await screen.findByRole("table", { name: "Weekly timetable" })).toBeInTheDocument();
  });

  it("reads the week again after the periods and teachers are saved", async () => {
    const { calls, user } = openPage({ ...GRID, allotments: [] });
    await screen.findByRole("table", { name: "Weekly timetable" });
    await user.click(screen.getByRole("button", { name: /Fill the empty periods/ }));
    const periods = await screen.findByLabelText("Mathematics: periods a week");
    await user.clear(periods);
    await user.type(periods, "7");
    const before = calls.filter((c) => c.method === "GET" && c.path === "/timetable/grid").length;
    await user.click(screen.getByRole("button", { name: "Save subjects" }));
    await waitFor(() => expect(calls.filter((c) => c.method === "GET" && c.path === "/timetable/grid").length).toBe(before + 1));
  });

  it("will not open the class timing while the week has changes that are not saved", async () => {
    const { user } = openPage();
    await screen.findByRole("table", { name: "Weekly timetable" });
    await put(user, MON1(), "Mathematics");
    expect(screen.getByRole("button", { name: "Periods & time" })).toBeDisabled();
  });

  it("the fill asks for the periods a week when no subject has any, and says to save first when the week has changes", async () => {
    const { user } = openPage({ ...GRID, allotments: [] });
    await screen.findByRole("table", { name: "Weekly timetable" });
    await put(user, MON1(), "Mathematics");
    await user.click(screen.getByRole("button", { name: /Fill the empty periods/ }));
    expect(await screen.findByText(/Save the timetable first, then say how many periods a week each subject gets/)).toBeInTheDocument();
    expect(screen.getByRole("table", { name: "Weekly timetable" })).toBeInTheDocument();
  });

  it("the fill of a class with no subject periods opens the periods a week and teachers instead of doing nothing", async () => {
    const { calls, user } = openPage({ ...GRID, allotments: [] });
    await screen.findByRole("table", { name: "Weekly timetable" });
    await user.click(screen.getByRole("button", { name: /Fill the empty periods/ }));
    expect(await screen.findByRole("heading", { name: "Class 5 - A: periods a week and teachers" })).toBeInTheDocument();
    expect(posts(calls, "/timetable/grid/autofill")).toHaveLength(0);
  });

  it("says why it could not load, and tries again", async () => {
    let fail = true;
    openPage(GRID, { "GET /timetable/grid": () => (fail ? server(500, "The server is busy")() : GRID) });
    expect(await screen.findByText("The server is busy")).toBeInTheDocument();
    fail = false;
    await userEvent.setup().click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("table", { name: "Weekly timetable" })).toBeInTheDocument();
  });
});

describe("A class's timetable: putting subjects in", () => {
  it("a subject picked in the box of a period goes into that period, the counts follow, and the box goes on to the teachers", async () => {
    const { user } = openPage();
    await screen.findByRole("table", { name: "Weekly timetable" });
    await put(user, MON1(), "Mathematics");
    expect(await screen.findByRole("radiogroup", { name: "Teacher for Mathematics" })).toBeInTheDocument();
    expect(MON1()).toHaveAccessibleName("Monday, Period 1, 08:30 to 09:10: Mathematics");
    expect(MON1()).toHaveTextContent("Meena");
    expect(screen.getByText("5 of 40 periods have a lesson")).toBeInTheDocument();
    expect(screen.getByText("Not saved")).toBeInTheDocument();
    // The box of another period says how many Mathematics periods are in now.
    await user.click(MON2());
    expect(await screen.findByRole("option", { name: "Mathematics" })).toHaveTextContent("5/6");
  });

  it("types the first letters and presses Enter: the first subject that fits goes in; the arrow keys move to another", async () => {
    const { user } = openPage();
    await screen.findByRole("table", { name: "Weekly timetable" });
    await user.click(MON1());
    await user.type(search(), "eng{Enter}");
    expect(MON1()).toHaveAccessibleName("Monday, Period 1, 08:30 to 09:10: ENG");
    expect(await screen.findByRole("radiogroup", { name: "Teacher for English" })).toBeInTheDocument();
    // With nothing typed the first row is the class's first subject; one arrow down is the second. (Tuesday has English now too: the subject goes on
    // every day, so its box opens on the teacher and Change goes to the list.)
    await subjectsOf(user, TUE1());
    expect(screen.getByRole("option", { name: "Mathematics" })).toHaveAttribute("aria-selected", "true");
    await user.keyboard("{ArrowDown}");
    expect(screen.getByRole("option", { name: "English" })).toHaveAttribute("aria-selected", "true");
    expect(search()).toHaveAttribute("aria-activedescendant", screen.getByRole("option", { name: "English" }).id);
    await user.keyboard("{Enter}");
    expect(TUE1()).toHaveAccessibleName("Tuesday, Period 1, 08:30 to 09:10: ENG");
  });

  it("on a phone the cursor is not put in the search box (so the keyboard does not cover the list), and a subject is picked from the list", async () => {
    const original = window.matchMedia.bind(window);
    const media = vi.spyOn(window, "matchMedia").mockImplementation((query) => ({ ...original(query), matches: query.includes("max-width: 639px") }) as MediaQueryList);
    try {
      const { user } = openPage();
      await screen.findByRole("table", { name: "Weekly timetable" });
      await user.click(MON1());
      await screen.findByRole("dialog", { name: "Monday, Period 1: choose the subject" });
      expect(search()).not.toHaveFocus();
      await user.click(screen.getByRole("option", { name: "Mathematics" }));
      // The box (a modal one on a phone) stays for the teacher; it is closed to see the week behind it.
      expect(await screen.findByRole("radiogroup", { name: "Teacher for Mathematics" })).toBeInTheDocument();
      await user.keyboard("{Escape}");
      await waitFor(() => expect(screen.queryByRole("dialog", { name: /choose the subject$/ })).not.toBeInTheDocument());
      expect(MON1()).toHaveAccessibleName("Monday, Period 1, 08:30 to 09:10: Mathematics");
    } finally {
      media.mockRestore();
    }
  });

  it("Escape closes the box and changes nothing", async () => {
    const { user } = openPage();
    await screen.findByRole("table", { name: "Weekly timetable" });
    await user.click(MON1());
    await screen.findByRole("dialog");
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(MON1()).toHaveAccessibleName(/empty$/);
    expect(screen.queryByText("Not saved")).not.toBeInTheDocument();
  });

  it("clicking another period moves the box to it (it does not need a second click)", async () => {
    const { user } = openPage();
    await screen.findByRole("table", { name: "Weekly timetable" });
    await user.click(MON1());
    await screen.findByRole("dialog", { name: "Monday, Period 1: choose the subject" });
    await user.click(TUE1());
    expect(await screen.findByRole("dialog", { name: "Tuesday, Period 1: choose the subject" })).toBeInTheDocument();
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
  });

  it("changes the subject of a period that has a lesson: the new one replaces it", async () => {
    const { user } = openPage({ ...GRID, exists: true, cells: [{ day: 1, period: 1, lessons: [lesson("maths")] }], stats: { ...GRID.stats, filled: 1, free: 39, placed: { maths: 1 } } });
    await screen.findByRole("table", { name: "Weekly timetable" });
    await user.click(MON1());
    // A period that has a lesson opens on its teacher, with its subject on top and a way to change it.
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Subject")).toBeInTheDocument();
    expect(within(dialog).getByText("Mathematics")).toBeInTheDocument();
    expect(within(dialog).queryByRole("combobox", { name: "Subject for this period" })).not.toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Change" }));
    // The subject it has now is marked in the list.
    const here = await screen.findByRole("option", { name: "Mathematics" });
    expect(within(here).getByLabelText("In this period now")).toBeInTheDocument();
    // Keep goes back to the teacher without changing anything.
    await user.click(screen.getByRole("button", { name: "Keep Mathematics" }));
    expect(await screen.findByRole("radiogroup", { name: "Teacher for Mathematics" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Change" }));
    await user.click(screen.getByRole("option", { name: "English" }));
    expect(MON1()).toHaveAccessibleName("Monday, Period 1, 08:30 to 09:10: ENG");
    expect(screen.getByText("1 of 40 periods have a lesson")).toBeInTheDocument();
    expect(screen.getByText("Not saved")).toBeInTheDocument();
  });

  it("picking the subject a period already has leaves it as it is, with its room", async () => {
    const withRoom = { day: 1, period: 1, lessons: [{ subjectId: "maths", teacherId: null, room: "Lab 2" }] };
    const { user } = openPage({ ...GRID, exists: true, cells: [withRoom], stats: { ...GRID.stats, filled: 1, free: 39, placed: { maths: 1 } } });
    await screen.findByRole("table", { name: "Weekly timetable" });
    await subjectsOf(user, MON1());
    await user.click(await screen.findByRole("option", { name: "Mathematics" }));
    expect(await screen.findByRole("radiogroup", { name: "Teacher for Mathematics" })).toBeInTheDocument();
    expect(MON1()).toHaveTextContent("Lab 2");
    expect(screen.queryByText("Not saved")).not.toBeInTheDocument();
  });

  it("takes the lesson out of a period from its box", async () => {
    const { user } = openPage({ ...GRID, cells: [{ day: 1, period: 1, lessons: [lesson("maths")] }], exists: true, stats: { ...GRID.stats, filled: 1, free: 39, placed: { maths: 1 } } });
    await screen.findByRole("table", { name: "Weekly timetable" });
    await user.click(MON1());
    await user.click(await screen.findByRole("button", { name: "Take it out" }));
    expect(MON1()).toHaveAccessibleName("Monday, Period 1, 08:30 to 09:10: empty");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByText("Not saved")).toBeInTheDocument();
  });

  it("a subject given in double periods takes two periods in a row; at the end of a stretch only one fits, and it says so", async () => {
    const lab = { subjectId: "lab", subjectName: "Computer Lab", subjectCode: null, category: "activity" as const, periodsPerWeek: 2, blockSize: 2, teacherId: null, group: null };
    const { user } = openPage({ ...GRID, allotments: [...GRID.allotments, lab] });
    await screen.findByRole("table", { name: "Weekly timetable" });
    await put(user, MON1(), "Computer Lab");
    expect(MON1()).toHaveTextContent("Computer Lab");
    expect(MON2()).toHaveTextContent("Computer Lab");
    // Period 3 is the last before the lunch.
    await put(user, slot("Tuesday", 3, "09:50 to 10:30"), "Computer Lab");
    expect(slot("Tuesday", 4, "11:00 to 11:40")).toHaveAccessibleName(/empty$/);
    expect(await screen.findByText("Computer Lab is meant for 2 periods in a row, but only 1 fit here.")).toBeInTheDocument();
  });

  it("the subjects of a choice go in together, whichever is picked", async () => {
    const a = { subjectId: "sanskrit", subjectName: "Sanskrit", subjectCode: null, category: "academic" as const, periodsPerWeek: 3, blockSize: 1, teacherId: null, group: "Third language" };
    const b = { ...a, subjectId: "french", subjectName: "French" };
    const { user } = openPage({ ...GRID, allotments: [...GRID.allotments, a, b] });
    await screen.findByRole("table", { name: "Weekly timetable" });
    await put(user, MON1(), "French");
    expect(MON1()).toHaveAccessibleName("Monday, Period 1, 08:30 to 09:10: Sanskrit and French");
  });

  it("a period that cannot be right (a teacher in another class then, a day a teacher does not come) is red at once, with the reason", async () => {
    const busy = [{ day: 2, period: 1, teacherId: "meena", room: null, where: "Class 5 - B", subjectName: "Mathematics" }];
    const { user } = openPage({ ...GRID, busy });
    await screen.findByRole("table", { name: "Weekly timetable" });
    await put(user, TUE1(), "Mathematics");
    // The period whose box is open has the blue ring; the red edge shows once the box is closed.
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog", { name: /choose the subject$/ })).not.toBeInTheDocument());
    expect(TUE1()).toHaveAttribute("title", "Meena Singh is teaching Class 5 - B (Mathematics) at the same time");
    expect(TUE1().className).toContain("border-danger");
    await put(user, MON1(), "Mathematics");
    expect(MON1()).not.toHaveAttribute("title");
  });

  it("warns in the box, before a subject is picked, that its usual teacher is busy then; the subject can still be picked", async () => {
    const busy = [{ day: 2, period: 1, teacherId: "meena", room: null, where: "Class 5 - B", subjectName: "Mathematics" }];
    const { user } = openPage({ ...GRID, busy });
    await screen.findByRole("table", { name: "Weekly timetable" });
    await user.click(TUE1());
    const maths = await screen.findByRole("option", { name: "Mathematics" });
    expect(maths).toHaveTextContent("Meena Singh is teaching Class 5 - B (Mathematics) then");
    expect(screen.getByRole("option", { name: "English" })).not.toHaveTextContent(/is teaching/);
    // Monday has no clash: no warning there.
    await user.click(MON1());
    expect(await screen.findByRole("option", { name: "Mathematics" })).not.toHaveTextContent(/is teaching/);
    await user.click(screen.getByRole("option", { name: "Mathematics" }));
    expect(MON1()).toHaveAccessibleName(/Mathematics$/);
  });
});

describe("A class's timetable: one period's teacher and room", () => {
  const withMaths: GridView = { ...GRID, exists: true, cells: [{ day: 1, period: 1, lessons: [lesson("maths")] }], stats: { ...GRID.stats, filled: 1, free: 39, placed: { maths: 1 } } };

  it("opens from the box of a period that has a lesson, shows who can and cannot take it, and keeps a teacher and a room on the lesson", async () => {
    const { calls, user } = openPage(withMaths);
    await screen.findByRole("table", { name: "Weekly timetable" });
    await user.click(MON1());
    await user.click(await screen.findByRole("button", { name: "Room" }));
    // The box gives way to the window.
    await waitFor(() => expect(screen.queryByRole("dialog", { name: /choose the subject/ })).not.toBeInTheDocument());
    const d = await screen.findByRole("dialog", { name: "Monday, Period 1" });
    expect(d).toHaveTextContent("08:30 to 09:10");
    await user.click(within(d).getByRole("button", { name: /Teacher/ }));
    // Dev does not come on Mondays: shown, and cannot be picked.
    const options = await screen.findAllByRole("option");
    expect(options.map((o) => o.textContent)).toEqual(["Meena Singh (the usual teacher)", "Dev Patel (does not come)", "Meena Singh"]);
    expect(options[1]).toHaveAttribute("aria-disabled", "true");
    await user.keyboard("{Escape}");
    await user.type(within(d).getByLabelText("Room"), "Lab 2");
    await user.click(within(d).getByRole("button", { name: "Done" }));
    expect(MON1()).toHaveTextContent("Lab 2");
    expect(puts(calls)).toHaveLength(0);
    await user.click(screen.getByRole("button", { name: "Save the timetable" }));
    await waitFor(() => expect(puts(calls)).toHaveLength(1));
    expect(puts(calls)[0].body).toEqual({ classId: "c5", sectionId: "c5-A", cells: [{ day: 1, period: 1, lessons: [{ subjectId: "maths", teacherId: null, room: "Lab 2" }] }] });
  });

  it("takes the lesson out of the period from its own window", async () => {
    const { user } = openPage(withMaths);
    await screen.findByRole("table", { name: "Weekly timetable" });
    await user.click(MON1());
    await user.click(await screen.findByRole("button", { name: "Room" }));
    await user.click(await screen.findByRole("button", { name: "Take it out of this period" }));
    expect(MON1()).toHaveAccessibleName(/empty$/);
  });
});

describe("A class's timetable: saving", () => {
  it("is one request with the whole grid, in order, and then publishes the draft; what the server answers is the grid", async () => {
    let last: GridView = GRID;
    const { calls, user } = openPage(GRID, {
      "PUT /timetable/grid": (body) => (last = saved(GRID)(body) as GridView),
      "POST /timetable/grid/publish": () => ({ ...last, status: "published", publishedAt: "2026-11-14T10:00:00.000Z" }),
    });
    await screen.findByRole("table", { name: "Weekly timetable" });
    await put(user, TUE1(), "English");
    expect(screen.getByRole("button", { name: "Save the timetable" })).toBeEnabled();
    // The class list on the left is read again (its status changes); the week itself is not.
    const notList = () => calls.filter((c) => c.path !== "/timetable/overview");
    const before = notList().length;
    await user.click(screen.getByRole("button", { name: "Save the timetable" }));
    expect(await screen.findByText("Timetable saved and published")).toBeInTheDocument();
    expect(puts(calls)[0].body).toEqual({ classId: "c5", sectionId: "c5-A", cells: [1, 2, 3, 4, 5].map((day) => ({ day, period: 1, lessons: [lesson("english")] })) });
    expect(posts(calls, "/timetable/grid/publish")).toHaveLength(1);
    // Saved, then published: two requests, and nothing is asked for again.
    expect(notList().length).toBe(before + 2);
    expect(screen.queryByText("Not saved")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save the timetable" })).toBeDisabled();
    expect(await screen.findByText("Checks: nothing to fix.")).toBeInTheDocument();
    expect(screen.queryByText("Everything is saved.")).not.toBeInTheDocument();
  });

  it("has ONE Save button, at the top with the page's other buttons, above the week; there is no Publish button and no second Save under it", async () => {
    openPage();
    const save = await screen.findByRole("button", { name: "Save the timetable" });
    const table = screen.getByRole("table", { name: "Weekly timetable" });
    expect(screen.getAllByRole("button", { name: "Save the timetable" })).toHaveLength(1);
    expect(save.compareDocumentPosition(table) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Publish" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Publish the timetable" })).not.toBeInTheDocument();
  });

  it("a timetable that is published stays published when it is saved: one request, no publish", async () => {
    const published: GridView = { ...GRID, status: "published", exists: true, cells: [{ day: 1, period: 1, lessons: [lesson("maths")] }] };
    const { calls, user } = openPage(published);
    await screen.findByRole("table", { name: "Weekly timetable" });
    await put(user, TUE1(), "English");
    await user.click(screen.getByRole("button", { name: "Save the timetable" }));
    expect(await screen.findByText("Timetable saved")).toBeInTheDocument();
    expect(puts(calls)).toHaveLength(1);
    expect(posts(calls, "/timetable/grid/publish")).toHaveLength(0);
  });

  it("saving a week with nothing in it saves it and does not try to publish it", async () => {
    const withOne: GridView = { ...GRID, status: "draft", exists: true, cells: [{ day: 1, period: 1, lessons: [lesson("maths")] }] };
    const { calls, user } = openPage(withOne);
    await screen.findByRole("table", { name: "Weekly timetable" });
    await user.click(screen.getByRole("button", { name: "Empty the whole week" }));
    await user.click(within(await screen.findByRole("dialog", { name: "Empty the whole week?" })).getByRole("button", { name: "Empty it" }));
    await user.click(screen.getByRole("button", { name: "Save the timetable" }));
    expect(await screen.findByText("Timetable saved")).toBeInTheDocument();
    expect(posts(calls, "/timetable/grid/publish")).toHaveLength(0);
  });

  it("when the week is saved but cannot be published it says so (the week is kept)", async () => {
    const { calls, user } = openPage(GRID, { "POST /timetable/grid/publish": server(409, "Meena Singh is teaching Class 5 - B at the same time", "TIMETABLE_CLASHES") });
    await screen.findByRole("table", { name: "Weekly timetable" });
    await put(user, MON1(), "English");
    await user.click(screen.getByRole("button", { name: "Save the timetable" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("The timetable is saved, but it could not be published: Meena Singh is teaching Class 5 - B at the same time");
    expect(puts(calls)).toHaveLength(1);
  });

  it("is refused for a clash: the period turns red with the server's reason, the message is said, and the grid is kept for the person to fix", async () => {
    const { user } = openPage(GRID, {
      "PUT /timetable/grid": server(409, "Meena Singh is teaching Class 5 - B (Mathematics) at the same time", "TIMETABLE_CLASHES", [{ path: "d1p1", message: "Meena Singh is teaching Class 5 - B (Mathematics) at the same time", code: "TEACHER_BUSY" }]),
    });
    await screen.findByRole("table", { name: "Weekly timetable" });
    await put(user, MON1(), "Mathematics");
    await user.click(screen.getByRole("button", { name: "Save the timetable" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Meena Singh is teaching Class 5 - B (Mathematics) at the same time");
    expect(MON1()).toHaveAttribute("title", "Meena Singh is teaching Class 5 - B (Mathematics) at the same time");
    expect(MON1()).toHaveAccessibleName(/Mathematics$/);
    expect(screen.getByText("Not saved")).toBeInTheDocument();
    // Taking the lesson out clears the red.
    await user.click(MON1());
    await user.click(await screen.findByRole("button", { name: "Take it out" }));
    expect(MON1()).not.toHaveAttribute("title");
  });

  it("throws away the changes made since the last save", async () => {
    const { user } = openPage();
    await screen.findByRole("table", { name: "Weekly timetable" });
    await put(user, MON1(), "Mathematics");
    await user.click(screen.getByRole("button", { name: "Throw away my changes" }));
    expect(MON1()).toHaveAccessibleName(/empty$/);
    expect(screen.queryByText("Not saved")).not.toBeInTheDocument();
  });

  it("empties the whole week after a question, still only on the screen", async () => {
    const { calls, user } = openPage({ ...GRID, exists: true, cells: [{ day: 1, period: 1, lessons: [lesson("maths")] }, { day: 2, period: 1, lessons: [lesson("maths")] }], stats: { ...GRID.stats, filled: 2, free: 38, placed: { maths: 2 } } });
    await screen.findByRole("table", { name: "Weekly timetable" });
    await user.click(screen.getByRole("button", { name: "Empty the whole week" }));
    await user.click(await screen.findByRole("button", { name: "Empty it" }));
    expect(MON1()).toHaveAccessibleName(/empty$/);
    expect(puts(calls)).toHaveLength(0);
    expect(screen.getByText("Not saved")).toBeInTheDocument();
  });

  it("asks before leaving with changes that are not saved, and lets the person stay", async () => {
    const { router, user } = openPage();
    await screen.findByRole("table", { name: "Weekly timetable" });
    await put(user, MON1(), "Mathematics");
    await user.click(screen.getByRole("link", { name: "Dashboard" }));
    const d = await screen.findByRole("dialog", { name: "Leave without saving?" });
    await user.click(within(d).getByRole("button", { name: "Cancel" }));
    expect(router.state.location.pathname).toBe("/school/timetable");
    expect(MON1()).toHaveAccessibleName(/Mathematics$/);
    await user.click(screen.getByRole("link", { name: "Dashboard" }));
    await user.click(within(await screen.findByRole("dialog", { name: "Leave without saving?" })).getByRole("button", { name: "Leave without saving" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/dashboard"));
  });

  it("asks before opening another class, or another page, with changes that are not saved", async () => {
    const { router, user } = openPage();
    await screen.findByRole("table", { name: "Weekly timetable" });
    await put(user, MON1(), "Mathematics");
    await user.click(within(screen.getByRole("list", { name: "Classes" })).getByRole("button", { name: /Class 5 - B/ }));
    const d = await screen.findByRole("dialog", { name: "Leave without saving?" });
    await user.click(within(d).getByRole("button", { name: "Cancel" }));
    expect(router.state.location.search).toBe("?class=c5&section=c5-A");
    await act(async () => void router.navigate("/school/timings"));
    expect(await screen.findByRole("dialog", { name: "Leave without saving?" })).toBeInTheDocument();
  });

  it("leaves without asking when everything is saved", async () => {
    const { router, user } = openPage();
    await screen.findByRole("table", { name: "Weekly timetable" });
    await user.click(screen.getByRole("link", { name: "Dashboard" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/dashboard"));
  });
});

describe("A class's timetable: filling it by the program", () => {
  const FILLED: GridCell[] = [
    { day: 1, period: 1, lessons: [lesson("maths")] },
    { day: 2, period: 2, lessons: [lesson("english")] },
  ];
  const answer = (seed: number, over: object = {}) => ({ cells: FILLED, issues: [], stats: { total: 40, filled: 2, free: 38, placed: { maths: 1, english: 1 } }, unplaced: [], dropped: 0, seed, ...over });

  it("asks once, puts the answer on the screen as not yet saved, and says what to do", async () => {
    const { calls, user } = openPage(GRID, { "POST /timetable/grid/autofill": () => answer(1) });
    await screen.findByRole("table", { name: "Weekly timetable" });
    await user.click(screen.getByRole("button", { name: "Fill the empty periods" }));
    expect(await screen.findByText(/The empty periods are filled\. Look at it, change what you like, then press Save\./)).toBeInTheDocument();
    expect(posts(calls, "/timetable/grid/autofill")).toHaveLength(1);
    expect(posts(calls, "/timetable/grid/autofill")[0].body).toEqual({ classId: "c5", sectionId: "c5-A", cells: [], seed: 1 });
    expect(MON1()).toHaveAccessibleName(/Mathematics$/);
    expect(screen.getByText("Not saved")).toBeInTheDocument();
    expect(puts(calls)).toHaveLength(0);
  });

  it("another arrangement starts again from the lessons that were there before the first fill, with the next seed; the fill can be undone", async () => {
    const { calls, user } = openPage({ ...GRID, exists: true, cells: [{ day: 3, period: 1, lessons: [lesson("maths")] }] }, { "POST /timetable/grid/autofill": (body) => answer((body as { seed: number }).seed) });
    await screen.findByRole("table", { name: "Weekly timetable" });
    await user.click(screen.getByRole("button", { name: "Fill the empty periods" }));
    await user.click(await screen.findByRole("button", { name: "Try another arrangement" }));
    await waitFor(() => expect(posts(calls, "/timetable/grid/autofill")).toHaveLength(2));
    const [first, second] = posts(calls, "/timetable/grid/autofill").map((c) => c.body as { seed: number; cells: GridCell[] });
    expect([first.seed, second.seed]).toEqual([1, 2]);
    expect(second.cells).toEqual(first.cells);
    await user.click(screen.getByRole("button", { name: "Undo the fill" }));
    expect(slot("Wednesday", 1, "08:30 to 09:10")).toHaveAccessibleName(/Mathematics$/);
    expect(MON1()).toHaveAccessibleName(/empty$/);
    expect(screen.queryByText(/The empty periods are filled/)).not.toBeInTheDocument();
  });

  it("says what could not be placed, and what was left out because it clashed", async () => {
    const { user } = openPage(GRID, { "POST /timetable/grid/autofill": () => answer(1, { unplaced: [{ subjectId: "maths", subjectName: "Mathematics", missing: 2 }], dropped: 1 }) });
    await screen.findByRole("table", { name: "Weekly timetable" });
    await user.click(screen.getByRole("button", { name: "Fill the empty periods" }));
    expect(await screen.findByText(/Mathematics \(2 missing\)/)).toBeInTheDocument();
    expect(screen.getByText("1 lesson you had put in was left out because of a clash.")).toBeInTheDocument();
  });

  it("a change by hand after the fill ends the fill's note (the next fill starts from what is on the screen)", async () => {
    const { user } = openPage(GRID, { "POST /timetable/grid/autofill": () => answer(1) });
    await screen.findByRole("table", { name: "Weekly timetable" });
    await user.click(screen.getByRole("button", { name: "Fill the empty periods" }));
    await screen.findByText(/The empty periods are filled/);
    await user.click(MON1());
    await user.click(await screen.findByRole("button", { name: "Take it out" }));
    expect(screen.queryByText(/The empty periods are filled/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Fill the empty periods" })).toBeInTheDocument();
  });

  it("says why when it could not fill", async () => {
    const { user } = openPage(GRID, { "POST /timetable/grid/autofill": server(409, "Class 5 - A has no timing yet.", "NO_TIMING") });
    await screen.findByRole("table", { name: "Weekly timetable" });
    await user.click(screen.getByRole("button", { name: "Fill the empty periods" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Class 5 - A has no timing yet.");
  });
});

describe("A class's timetable: publishing and copying", () => {
  const draft: GridView = { ...GRID, exists: true, cells: [{ day: 1, period: 1, lessons: [lesson("maths")] }], stats: { ...GRID.stats, filled: 1, free: 39, placed: { maths: 1 } } };

  it("a saved draft that was never published is published by the same button (it says Publish the timetable), and can be taken back", async () => {
    const { calls, user } = openPage(draft, {
      "POST /timetable/grid/publish": () => ({ ...draft, status: "published", publishedAt: "2026-10-31T10:00:00.000Z" }),
      "POST /timetable/grid/unpublish": () => draft,
    });
    const header = async () => within((await screen.findByRole("heading", { name: "Class 5 - A", level: 1 })).closest("header")!);
    expect((await header()).getByText("Draft")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Publish the timetable" }));
    expect(await (await header()).findByText("Published")).toBeInTheDocument();
    expect(posts(calls, "/timetable/grid/publish")[0].body).toEqual({ classId: "c5", sectionId: "c5-A" });
    // Published and saved: the button has nothing to do; the way back to a draft is beside it.
    expect(await screen.findByRole("button", { name: "Save the timetable" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Take back to a draft" }));
    expect(await (await header()).findByText("Draft")).toBeInTheDocument();
  });

  it("with changes that are not saved the button is Save the timetable, and copying waits for it", async () => {
    const { user } = openPage(draft);
    await screen.findByRole("table", { name: "Weekly timetable" });
    expect(screen.getByRole("button", { name: "Publish the timetable" })).toBeEnabled();
    await put(user, TUE1(), "English");
    expect(screen.getByRole("button", { name: "Save the timetable" })).toBeEnabled();
    expect(screen.queryByRole("button", { name: "Publish the timetable" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Copy to other sections" })).toBeDisabled();
  });

  it("a week with nothing in it has nothing to save or publish", async () => {
    openPage(GRID);
    expect(await screen.findByRole("button", { name: "Save the timetable" })).toBeDisabled();
  });

  it("says why when publishing a saved draft is refused", async () => {
    const { user } = openPage(draft, { "POST /timetable/grid/publish": server(409, "Monday has no period 9 in this class's timing", "TIMETABLE_CLASHES") });
    await user.click(await screen.findByRole("button", { name: "Publish the timetable" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("It could not be published: Monday has no period 9 in this class's timing");
  });

  it("copies to the other sections of the class and says, for each, what was copied and what was left out and why", async () => {
    const { calls, user } = openPage(draft, {
      "POST /timetable/grid/copy": () => ({ results: [{ sectionId: "c5-B", label: "Class 5 - B", status: "copied", copied: 1, left: [{ day: 1, period: 1, reason: "Meena Singh is teaching Class 5 - A (Mathematics) at the same time" }] }] }),
    });
    await user.click(await screen.findByRole("button", { name: "Copy to other sections" }));
    const d = await screen.findByRole("dialog", { name: "Copy to the other sections" });
    expect(within(d).getByRole("button", { name: "Copy" })).toBeDisabled();
    expect(within(d).queryByRole("button", { name: "Section A" })).not.toBeInTheDocument();
    await user.click(within(d).getByRole("button", { name: "Section B" }));
    await user.click(within(d).getByRole("button", { name: "Copy" }));
    expect(await within(d).findByText("Class 5 - B: 1 period copied")).toBeInTheDocument();
    expect(within(d).getByText("Left out, Monday period 1: Meena Singh is teaching Class 5 - A (Mathematics) at the same time")).toBeInTheDocument();
    expect(posts(calls, "/timetable/grid/copy")[0].body).toEqual({ classId: "c5", sectionId: "c5-A", toSections: ["c5-B"], replace: false });
  });

  it("prints the page", async () => {
    const print = vi.spyOn(window, "print").mockImplementation(() => {});
    const { user } = openPage();
    await user.click(await screen.findByRole("button", { name: "Print" }));
    expect(print).toHaveBeenCalledOnce();
    print.mockRestore();
  });
});

describe("A class's timetable: the checks", () => {
  it("lists what the server found in what was saved: what is to fix in red first, what is worth a look after, each with its place", async () => {
    openPage({
      ...GRID,
      exists: true,
      issues: [
        { level: "error", code: "TEACHER_BUSY", message: "Meena Singh is teaching Class 5 - B (Mathematics) at the same time", day: 1, period: 1 },
        { level: "warning", code: "TOO_FEW", message: "English has none of its 5 periods", subjectId: "english" },
        { level: "warning", code: "BACK_TO_BACK", message: "Mathematics is in two periods in a row on Tuesday", day: 2, period: 3 },
      ],
    });
    const fix = await screen.findByRole("list", { name: "To fix" });
    expect(within(fix).getByText("Monday period 1:")).toBeInTheDocument();
    expect(fix).toHaveTextContent("Meena Singh is teaching Class 5 - B (Mathematics) at the same time");
    const look = screen.getByRole("list", { name: "Worth a look" });
    expect(look).toHaveTextContent("English has none of its 5 periods");
    expect(within(look).getByText("Tuesday period 3:")).toBeInTheDocument();
  });

  it("stops listing them while the grid has changes (they are about what was saved), and says to save", async () => {
    const { user } = openPage();
    await screen.findByText("Mathematics has none of its 6 periods");
    await put(user, MON1(), "Mathematics");
    expect(screen.queryByText("Mathematics has none of its 6 periods")).not.toBeInTheDocument();
    expect(screen.getByText(/Save the timetable to see all the checks/)).toBeInTheDocument();
  });
});

describe("A class's timetable: when its day ends", () => {
  const endsRow = () => within(screen.getByRole("table", { name: "Weekly timetable" })).getByRole("row", { name: /^Class ends/ });
  const endsOf = () => within(endsRow()).getAllByRole("cell").map((c) => c.textContent);

  it("says for each day when the class ends: the end of the last period that has a lesson, with nothing to set; a day with no lesson has none", async () => {
    openPage({ ...GRID, cells: [{ day: 1, period: 3, lessons: [lesson("maths")] }, { day: 2, period: 5, lessons: [lesson("english")] }] });
    await screen.findByRole("table", { name: "Weekly timetable" });
    expect(endsOf()).toEqual(["10:30", "12:20", "–", "–", "–"]);
  });

  it("follows the lessons as they are put in, before anything is saved", async () => {
    const { user } = openPage();
    await screen.findByRole("table", { name: "Weekly timetable" });
    expect(endsOf()).toEqual(["–", "–", "–", "–", "–"]);
    await put(user, MON1(), "Mathematics");
    expect(endsOf()[0]).toBe("09:10");
    await put(user, MON2(), "English");
    expect(endsOf()[0]).toBe("09:50");
    // Period 2 went on every day too; a day whose lessons are taken out ends earlier.
    expect(endsOf().slice(0, 2)).toEqual(["09:50", "09:50"]);
    await user.click(MON2());
    await user.click(await screen.findByRole("button", { name: "Take it out" }));
    expect(endsOf().slice(0, 2)).toEqual(["09:10", "09:50"]);
  });
});

describe("A class's timetable: a subject goes on every day", () => {
  const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
  const firsts = () => DAYS.map((d) => slot(d, 1, "08:30 to 09:10").getAttribute("aria-label")!.split(": ")[1]);
  const games = { subjectId: "games", subjectName: "Karate", subjectCode: null, category: "activity" as const, periodsPerWeek: 0, blockSize: 1, teacherId: "dev", group: null };

  it("put in an empty period, it is in that period of every day, not saved yet; nothing else moves", async () => {
    const { calls, user } = openPage();
    await screen.findByRole("table", { name: "Weekly timetable" });
    await put(user, MON1(), "English");
    expect(firsts()).toEqual(["ENG", "ENG", "ENG", "ENG", "ENG"]);
    expect(MON2()).toHaveAccessibleName(/empty$/);
    expect(screen.getByText("5 of 40 periods have a lesson")).toBeInTheDocument();
    expect(screen.getByText("Not saved")).toBeInTheDocument();
    expect(puts(calls)).toHaveLength(0);
  });

  it("changing one day afterwards changes only that day", async () => {
    const { user } = openPage();
    await screen.findByRole("table", { name: "Weekly timetable" });
    await put(user, MON1(), "English");
    await put(user, TUE1(), "Mathematics");
    expect(firsts()).toEqual(["ENG", "Mathematics", "ENG", "ENG", "ENG"]);
  });

  it("a day that already has a lesson in that period keeps it", async () => {
    const { user } = openPage({ ...GRID, exists: true, cells: [{ day: 3, period: 1, lessons: [lesson("maths")] }] });
    await screen.findByRole("table", { name: "Weekly timetable" });
    await put(user, MON1(), "English");
    expect(firsts()).toEqual(["ENG", "ENG", "Mathematics", "ENG", "ENG"]);
  });

  it("a day its teacher does not come stays empty, and the page says so", async () => {
    const { user } = openPage({ ...GRID, allotments: [...GRID.allotments, games] });
    await screen.findByRole("table", { name: "Weekly timetable" });
    await put(user, TUE1(), "Karate");
    expect(MON1()).toHaveAccessibleName(/empty$/);
    expect(TUE1()).toHaveAccessibleName(/Karate$/);
    expect(await screen.findByText("Karate is not on Monday: its teacher cannot take that period.")).toBeInTheDocument();
  });
});

describe("A class's timetable: choosing the teacher in the box of a period", () => {
  const teachersOf = (subject: string) => screen.findByRole("radiogroup", { name: `Teacher for ${subject}` });

  // Meena teaches Mathematics and English; Dev teaches nothing yet.
  const MEENA_ENGLISH = (view: GridView): GridView => ({ ...view, teachers: view.teachers.map((t) => (t.id === "meena" ? { ...t, subjectIds: ["maths", "english"] } : t)) });

  it("a period with a lesson lists the teachers who teach the subject; one who cannot take it is shown and cannot be picked; a pick is for that period only, and goes with Save", async () => {
    const { calls, user } = openPage(MEENA_ENGLISH(GRID));
    await screen.findByRole("table", { name: "Weekly timetable" });
    await put(user, MON1(), "English");
    // The box stays beside the period and goes on to the teacher: the subject on top, the teachers who teach it under it.
    const group = await teachersOf("English");
    const radios = within(group).getAllByRole("radio");
    expect(radios.map((r) => r.getAttribute("aria-label"))).toEqual(["No teacher", "Meena Singh"]);
    expect(radios[0]).toBeChecked();
    // The others are one click away, with why one of them cannot take the period.
    await user.click(screen.getByRole("button", { name: "Show all teachers (1 more)" }));
    const all = within(await teachersOf("English")).getAllByRole("radio");
    expect(all.map((r) => r.getAttribute("aria-label"))).toEqual(["No teacher", "Meena Singh", "Dev Patel"]);
    expect(all[2]).toBeDisabled();
    expect(all[2]).toHaveTextContent("Dev Patel does not come on Monday");
    await user.click(all[1]);
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(MON1()).toHaveTextContent("Meena Singh");
    expect(TUE1()).toHaveTextContent("no teacher");
    await user.click(screen.getByRole("button", { name: "Save the timetable" }));
    await waitFor(() => expect(puts(calls)).toHaveLength(1));
    const sent = (puts(calls)[0].body as { cells: GridCell[] }).cells;
    expect(sent.find((c) => c.day === 1)!.lessons[0].teacherId).toBe("meena");
    expect(sent.find((c) => c.day === 2)!.lessons[0].teacherId).toBeNull();
  });

  it("only the teachers who teach the subject are listed (and the usual teacher): the school's others are behind Show all teachers, which can be undone", async () => {
    const { user } = openPage(GRID);
    await screen.findByRole("table", { name: "Weekly timetable" });
    await put(user, MON1(), "English");
    // Nobody is set to teach English here: only No teacher, and a word about it.
    expect(within(await teachersOf("English")).getAllByRole("radio").map((r) => r.getAttribute("aria-label"))).toEqual(["No teacher"]);
    expect(screen.getByText("No teacher is set to teach English yet.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Show all teachers (2 more)" }));
    expect(within(await teachersOf("English")).getAllByRole("radio").map((r) => r.getAttribute("aria-label"))).toEqual(["No teacher", "Dev Patel", "Meena Singh"]);
    await user.click(screen.getByRole("button", { name: "Only teachers of English" }));
    expect(within(await teachersOf("English")).getAllByRole("radio")).toHaveLength(1);
  });

  it("the box goes from the subject to its teacher at once: a click on a subject selects it, and the teachers show under it with the subject kept on top", async () => {
    const { user } = openPage(MEENA_ENGLISH(GRID));
    await screen.findByRole("table", { name: "Weekly timetable" });
    await user.click(MON1());
    await user.click(await screen.findByRole("option", { name: "English" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).queryByRole("listbox", { name: "Subjects" })).not.toBeInTheDocument();
    expect(within(dialog).getByText("Subject")).toBeInTheDocument();
    expect(within(dialog).getByText("English")).toBeInTheDocument();
    expect(within(dialog).getByText("Teacher")).toBeInTheDocument();
    // The teacher step has the keys: Escape closes the box from where the focus is.
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(MON1()).toHaveAccessibleName(/ENG$/);
  });

  it("opens with the teacher the period has now, and can go back to no teacher", async () => {
    const { user } = openPage({ ...GRID, exists: true, cells: [{ day: 1, period: 1, lessons: [{ subjectId: "english", teacherId: "meena", room: null }] }] });
    await screen.findByRole("table", { name: "Weekly timetable" });
    await user.click(MON1());
    const group = await teachersOf("English");
    expect(within(group).getByRole("radio", { name: "Meena Singh" })).toBeChecked();
    await user.click(within(group).getByRole("radio", { name: "No teacher" }));
    await waitFor(() => expect(MON1()).toHaveTextContent("no teacher"));
  });

  it("a subject with a usual teacher starts on them", async () => {
    const { user } = openPage({ ...GRID, exists: true, cells: [{ day: 1, period: 1, lessons: [lesson("maths")] }] });
    await screen.findByRole("table", { name: "Weekly timetable" });
    await user.click(MON1());
    const group = await teachersOf("Mathematics");
    expect(within(group).getByRole("radio", { name: "Meena Singh" })).toBeChecked();
    expect(within(group).getByRole("radio", { name: "Meena Singh" })).toHaveTextContent("Usual teacher");
  });

  it("says so when the school has no teacher", async () => {
    const { user } = openPage({ ...GRID, teachers: [], exists: true, cells: [{ day: 1, period: 1, lessons: [lesson("english")] }] });
    await screen.findByRole("table", { name: "Weekly timetable" });
    await user.click(MON1());
    // Said in the toolbar too (with Add a teacher); the box says it where the teachers would be.
    const inBox = await screen.findByRole("dialog", { name: /: choose the subject$/ });
    expect(await within(inBox).findByText("No teacher available in your school")).toBeInTheDocument();
    expect(screen.queryByRole("radiogroup", { name: /^Teacher for / })).not.toBeInTheDocument();
  });

  it("an empty period asks only for the subject", async () => {
    const { user } = openPage();
    await screen.findByRole("table", { name: "Weekly timetable" });
    await user.click(MON1());
    await screen.findByRole("option", { name: "English" });
    expect(screen.queryByRole("radiogroup", { name: /^Teacher for / })).not.toBeInTheDocument();
    expect(screen.queryByText("No teacher available in your school")).not.toBeInTheDocument();
  });

  it("a choice of several subjects keeps its own window for a teacher each", async () => {
    const a = { subjectId: "sanskrit", subjectName: "Sanskrit", subjectCode: null, category: "academic" as const, periodsPerWeek: 3, blockSize: 1, teacherId: null, group: "Third language" };
    const b = { ...a, subjectId: "french", subjectName: "French" };
    const { user } = openPage({ ...GRID, allotments: [...GRID.allotments, a, b], exists: true, cells: [{ day: 1, period: 1, lessons: [lesson("sanskrit"), lesson("french")] }] });
    await screen.findByRole("table", { name: "Weekly timetable" });
    await user.click(MON1());
    expect(await screen.findByRole("button", { name: "Teacher & room" })).toBeInTheDocument();
    expect(screen.queryByRole("radiogroup", { name: /^Teacher for / })).not.toBeInTheDocument();
  });
});

describe("A Pre-Primary class: the mother teacher and a whole day of one subject (2026-11-10)", () => {
  const PP_STRUCTURE: AcademicStructure = { ...STRUCTURE, departments: [{ id: "d0", name: "Pre-Primary", classCount: 1 }], classes: [{ ...STRUCTURE.classes[0], departmentId: "d0" }] };
  const classTeacher = (body: unknown) => {
    const b = body as { classId: string; sectionId: string | null; teacherId: string | null };
    const teacher = b.teacherId ? { id: b.teacherId, name: b.teacherId === "meena" ? "Meena Singh" : "Dev Patel" } : null;
    return { classId: b.classId, sectionId: b.sectionId, label: "Class 5 - A", teacher };
  };
  const openPP = (view: GridView = GRID, extra: Record<string, Handler> = {}) => openPage(view, { "GET /academics/structure": () => PP_STRUCTURE, "PUT /staff/class-teachers": classTeacher, ...extra });
  // The class layout (which says the class is Pre-Primary) is a read of its own: the choice shows once it has come.
  const motherBox = () => screen.findByRole("button", { name: /Mother teacher/ });
  const withMeena = (view: GridView): GridView => ({ ...view, classTeacher: { id: "meena", name: "Meena Singh" } });
  const ctPuts = (calls: Call[]) => calls.filter((c) => c.method === "PUT" && c.path === "/staff/class-teachers");

  it("has a Mother teacher choice", async () => {
    openPP();
    await screen.findByRole("table", { name: "Weekly timetable" });
    expect(await motherBox()).toBeInTheDocument();
  });

  it("a class of another department has no Mother teacher choice and no Whole day in its box", async () => {
    const { calls, user } = openPage();
    await screen.findByRole("table", { name: "Weekly timetable" });
    await waitFor(() => expect(calls.some((c) => c.path === "/academics/structure")).toBe(true));
    await user.click(MON1());
    await screen.findByRole("option", { name: "English" });
    expect(screen.queryByRole("button", { name: /Mother teacher/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("radiogroup", { name: "Put the subject in" })).not.toBeInTheDocument();
  });

  it("choosing her keeps her as the class teacher (one request), puts her on the periods with no teacher, and Save keeps them", async () => {
    const cells = [{ day: 1, period: 1, lessons: [lesson("english")] }, { day: 1, period: 2, lessons: [lesson("maths")] }];
    const { calls, user } = openPP({ ...GRID, exists: true, cells });
    await screen.findByRole("table", { name: "Weekly timetable" });
    await user.click(await motherBox());
    await user.click(await screen.findByRole("option", { name: "Meena Singh" }));
    await waitFor(() => expect(ctPuts(calls)).toHaveLength(1));
    expect(ctPuts(calls)[0].body).toEqual({ classId: "c5", sectionId: "c5-A", teacherId: "meena" });
    await waitFor(() => expect(MON1()).toHaveTextContent("Meena Singh"));
    // Maths keeps its own usual teacher (also Meena here, but not written on the lesson).
    expect(screen.getByText("Not saved")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Save the timetable" }));
    await waitFor(() => expect(puts(calls).filter((c) => c.path === "/timetable/grid")).toHaveLength(1));
    const sent = (puts(calls).find((c) => c.path === "/timetable/grid")!.body as { cells: GridCell[] }).cells;
    expect(sent[0].lessons[0]).toMatchObject({ subjectId: "english", teacherId: "meena" });
    expect(sent[1].lessons[0]).toMatchObject({ subjectId: "maths", teacherId: null });
  });

  it("another teacher in place of the mother teacher who is there already: a window names her and asks first; Cancel keeps her and sends nothing", async () => {
    const cells = [{ day: 1, period: 1, lessons: [{ ...lesson("english"), teacherId: "meena" }] }];
    const { calls, user } = openPP(withMeena({ ...GRID, exists: true, cells }));
    await screen.findByRole("table", { name: "Weekly timetable" });
    await user.click(await motherBox());
    await user.click(await screen.findByRole("option", { name: "Dev Patel" }));
    const ask = await screen.findByRole("dialog", { name: "Class 5 - A already has a mother teacher" });
    expect(ask).toHaveTextContent("Meena Singh is the mother teacher (the class teacher) of Class 5 - A now.");
    expect(ask).toHaveTextContent("Dev Patel becomes the mother teacher instead and Meena Singh no longer is.");
    expect(ctPuts(calls)).toHaveLength(0);

    await user.click(within(ask).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Class 5 - A already has a mother teacher" })).not.toBeInTheDocument());
    expect(ctPuts(calls)).toHaveLength(0);
    expect(await motherBox()).toHaveTextContent("Meena Singh");
    expect(MON1()).toHaveTextContent("Meena Singh");

    await user.click(await motherBox());
    await user.click(await screen.findByRole("option", { name: "Dev Patel" }));
    await user.click(within(await screen.findByRole("dialog", { name: "Class 5 - A already has a mother teacher" })).getByRole("button", { name: "Change mother teacher" }));
    await waitFor(() => expect(ctPuts(calls)).toHaveLength(1));
    expect(ctPuts(calls)[0].body).toEqual({ classId: "c5", sectionId: "c5-A", teacherId: "dev" });
    await waitFor(() => expect(MON1()).toHaveTextContent("Dev Patel"));
  });

  it("taking the mother teacher away (No mother teacher) asks too; a class with none yet is not asked", async () => {
    const { calls, user } = openPP(withMeena(GRID));
    await screen.findByRole("table", { name: "Weekly timetable" });
    await user.click(await motherBox());
    await user.click(await screen.findByRole("option", { name: "No mother teacher" }));
    const ask = await screen.findByRole("dialog", { name: "Take Meena Singh off as mother teacher of Class 5 - A?" });
    expect(ctPuts(calls)).toHaveLength(0);
    await user.click(within(ask).getByRole("button", { name: "Take off" }));
    await waitFor(() => expect(ctPuts(calls)).toHaveLength(1));
    expect(ctPuts(calls)[0].body).toEqual({ classId: "c5", sectionId: "c5-A", teacherId: null });
  });

  it("with a mother teacher, a subject put in (this period, all week) has her on every day it goes on", async () => {
    const { user } = openPP(withMeena(GRID));
    await screen.findByRole("table", { name: "Weekly timetable" });
    // The box says how far the subject goes (the whole day is the usual answer in a Pre-Primary class).
    await user.click(MON1());
    await user.click(within(await screen.findByRole("radiogroup", { name: "Put the subject in" })).getByRole("radio", { name: "This period" }));
    await user.click(await screen.findByRole("option", { name: "English" }));
    for (const d of ["Monday", "Tuesday", "Friday"]) expect(slot(d, 1, "08:30 to 09:10")).toHaveTextContent("Meena Singh");
  });

  it("the box puts a subject in the whole day by default: every period of that day, the other days left as they are", async () => {
    const { user } = openPP(withMeena(GRID));
    await screen.findByRole("table", { name: "Weekly timetable" });
    await user.click(MON1());
    const how = await screen.findByRole("radiogroup", { name: "Put the subject in" });
    expect(within(how).getAllByRole("radio").map((r) => r.textContent)).toEqual(["This period", "Half Monday", "Whole Monday"]);
    expect(within(how).getByRole("radio", { name: "Whole Monday" })).toBeChecked();
    await user.click(within(how).getByRole("radio", { name: "Whole Monday" }));
    await user.click(screen.getByRole("option", { name: "English" }));
    expect(slot("Monday", 1, "08:30 to 09:10")).toHaveAccessibleName(/ENG$/);
    expect(slot("Monday", 8, "13:40 to 14:20")).toHaveAccessibleName(/ENG$/);
    expect(slot("Monday", 8, "13:40 to 14:20")).toHaveTextContent("Meena Singh");
    expect(TUE1()).toHaveAccessibleName(/empty$/);
    expect(screen.getByText("8 of 40 periods have a lesson")).toBeInTheDocument();
  });

  it("a whole day replaces what the day had, even when the period picked already has that subject", async () => {
    const { user } = openPP({ ...GRID, exists: true, cells: [{ day: 1, period: 1, lessons: [lesson("english")] }, { day: 1, period: 2, lessons: [lesson("maths")] }] });
    await screen.findByRole("table", { name: "Weekly timetable" });
    await user.click(MON1());
    await user.click(within(await screen.findByRole("radiogroup", { name: "Put the subject in" })).getByRole("radio", { name: "Whole Monday" }));
    // The period has English, so the box is on its teacher: Change goes to the list.
    await user.click(screen.getByRole("button", { name: "Change" }));
    await user.click(screen.getByRole("option", { name: "English" }));
    expect(MON2()).toHaveAccessibleName(/ENG$/);
  });

  it("the box names the mother teacher first in its list of teachers", async () => {
    const { user } = openPP(withMeena({ ...GRID, exists: true, cells: [{ day: 1, period: 1, lessons: [lesson("english")] }] }));
    await screen.findByRole("table", { name: "Weekly timetable" });
    await user.click(MON1());
    // Meena is the class's mother teacher, so she is listed first whether or not she teaches English; Dev (who does not) is behind Show all teachers.
    const radios = within(await screen.findByRole("radiogroup", { name: "Teacher for English" })).getAllByRole("radio");
    expect(radios.map((r) => r.getAttribute("aria-label"))).toEqual(["No teacher", "Meena Singh"]);
    expect(radios[1]).toHaveTextContent("Mother teacher");
    await user.click(screen.getByRole("button", { name: "Show all teachers (1 more)" }));
    expect(within(await screen.findByRole("radiogroup", { name: "Teacher for English" })).getAllByRole("radio").map((r) => r.getAttribute("aria-label"))).toEqual(["No teacher", "Meena Singh", "Dev Patel"]);
  });

  it("periods left with no teacher (copied from another section, say) are given her in one click", async () => {
    const cells = [{ day: 1, period: 1, lessons: [lesson("english")] }, { day: 2, period: 1, lessons: [lesson("english")] }];
    const { user } = openPP(withMeena({ ...GRID, exists: true, cells }));
    await screen.findByRole("table", { name: "Weekly timetable" });
    await user.click(await screen.findByRole("button", { name: "Put Meena Singh on 2 periods with no teacher" }));
    expect(MON1()).toHaveTextContent("Meena Singh");
    expect(TUE1()).toHaveTextContent("Meena Singh");
    expect(screen.queryByRole("button", { name: /periods? with no teacher/ })).not.toBeInTheDocument();
    expect(screen.getByText("Not saved")).toBeInTheDocument();
  });

  it("says so when the school has no teacher to choose", async () => {
    openPP({ ...GRID, teachers: [] });
    await screen.findByRole("table", { name: "Weekly timetable" });
    expect(await screen.findByText("No teacher available in your school")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Mother teacher/ })).not.toBeInTheDocument();
  });

  it("says why when the mother teacher could not be kept, and changes nothing", async () => {
    const { calls, user } = openPP({ ...GRID, exists: true, cells: [{ day: 1, period: 1, lessons: [lesson("english")] }] }, { "PUT /staff/class-teachers": server(409, "Meena Singh has left the school.") });
    await screen.findByRole("table", { name: "Weekly timetable" });
    await user.click(await motherBox());
    await user.click(await screen.findByRole("option", { name: "Meena Singh" }));
    expect(await screen.findByText("Meena Singh has left the school.")).toBeInTheDocument();
    expect(MON1()).toHaveTextContent("no teacher");
    expect(ctPuts(calls)).toHaveLength(1);
  });
});
