import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Provider } from "react-redux";
import { RouterProvider, createMemoryRouter } from "react-router";
import { ToastProvider } from "../../../components/ui/toast-context";
import { allApiSlices } from "../../../redux/api/apiRoot";
import store from "../../../redux/store";
import { fakeApi, type Call, type Handler } from "../../../test/fakeApi";
import { signInAs, signOut } from "../../../test/session";
import { STRUCTURE } from "../../../test/schoolClass";
import { ALLOTMENT, ART, ENGLISH, GRID, MATHS, MEENA, WEEK } from "../../../test/timetableFixtures";
import type { GridView, Subject } from "../../../types";
import TeacherAssignClassPage from "../TeacherAssignClass";
import TeacherDetailPage from "../TeacherDetail";

/**
 * Assign class with the days and periods (2026-11-13): after a subject is chosen the class's week appears (days across, periods down the
 * line); choosing periods and pressing Assign gives the teacher the subject AND puts its periods in the class's timetable, in one request.
 */
const PHYSICS: Subject = { id: "physics", name: "Physics", code: null, category: "academic", isActive: true, sections: 1 };
// Meena teaches Mathematics and English.
const FULL = { ...MEENA, subjectIds: ["maths", "english"], login: { username: "meena.singh", isActive: true } };
const lesson = (subjectId: string) => ({ subjectId, teacherId: null, room: null });

function openPage(extra: Record<string, Handler> = {}, permissions?: string[]) {
  // The school admin may do everything; a person of another kind has only what the school ticked for them.
  signInAs(permissions ? "receptionist" : "school_admin", permissions);
  const calls = fakeApi({
    [`GET /staff/teachers/${FULL.id}`]: () => FULL,
    [`GET /staff/teachers/${FULL.id}/classes`]: () => ({ classTeacherOf: [], subjects: [] }),
    "GET /subjects": () => ({ items: [MATHS, ENGLISH, ART, PHYSICS] }),
    "GET /academics/structure": () => STRUCTURE,
    "GET /subjects/allotments": () => ALLOTMENT,
    "GET /timetable/grid": () => GRID,
    [`GET /timetable/teachers/${FULL.id}`]: () => WEEK,
    "PUT /subjects/allotments/teacher": () => ALLOTMENT,
    "PUT /timetable/teacher-periods": () => GRID,
    ...extra,
  });
  const router = createMemoryRouter([{ path: "/teachers/:id", element: <TeacherDetailPage /> }, { path: "/teachers/:id/assign-class", element: <TeacherAssignClassPage /> }, { path: "/teachers", element: <p>The teachers</p> }], { initialEntries: [`/teachers/${FULL.id}`] });
  render(
    <Provider store={store}>
      <ToastProvider>
        <RouterProvider router={router} />
      </ToastProvider>
    </Provider>
  );
  return { calls, user: userEvent.setup() };
}

// The days offered start from today (while the class has a period to come) or tomorrow, so the tests say what moment it is: Sunday 8 November 2026,
// early. Class 5 - A has no school on a Sunday, so the seven days are Monday 9 to Sunday 15 November, Monday to Friday free to choose.
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 10, 8, 7, 0));
});

afterEach(() => {
  vi.useRealTimers();
  signOut();
  cleanup();
  for (const api of allApiSlices) store.dispatch(api.util.resetApiState());
  vi.unstubAllGlobals();
});

type U = ReturnType<typeof userEvent.setup>;
const writes = (calls: Call[]) => calls.filter((c) => c.method !== "GET");
const box = (d: HTMLElement, name = /^Subject$/) => within(d).getByRole("combobox", { name });

async function open(user: U) {
  await user.click(await screen.findByRole("button", { name: "Assign class" }));
  // Assign class is a page of its own: its form (with the class's timetable beside it and the buttons under it) is what the tests work in.
  return screen.findByRole("form", { name: "Assign a class to Meena Singh" });
}
async function pickClass(user: U, d: HTMLElement) {
  await user.click(within(d).getByRole("button", { name: /(^|\s)Class$/ }));
  await user.click(await screen.findByRole("option", { name: "Class 5" }));
  await user.click(within(d).getByRole("button", { name: /(^|\s)Section$/ }));
  await user.click(await screen.findByRole("option", { name: "A" }));
}
async function pickSubject(user: U, d: HTMLElement, name: string) {
  await user.click(box(d));
  await user.click(await screen.findByRole("option", { name }));
}
const week = (d: HTMLElement) => within(d).findByRole("table", { name: "Days and periods of Class 5 - A" });
const period = (d: HTMLElement, day: string, p: number) => within(d).getByRole("button", { name: new RegExp(`^${day} period ${p}($|:)`) });

describe("Assign class: the days and periods of the class", () => {
  it("has no days and periods to choose until a subject is chosen; then it shows the class's days and its periods, free to choose", async () => {
    const { calls, user } = openPage();
    const d = await open(user);
    await pickClass(user, d);
    expect(within(d).queryByRole("table", { name: "Days and periods of Class 5 - A" })).not.toBeInTheDocument();
    // The class's week is read as soon as the class is chosen (the panel beside the form shows it), once.
    await screen.findByRole("region", { name: "Timetable of Class 5 - A" });
    expect(calls.filter((c) => c.path === "/timetable/grid")).toHaveLength(1);

    await pickSubject(user, d, "English");
    const table = await week(d);
    // A row for each period (8) under the header with the days.
    expect(within(table).getAllByRole("row")).toHaveLength(9);
    // Seven days (the school's five and two without school), with the Period names first.
    expect(within(table).getAllByRole("columnheader").map((h) => h.textContent?.slice(0, 3))).toEqual(["Per", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]);
    expect(within(table).getByRole("button", { name: "Period 3 on every day" })).toBeInTheDocument();
    expect(period(d, "Monday", 3)).toBeEnabled();
    // Read once for the class, however many subjects are looked at.
    await user.click(box(d));
    await user.click(await screen.findByRole("option", { name: "Mathematics" }));
    expect(calls.filter((c) => c.path === "/timetable/grid")).toHaveLength(1);
  });

  it("choosing periods and pressing Assign gives the subject to the teacher and places its periods in ONE request", async () => {
    const { calls, user } = openPage();
    const d = await open(user);
    await pickClass(user, d);
    await pickSubject(user, d, "English");
    await week(d);
    await user.click(period(d, "Monday", 3));
    await user.click(period(d, "Tuesday", 3));
    expect(within(d).getByText("2 of 5 chosen")).toBeInTheDocument();
    await user.click(within(d).getByRole("button", { name: "Assign" }));
    await waitFor(() => expect(writes(calls)).toHaveLength(1));
    expect(writes(calls)[0]).toMatchObject({ method: "PUT", path: "/timetable/teacher-periods", body: { classId: "c5", sectionId: "c5-A", subjectId: "english", teacherId: "meena", slots: [{ day: 1, period: 3 }, { day: 2, period: 3 }] } });
    expect(await screen.findByText("Meena Singh is given English of Class 5 - A (period 3: Mon, Tue)")).toBeInTheDocument();
  });

  it("choosing no period sends only the subject, as before (the periods can be placed later)", async () => {
    const { calls, user } = openPage();
    const d = await open(user);
    await pickClass(user, d);
    await pickSubject(user, d, "Mathematics");
    await week(d);
    await user.click(within(d).getByRole("button", { name: "Assign" }));
    await waitFor(() => expect(writes(calls)).toHaveLength(1));
    expect(writes(calls)[0].path).toBe("/subjects/allotments/teacher");
  });

  it("the number at the top of a column chooses that period on every free day, and again takes them off", async () => {
    const { user } = openPage();
    const d = await open(user);
    await pickClass(user, d);
    await pickSubject(user, d, "English");
    await week(d);
    await user.click(within(d).getByRole("button", { name: "Period 3 on every day" }));
    expect(within(d).getByText("5 of 5 chosen")).toBeInTheDocument();
    for (const day of ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"]) expect(period(d, day, 3)).toHaveAttribute("aria-pressed", "true");
    await user.click(within(d).getByRole("button", { name: "Period 3 on every day" }));
    expect(within(d).getByText("0 of 5 chosen")).toBeInTheDocument();
  });

  it("no more periods can be chosen than the subject has a week: the rest are greyed out", async () => {
    const { user } = openPage();
    const d = await open(user);
    await pickClass(user, d);
    await pickSubject(user, d, "English");
    await week(d);
    await user.click(within(d).getByRole("button", { name: "Period 1 on every day" }));
    expect(within(d).getByText("5 of 5 chosen")).toBeInTheDocument();
    expect(period(d, "Monday", 2)).toBeDisabled();
    // One taken off, and the rest can be chosen again.
    await user.click(period(d, "Monday", 1));
    expect(period(d, "Monday", 2)).toBeEnabled();
  });

  it("a period the class uses for another subject, one where the teacher is in another class, and a day the teacher does not come cannot be chosen, and say why", async () => {
    const view: GridView = {
      ...GRID,
      cells: [{ day: 1, period: 1, lessons: [lesson("maths")] }],
      busy: [{ day: 2, period: 2, teacherId: "meena", room: null, where: "Class 5 - B", subjectName: "Science" }],
      teachers: GRID.teachers.map((t) => (t.id === "meena" ? { ...t, offDays: [5] } : t)),
    };
    const { user } = openPage({ "GET /timetable/grid": () => view });
    const d = await open(user);
    await pickClass(user, d);
    await pickSubject(user, d, "English");
    await week(d);
    expect(period(d, "Monday", 1)).toBeDisabled();
    expect(period(d, "Monday", 1)).toHaveAccessibleName("Monday period 1: Mathematics");
    expect(period(d, "Tuesday", 2)).toBeDisabled();
    expect(period(d, "Tuesday", 2)).toHaveAccessibleName("Tuesday period 2: Meena Singh is in Class 5 - B (Science)");
    expect(period(d, "Friday", 4)).toBeDisabled();
    expect(period(d, "Friday", 4)).toHaveAccessibleName("Friday period 4: Does not come on Friday");
    expect(period(d, "Wednesday", 1)).toBeEnabled();
  });

  it("each period says what is in it: the subject that is assigned there (the class's own, or the one the teacher teaches in another class), 'Free' when it can be given, never the word Busy", async () => {
    const view: GridView = {
      ...GRID,
      cells: [{ day: 1, period: 1, lessons: [lesson("maths")] }],
      busy: [{ day: 2, period: 2, teacherId: "meena", room: null, where: "Class 5 - B", subjectName: "Science" }],
    };
    const { user } = openPage({ "GET /timetable/grid": () => view });
    const d = await open(user);
    await pickClass(user, d);
    await pickSubject(user, d, "English");
    const table = await week(d);
    expect(period(d, "Monday", 1)).toHaveTextContent("Mat");
    expect(period(d, "Tuesday", 2)).toHaveTextContent("Sci");
    expect(period(d, "Wednesday", 1)).toHaveTextContent("Free");
    expect(within(table).queryByText("Busy")).not.toBeInTheDocument();
    // A period that is chosen shows a tick in place of "Free".
    await user.click(period(d, "Wednesday", 1));
    expect(period(d, "Wednesday", 1)).not.toHaveTextContent("Free");
    expect(period(d, "Wednesday", 1)).toHaveAttribute("aria-pressed", "true");
  });

  it("periods the subject has in the timetable already are shown ticked and stay; the periods left to place are what can be chosen", async () => {
    const view: GridView = { ...GRID, cells: [{ day: 1, period: 1, lessons: [lesson("english")] }, { day: 2, period: 1, lessons: [lesson("english")] }] };
    const { calls, user } = openPage({ "GET /timetable/grid": () => view });
    const d = await open(user);
    await pickClass(user, d);
    await pickSubject(user, d, "English");
    await week(d);
    expect(period(d, "Monday", 1)).toBeDisabled();
    expect(period(d, "Monday", 1)).toHaveAccessibleName("Monday period 1: already in the timetable");
    // English has 5 a week and 2 are in: 3 more can be chosen.
    expect(within(d).getByText("0 of 3 chosen · 2 already in the timetable")).toBeInTheDocument();
    await user.click(period(d, "Wednesday", 1));
    await user.click(within(d).getByRole("button", { name: "Assign" }));
    await waitFor(() => expect(writes(calls)).toHaveLength(1));
    expect(writes(calls)[0].body).toMatchObject({ subjectId: "english", slots: [{ day: 3, period: 1 }] });
  });

  it("a subject the class does not study yet: the periods a week can be left empty (the chosen periods are them) or typed (they are the most that can be chosen)", async () => {
    const { calls, user } = openPage();
    const d = await open(user);
    await pickClass(user, d);
    await user.type(box(d), "PHYSICS");
    await user.click(await screen.findByRole("option", { name: "Use “Physics”" }));
    await week(d);
    await user.click(period(d, "Monday", 2));
    await user.click(period(d, "Wednesday", 2));
    await user.click(within(d).getByRole("button", { name: "Assign" }));
    await waitFor(() => expect(writes(calls)).toHaveLength(1));
    expect(writes(calls)[0]).toMatchObject({ path: "/timetable/teacher-periods", body: { subjectId: "physics", slots: [{ day: 1, period: 2 }, { day: 3, period: 2 }] } });
    expect(writes(calls)[0].body).not.toHaveProperty("periodsPerWeek");
  });

  it("typed periods a week are sent with a new subject and cap the choice", async () => {
    const { calls, user } = openPage();
    const d = await open(user);
    await pickClass(user, d);
    await user.type(box(d), "PHYSICS");
    await user.click(await screen.findByRole("option", { name: "Use “Physics”" }));
    await week(d);
    await user.type(within(d).getByLabelText(/^Periods a week/), "2");
    await user.click(period(d, "Monday", 2));
    await user.click(period(d, "Tuesday", 2));
    expect(within(d).getByText("2 of 2 chosen")).toBeInTheDocument();
    expect(period(d, "Wednesday", 2)).toBeDisabled();
    await user.click(within(d).getByRole("button", { name: "Assign" }));
    await waitFor(() => expect(writes(calls)).toHaveLength(1));
    expect(writes(calls)[0].body).toMatchObject({ subjectId: "physics", periodsPerWeek: 2, slots: [{ day: 1, period: 2 }, { day: 2, period: 2 }] });
  });

  it("when the server refuses, the window stays open with the reason and the choice is kept", async () => {
    const refused = () => new Response(JSON.stringify({ success: false, message: "Meena Singh is teaching Class 5 - B (Science) at the same time", code: "TIMETABLE_CLASHES" }), { status: 409, headers: { "Content-Type": "application/json" } });
    const { user } = openPage({ "PUT /timetable/teacher-periods": refused });
    const d = await open(user);
    await pickClass(user, d);
    await pickSubject(user, d, "English");
    await week(d);
    await user.click(period(d, "Monday", 3));
    await user.click(within(d).getByRole("button", { name: "Assign" }));
    expect(await within(d).findByText("Meena Singh is teaching Class 5 - B (Science) at the same time")).toBeInTheDocument();
    expect(period(d, "Monday", 3)).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByText(/is given English/)).not.toBeInTheDocument();
  });

  it("a person who may not change the timetable gets no days and periods (and the class's week is never read)", async () => {
    const { calls, user } = openPage({}, ["teachers.view", "teachers.edit"]);
    const d = await open(user);
    await pickClass(user, d);
    await pickSubject(user, d, "English");
    expect(within(d).queryByRole("table")).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: /^Timetable of/ })).not.toBeInTheDocument();
    expect(calls.some((c) => c.path === "/timetable/grid")).toBe(false);
    await user.click(within(d).getByRole("button", { name: "Assign" }));
    await waitFor(() => expect(writes(calls)).toHaveLength(1));
    expect(writes(calls)[0].path).toBe("/subjects/allotments/teacher");
  });

  it("a person who may only SEE timetables gets the class's timetable beside the form, but no days and periods to choose", async () => {
    const { user } = openPage({}, ["teachers.view", "teachers.edit", "timetable.view"]);
    const d = await open(user);
    await pickClass(user, d);
    await pickSubject(user, d, "English");
    expect(await screen.findByRole("region", { name: "Timetable of Class 5 - A" })).toBeInTheDocument();
    expect(within(d).queryByRole("table", { name: "Days and periods of Class 5 - A" })).not.toBeInTheDocument();
  });

  it("when the class's week cannot be read the panel is left out and the form still works", async () => {
    const { calls, user } = openPage({ "GET /timetable/grid": () => new Response(JSON.stringify({ success: false, message: "Could not load" }), { status: 500, headers: { "Content-Type": "application/json" } }) });
    const d = await open(user);
    await pickClass(user, d);
    await pickSubject(user, d, "Mathematics");
    await waitFor(() => expect(screen.queryByRole("region", { name: /^Timetable of/ })).not.toBeInTheDocument());
    expect(within(d).queryByRole("table")).not.toBeInTheDocument();
    await user.click(within(d).getByRole("button", { name: "Assign" }));
    await waitFor(() => expect(writes(calls)).toHaveLength(1));
    expect(writes(calls)[0].path).toBe("/subjects/allotments/teacher");
  });

  it("beside the form, the class's timetable as it is now: who teaches what, and each period with its subject and its teacher", async () => {
    const view: GridView = { ...GRID, status: "published", cells: [{ day: 1, period: 1, lessons: [lesson("maths")] }, { day: 2, period: 2, lessons: [{ subjectId: "english", teacherId: "dev", room: null }] }], classTeacher: { id: "meena", name: "Meena Singh" } };
    const { user } = openPage({ "GET /timetable/grid": () => view });
    const d = await open(user);
    await pickClass(user, d);
    const panel = await screen.findByRole("region", { name: "Timetable of Class 5 - A" });
    expect(within(panel).getByText("Published")).toBeInTheDocument();
    // Who teaches what: Meena (class teacher) has Mathematics, Dev covers English, and English has nobody in the class's list.
    const who = within(panel).getByRole("list", { name: "Teachers of Class 5 - A" });
    expect(within(who).getByText("Meena Singh")).toBeInTheDocument();
    expect(within(who).getByText("Class teacher")).toBeInTheDocument();
    expect(within(who).getByText("Mathematics")).toBeInTheDocument();
    expect(within(who).getByText("Dev Patel")).toBeInTheDocument();
    expect(within(who).getByText("No teacher yet:")).toBeInTheDocument();
    // The week: a lesson with the teacher the class's list gives it, and one with the teacher it names.
    const table = within(panel).getByRole("table", { name: "Timetable now of Class 5 - A" });
    expect(within(table).getByTitle("Monday period 1: Mathematics (Meena Singh)")).toHaveTextContent("Math");
    expect(within(table).getByTitle("Monday period 1: Mathematics (Meena Singh)")).toHaveTextContent("Meena");
    expect(within(table).getByTitle("Tuesday period 2: English (Dev Patel)")).toHaveTextContent("Dev");
    expect(within(table).getByTitle("Monday period 3: empty")).toBeInTheDocument();
  });

  it("the periods being chosen show in the class's timetable, dashed, with the subject and the teacher; taking them off takes them out", async () => {
    const { user } = openPage();
    const d = await open(user);
    await pickClass(user, d);
    await pickSubject(user, d, "English");
    await week(d);
    const panel = await screen.findByRole("region", { name: "Timetable of Class 5 - A" });
    expect(within(panel).queryByTitle(/to be added/)).not.toBeInTheDocument();
    await user.click(period(d, "Wednesday", 3));
    const coming = within(panel).getByTitle("Wednesday period 3: English with Meena Singh (to be added)");
    expect(coming).toHaveTextContent("+ Eng");
    expect(coming).toHaveTextContent("Meena");
    await user.click(period(d, "Wednesday", 3));
    expect(within(panel).queryByTitle(/to be added/)).not.toBeInTheDocument();
  });

  it("each period row says its number and its hours (a class has its own timing, so period 1 is not the same hour everywhere)", async () => {
    // Class 5 - A starts its day at 13:45, as a class with a timing of its own can.
    const late: GridView = { ...GRID, days: GRID.days.map((d) => ({ ...d, slots: d.slots.map((s) => (s.period === 1 ? { ...s, start: "13:45", end: "14:25" } : s)) })) };
    const { user } = openPage({ "GET /timetable/grid": () => late });
    const d = await open(user);
    await pickClass(user, d);
    await pickSubject(user, d, "English");
    const table = await week(d);
    expect(within(table).getByRole("button", { name: "Period 1 on every day" })).toHaveTextContent("Period 1");
    expect(within(table).getByRole("button", { name: "Period 1 on every day" })).toHaveTextContent("13:45 – 14:25");
    expect(within(table).getByRole("button", { name: "Period 2 on every day" })).toHaveTextContent("09:10 – 09:50");
    // The cell says its own time too.
    expect(period(d, "Monday", 1)).toHaveAttribute("title", "Monday period 1 (13:45–14:25)");
    // The class's timetable beside the form has the same times.
    const panelTable = within(await screen.findByRole("region", { name: "Timetable of Class 5 - A" })).getByRole("table", { name: "Timetable now of Class 5 - A" });
    expect(within(panelTable).getAllByRole("rowheader")[0]).toHaveTextContent("Period 1");
    expect(within(panelTable).getAllByRole("rowheader")[0]).toHaveTextContent("13:45 – 14:25");
  });

  async function openWeek(user: U) {
    const d = await open(user);
    await pickClass(user, d);
    await pickSubject(user, d, "English");
    return { d, table: await week(d) };
  }
  const heads = (table: HTMLElement) => within(table).getAllByRole("columnheader").slice(1);

  it("shows seven days with their dates, in the order of the calendar; the days the class has no school say so", async () => {
    const { user } = openPage();
    const { d, table } = await openWeek(user);
    expect(heads(table).map((h) => h.textContent)).toEqual(["Mon 9 Nov", "Tue 10 Nov", "Wed 11 Nov", "Thu 12 Nov", "Fri 13 Nov", "Sat 14 Nov No school", "Sun 15 Nov No school"]);
    expect(within(d).getByText("From tomorrow, Mon 9 Nov (today's school is over) · then every week")).toBeInTheDocument();
    // A day without school has nothing to choose.
    expect(within(table).queryByRole("button", { name: /^Saturday period/ })).not.toBeInTheDocument();
    // The class's timetable beside the form shows the same seven days.
    const panelTable = within(await screen.findByRole("region", { name: "Timetable of Class 5 - A" })).getByRole("table", { name: "Timetable now of Class 5 - A" });
    expect(within(panelTable).getAllByRole("columnheader")[1]).toHaveTextContent("Mon 9 Nov");
    expect(within(panelTable).getAllByRole("columnheader")[6]).toHaveTextContent("Sat 14 Nov No school");
  });

  it("once the school day is over the days start tomorrow: at 10:48 PM on the 13th the first day is the 14th, nothing of the 13th can be given", async () => {
    vi.setSystemTime(new Date(2026, 10, 13, 22, 48)); // Friday evening
    const { user } = openPage();
    const { d, table } = await openWeek(user);
    expect(heads(table).map((h) => h.textContent)).toEqual(["Sat 14 Nov No school", "Sun 15 Nov No school", "Mon 16 Nov", "Tue 17 Nov", "Wed 18 Nov", "Thu 19 Nov", "Fri 20 Nov"]);
    expect(heads(table).some((h) => h.hasAttribute("aria-current"))).toBe(false);
    expect(within(d).getByText("From tomorrow, Sat 14 Nov (today's school is over) · then every week")).toBeInTheDocument();
    // Friday here is the 20th, a whole day: every period of it is free.
    expect(period(d, "Friday", 1)).toBeEnabled();
    expect(within(table).queryByText("Over")).not.toBeInTheDocument();
  });

  it("while the class still has a period to come today the days start today: the periods already over say Over and cannot be chosen", async () => {
    vi.setSystemTime(new Date(2026, 10, 13, 10, 0)); // Friday 10:00: periods 1 and 2 are over, period 3 (09:50 – 10:30) is on
    const { user } = openPage();
    const { d, table } = await openWeek(user);
    expect(heads(table).map((h) => h.textContent)).toEqual(["Fri 13 Nov", "Sat 14 Nov No school", "Sun 15 Nov No school", "Mon 16 Nov", "Tue 17 Nov", "Wed 18 Nov", "Thu 19 Nov"]);
    expect(heads(table)[0]).toHaveAttribute("aria-current", "date");
    expect(within(d).getByText("From today, Fri 13 Nov · then every week")).toBeInTheDocument();
    expect(period(d, "Friday", 1)).toBeDisabled();
    expect(period(d, "Friday", 1)).toHaveAccessibleName("Friday period 1: already over today");
    expect(period(d, "Friday", 1)).toHaveTextContent("Over");
    expect(period(d, "Friday", 2)).toBeDisabled();
    expect(period(d, "Friday", 3)).toBeEnabled();
    expect(period(d, "Friday", 4)).toBeEnabled();
    // Monday is the 16th: nothing of it is over.
    expect(period(d, "Monday", 1)).toBeEnabled();
    // "Period 1 on every day" takes the days it can be given: Monday to Thursday, not today's.
    const user2 = userEvent.setup();
    await user2.click(within(table).getByRole("button", { name: "Period 1 on every day" }));
    expect(within(d).getByText("4 of 5 chosen")).toBeInTheDocument();
    expect(period(d, "Friday", 1)).toHaveAttribute("aria-pressed", "false");
  });

  it("says where the teacher already teaches, day by day and hour by hour (a class at another hour is no clash)", async () => {
    vi.setSystemTime(new Date(2026, 10, 13, 10, 0)); // Friday: the days start today, so Monday is the 16th
    const { calls, user } = openPage();
    const d = await open(user);
    await pickClass(user, d);
    const panel = await screen.findByRole("region", { name: "Where Meena Singh teaches now" });
    const lines = within(within(panel).getByRole("list", { name: "Lessons of Meena Singh" })).getAllByRole("listitem");
    expect(lines.map((li) => li.textContent)).toEqual(["Mon 16 Nov Period 1 08:30 – 09:10 Class 5 - A · Mathematics", "Mon 16 Nov Period 4 11:00 – 11:40 Class 5 - B · Mathematics"]);
    // One read of the teacher's week.
    expect(calls.filter((c) => c.path === "/timetable/teachers/meena")).toHaveLength(1);
  });

  it("a teacher with no lesson yet says so", async () => {
    const empty = { ...WEEK, lessons: [], perDay: {}, week: 0 };
    const first = openPage({ [`GET /timetable/teachers/${FULL.id}`]: () => empty });
    const d = await open(first.user);
    await pickClass(first.user, d);
    expect(await screen.findByText("Meena Singh has no lesson in any timetable yet.")).toBeInTheDocument();
  });

  it("the chosen periods are said with the period's number and hours, the days with the date each comes first, and that it then repeats every week", async () => {
    vi.setSystemTime(new Date(2026, 10, 13, 22, 48)); // school is over: the days start tomorrow, Saturday 14
    const { user } = openPage();
    const d = await open(user);
    await pickClass(user, d);
    await pickSubject(user, d, "English");
    await week(d);
    expect(within(d).queryByRole("list", { name: "Chosen periods" })).not.toBeInTheDocument();
    await user.click(period(d, "Monday", 3));
    await user.click(period(d, "Tuesday", 3));
    await user.click(period(d, "Friday", 5));
    const chosen = within(d).getByRole("list", { name: "Chosen periods" });
    expect(within(chosen).getAllByRole("listitem").map((li) => li.textContent)).toEqual(["Period 3 · 09:50 – 10:30 · Mon 16 Nov, Tue 17 Nov, then every week", "Period 5 · 11:40 – 12:20 · Fri 20 Nov, then every week"]);
  });

  it("changing the subject or the class starts the choice again", async () => {
    const { user } = openPage();
    const d = await open(user);
    await pickClass(user, d);
    await pickSubject(user, d, "English");
    await week(d);
    await user.click(period(d, "Monday", 3));
    expect(within(d).getByText("1 of 5 chosen")).toBeInTheDocument();
    await user.click(box(d));
    await user.click(await screen.findByRole("option", { name: "Mathematics" }));
    expect(within(d).getByText("0 of 6 chosen")).toBeInTheDocument();
  });
});
