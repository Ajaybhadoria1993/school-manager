import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Provider } from "react-redux";
import { RouterProvider, createMemoryRouter } from "react-router";
import { ToastProvider } from "../../../components/ui/toast-context";
import { allApiSlices } from "../../../redux/api/apiRoot";
import store from "../../../redux/store";
import { fakeApi, type Call, type Handler } from "../../../test/fakeApi";
import { signInAs, signOut } from "../../../test/session";
import { ALLOTMENT, DEV, ENGLISH, GRID, MATHS, MEENA, OVERVIEW } from "../../../test/timetableFixtures";
import type { AcademicStructure, GridCell, GridView } from "../../../types";
import ClassTimetablesPage from "../ClassTimetables";

/**
 * Class timetables, 2026-11-13 (user, with the Pre-Primary class UKG - A open): a small class has one thing a day, or two, so the box of a
 * period in a Pre-Primary class says how far a picked subject goes (this period all week / half a day / the whole day, the whole day first; the
 * toolbar does NOT repeat it), and for every class the box that picks the subject goes on to the teachers of the school (it used to close, and
 * the period had to be clicked again). **Add a teacher** is a button in the header of the class, between Print and Save the timetable (2026-11-14: Save is
 * the one button at the top and publishes a draft; the box lists the teachers who teach the subject, the school's others behind Show all teachers).
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
const PP_STRUCTURE: AcademicStructure = { ...STRUCTURE, departments: [{ id: "d0", name: "Pre-Primary", classCount: 1 }], classes: [{ ...STRUCTURE.classes[0], departmentId: "d0" }] };

const saved = (view: GridView) => (body: unknown): GridView => {
  const cells = (body as { cells: GridCell[] }).cells;
  return { ...view, exists: true, cells, updatedAt: "2026-10-31T10:00:00.000Z", issues: [], stats: { ...view.stats, filled: cells.length, free: view.stats.total - cells.length } };
};

function openPage(view: GridView = GRID, extra: Record<string, Handler> = {}, structure: AcademicStructure = STRUCTURE) {
  // The school's admin: Add a teacher is offered to whoever may add one.
  signInAs("school_admin");
  const calls = fakeApi({
    "GET /timetable/overview": () => OVERVIEW,
    "GET /timetable/grid": () => view,
    "GET /academics/structure": () => structure,
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
      { path: "/teachers/new", element: <p>Add a teacher page</p> },
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
const openPP = (view: GridView = GRID) => openPage(view, {}, PP_STRUCTURE);
// Meena teaches Mathematics and English (the box lists the teachers who teach the subject); Dev teaches nothing yet.
const MEENA_ENGLISH = (view: GridView): GridView => ({ ...view, teachers: view.teachers.map((t) => (t.id === "meena" ? { ...t, subjectIds: ["maths", "english"] } : t)) });

afterEach(() => {
  cleanup();
  signOut();
  for (const api of allApiSlices) store.dispatch(api.util.resetApiState());
  vi.unstubAllGlobals();
});

type User = ReturnType<typeof userEvent.setup>;
const slot = (day: string, period: number, times: string) => screen.getByRole("button", { name: new RegExp(`^${day}, Period ${period}, ${times}:`) });
const MON1 = () => slot("Monday", 1, "08:30 to 09:10");
/** Opens a tab over the class's week (2026-11-23, the reference picture: Class Timetable / Class Settings). */
async function classTab(name: "Class Timetable" | "Class Settings") {
  const tab = await screen.findByRole("tab", { name });
  if (tab.getAttribute("aria-selected") !== "true") fireEvent.click(tab);
}
const MON3 = () => slot("Monday", 3, "09:50 to 10:30");
const MON4 = () => slot("Monday", 4, "11:00 to 11:40");
const MON5 = () => slot("Monday", 5, "11:40 to 12:20");
const MON8 = () => slot("Monday", 8, "13:40 to 14:20");
const TUE1 = () => slot("Tuesday", 1, "08:30 to 09:10");
/** A period that has a lesson opens on its teacher (the box has two steps): Change goes to the list of subjects. */
const subjectsOf = async (user: User, period: HTMLElement) => {
  await user.click(period);
  const dialog = await screen.findByRole("dialog");
  const change = within(dialog).queryByRole("button", { name: "Change" });
  if (change) await user.click(change);
  await screen.findAllByRole("option");
};
const put = async (user: User, period: HTMLElement, name: string) => {
  await subjectsOf(user, period);
  await user.click(await screen.findByRole("option", { name }));
};
const ready = () => screen.findByRole("table", { name: "Weekly timetable" });
/** The box's choice of how far a picked subject goes (a Pre-Primary class only). */
const howFar = () => screen.findByRole("radiogroup", { name: "Put the subject in" });
/** Clicks a period, says in its box how far the subject goes, then picks the subject. */
async function putHow(user: User, period: HTMLElement, how: string, name: string) {
  await user.click(period);
  await user.click(within(await howFar()).getByRole("radio", { name: how }));
  const change = within(screen.getByRole("dialog")).queryByRole("button", { name: "Change" });
  if (change) await user.click(change);
  await user.click(await screen.findByRole("option", { name }));
}

describe("A Pre-Primary class: how far a picked subject goes (in the box of the period)", () => {
  it("the box has the three choices, the whole day is the one picked, and the toolbar does not repeat them", async () => {
    const { user } = openPP();
    await ready();
    await user.click(MON1());
    const how = await howFar();
    expect(within(how).getAllByRole("radio").map((r) => r.textContent)).toEqual(["This period", "Half Monday", "Whole Monday"]);
    expect(within(how).getByRole("radio", { name: "Whole Monday" })).toBeChecked();
    expect(screen.queryByRole("radiogroup", { name: "When a subject is picked" })).not.toBeInTheDocument();
  });

  it("a class of another department has none, neither in the box nor in the toolbar", async () => {
    const { calls, user } = openPage();
    await ready();
    await waitFor(() => expect(calls.some((c) => c.path === "/academics/structure")).toBe(true));
    await user.click(MON1());
    await screen.findByRole("option", { name: "English" });
    expect(screen.queryByRole("radiogroup", { name: "Put the subject in" })).not.toBeInTheDocument();
    expect(screen.queryByRole("radiogroup", { name: "When a subject is picked" })).not.toBeInTheDocument();
  });

  it("a subject picked goes in the whole day, and no other day", async () => {
    const { user } = openPP();
    await ready();
    await put(user, MON1(), "English");
    expect(MON1()).toHaveAccessibleName(/ENG$/);
    expect(MON4()).toHaveAccessibleName(/ENG$/);
    expect(MON8()).toHaveAccessibleName(/ENG$/);
    expect(TUE1()).toHaveAccessibleName(/empty$/);
  });

  it("half a day: the periods before the lunch, then another subject for the periods after it (two things in a day)", async () => {
    const { user } = openPP();
    await ready();
    await putHow(user, MON1(), "Half Monday", "English");
    expect(MON1()).toHaveAccessibleName(/ENG$/);
    expect(MON3()).toHaveAccessibleName(/ENG$/);
    expect(MON4()).toHaveAccessibleName(/empty$/);
    // The choice stays for the next period: no need to say it again.
    await put(user, MON5(), "Mathematics");
    expect(MON4()).toHaveAccessibleName(/Mathematics$/);
    expect(MON8()).toHaveAccessibleName(/Mathematics$/);
    expect(MON3()).toHaveAccessibleName(/ENG$/);
    expect(TUE1()).toHaveAccessibleName(/empty$/);
  });

  it("this period is the old way: that period of every day", async () => {
    const { user } = openPP();
    await ready();
    await putHow(user, MON1(), "This period", "English");
    expect(TUE1()).toHaveAccessibleName(/ENG$/);
    expect(MON4()).toHaveAccessibleName(/empty$/);
  });
});

describe("The teachers of the school, in the box that picks the subject", () => {
  const teacherBox = (subject: string) => screen.findByRole("radiogroup", { name: `Teacher for ${subject}` });

  it("choosing a subject does not close the box: the teachers who teach it are there, and picking one closes it and names them on the period", async () => {
    const { user } = openPage(MEENA_ENGLISH(GRID));
    await ready();
    await put(user, MON1(), "English");
    const teachers = await teacherBox("English");
    // Meena teaches English; Dev does not (he is one click away, Show all teachers, with why he cannot take Mondays).
    expect(within(teachers).getAllByRole("radio").map((r) => r.getAttribute("aria-label"))).toEqual(["No teacher", "Meena Singh"]);
    await user.click(screen.getByRole("button", { name: "Show all teachers (1 more)" }));
    expect(within(await teacherBox("English")).getAllByRole("radio").map((r) => r.getAttribute("aria-label")).sort()).toEqual(["Dev Patel", "Meena Singh", "No teacher"]);
    await user.click(within(await teacherBox("English")).getByRole("radio", { name: "Meena Singh" }));
    expect(MON1()).toHaveTextContent("Meena Singh");
    await waitFor(() => expect(screen.queryByRole("dialog", { name: /: choose the subject$/ })).not.toBeInTheDocument());
  });

  it("another period clicked while the box is open goes on to that period (one click each)", async () => {
    const { user } = openPage();
    await ready();
    await put(user, MON1(), "English");
    await teacherBox("English");
    await put(user, slot("Monday", 2, "09:10 to 09:50"), "Mathematics");
    expect(slot("Monday", 2, "09:10 to 09:50")).toHaveAccessibleName(/Mathematics$/);
    expect(await screen.findByRole("dialog", { name: "Monday, Period 2: choose the subject" })).toBeInTheDocument();
  });

  it("in a class that puts a subject on that period of every day, the teacher chosen is for that period only", async () => {
    const { user } = openPage(MEENA_ENGLISH(GRID));
    await ready();
    await put(user, MON1(), "English");
    await user.click(within(await teacherBox("English")).getByRole("radio", { name: "Meena Singh" }));
    expect(MON1()).toHaveTextContent("Meena Singh");
    expect(TUE1()).toHaveTextContent("no teacher");
  });

  it("with no teacher in the school the box only says so (the way to add one is the button in the header)", async () => {
    const { user } = openPage({ ...GRID, teachers: [] });
    await ready();
    await put(user, MON1(), "English");
    const box = await screen.findByRole("dialog", { name: /: choose the subject$/ });
    expect(await within(box).findByText("No teacher available in your school")).toBeInTheDocument();
    expect(within(box).queryByRole("link")).not.toBeInTheDocument();
  });

  it("the box keeps its parts apart: the list of subjects does not shrink to nothing, the teachers and the buttons under them are not squeezed or overlapped", async () => {
    const { user } = openPage(MEENA_ENGLISH(GRID));
    await ready();
    await user.click(MON1());
    // The subject step: the list has room to be seen and scrolls on its own when it is long.
    const list = await screen.findByRole("listbox", { name: "Subjects" });
    expect(list.className).toContain("min-h-");
    expect(list.className).toContain("max-h-64");
    await user.click(screen.getByRole("option", { name: "English" }));
    // The teacher step: the teachers' part never shrinks into the buttons below it, and the whole box scrolls when the screen is too short.
    const teachers = await teacherBox("English");
    const box = await screen.findByRole("dialog", { name: /: choose the subject$/ });
    expect(box.className).toContain("overflow-y-auto");
    expect(teachers.parentElement?.className).toContain("shrink-0");
  });

  it("in a Pre-Primary class the teacher chosen is for the whole day of that subject", async () => {
    const { user } = openPP(MEENA_ENGLISH(GRID));
    await ready();
    await put(user, MON1(), "English");
    await user.click(within(await teacherBox("English")).getByRole("radio", { name: "Meena Singh" }));
    expect(MON1()).toHaveTextContent("Meena Singh");
    expect(MON4()).toHaveTextContent("Meena Singh");
    expect(MON8()).toHaveTextContent("Meena Singh");
    expect(TUE1()).toHaveAccessibleName(/empty$/);
  });

  it("in a half day the teacher is for that half only, so the other half can have another", async () => {
    const { user } = openPP(MEENA_ENGLISH(GRID));
    await ready();
    await putHow(user, MON1(), "Half Monday", "English");
    await user.click(within(await teacherBox("English")).getByRole("radio", { name: "Meena Singh" }));
    await put(user, MON5(), "Mathematics");
    expect(MON1()).toHaveTextContent("Meena Singh");
    expect(MON3()).toHaveTextContent("Meena Singh");
    // Mathematics has its own usual teacher (Meena too in this fixture); the point is that the first half's teacher was not written on the second.
    expect(MON4()).toHaveAccessibleName(/Mathematics$/);
  });
});

/** 2026-11-23, the reference picture: the class in a card on top, then the tabs Class Timetable / Class Settings. */
describe("The class's tabs: the week, its subjects and teachers, its settings", () => {
  it("the week's tab has Fill and Save under the week; Periods & time and the class teacher are on Class Settings; Print, Add a teacher and Take back to a draft are not there", async () => {
    const { user } = openPage();
    await ready();
    expect(screen.getByRole("button", { name: "Save the timetable" }).parentElement).toContainElement(screen.getByRole("button", { name: "Fill the empty periods" }));
    for (const name of ["Periods & time", "Add class teacher"]) expect(screen.queryByRole("button", { name })).not.toBeInTheDocument();
    for (const name of ["Print", "Take back to a draft"]) expect(screen.queryByRole("button", { name })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Add a teacher" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("tab", { name: "Class Settings" }));
    for (const name of ["Periods & time", "Add class teacher"]) expect(await screen.findByRole("button", { name })).toBeInTheDocument();
    expect(screen.queryByRole("table", { name: "Weekly timetable" })).not.toBeInTheDocument();
  });

  it("the class is named once, in the card on top, with its year and figures of its week", async () => {
    openPage();
    await ready();
    expect(screen.getAllByRole("heading", { name: "Class 5 - A" })).toHaveLength(1);
    const card = screen.getByRole("region", { name: "The class" });
    expect(within(card).getByRole("heading", { name: "Class 5 - A", level: 2 })).toBeInTheDocument();
    expect(card).toHaveTextContent("Total periods40");
    expect(card).toHaveTextContent("School time08:30 – 14:20");
    expect(card).toHaveTextContent("Class time08:30 – 14:20");
  });

  // 2026-11-23: the line over the week was taken away; its count is the first card's line, as the week is changed.
  it("the count of periods is the first card's line and follows the lessons put in; the note about teachers and Not saved are under the week", async () => {
    const { user } = openPage({ ...GRID, teachers: [] });
    await ready();
    const card = screen.getByRole("region", { name: "The class" });
    expect(await within(card).findByText("0 filled · 40 empty")).toBeInTheDocument();
    const save = screen.getByRole("button", { name: "Save the timetable" });
    expect(screen.getByText("No teacher available in your school")).toBeInTheDocument();
    expect(screen.queryByText("Not saved")).not.toBeInTheDocument();
    await put(user, MON1(), "English");
    expect(await within(card).findByText("5 filled · 35 empty")).toBeInTheDocument();
    expect(save.parentElement).toContainElement(await screen.findByText("Not saved"));
  });

  it("another tab keeps the changes not saved yet: nothing is asked, and they are there on coming back", async () => {
    const { user } = openPage();
    await ready();
    await put(user, MON1(), "English");
    await user.click(screen.getByRole("tab", { name: "Class Settings" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await user.click(screen.getByRole("tab", { name: "Class Timetable" }));
    expect(await screen.findByText("Not saved")).toBeInTheDocument();
    expect(MON1()).toHaveAccessibleName(/: ENG$/);
  });

  it("Save and Empty the whole week are under the week, side by side", async () => {
    const { user } = openPage();
    await ready();
    await put(user, MON1(), "English");
    const table = screen.getByRole("table", { name: "Weekly timetable" });
    const save = screen.getByRole("button", { name: "Save the timetable" });
    const empty = await screen.findByRole("button", { name: "Empty the whole week" });
    expect(table.compareDocumentPosition(save) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(table.compareDocumentPosition(empty) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(save.parentElement).toContainElement(empty);
  });

  // 2026-11-23, user: "Subjects this week hata do"; the Subjects card on top counts the subjects of the week on screen instead (it read 0 while three were in the grid).
  it("has no Subjects this week; the Subjects card counts the subjects of the week on screen, the ones put in before Save too", async () => {
    const { user } = openPage({ ...GRID, allotments: [] });
    await ready();
    expect(screen.queryByRole("list", { name: "Subjects this week" })).not.toBeInTheDocument();
    expect(screen.queryByText("Subjects this week")).not.toBeInTheDocument();
    const card = screen.getByRole("region", { name: "The class" });
    expect(await within(card).findByText("None set yet")).toBeInTheDocument();
    await put(user, MON1(), "English");
    await waitFor(() => expect(card).toHaveTextContent(/Subjects1/));
  });
});

describe("The class teacher, in the toolbar in place of Add a teacher (2026-11-17)", () => {
  const TWO = { "GET /staff/teachers": () => ({ items: [MEENA, DEV] }) };
  const answer = (body: unknown) => {
    const b = body as { classId: string; sectionId: string | null; teacherId: string };
    return { classId: b.classId, sectionId: b.sectionId, label: "Class 5 - A", teacher: { id: b.teacherId, name: b.teacherId === "meena" ? "Meena Singh" : "Dev Patel" } };
  };
  const ctPuts = (calls: Call[]) => calls.filter((c) => c.method === "PUT" && c.path === "/staff/class-teachers");
  const withMeena = (view: GridView): GridView => ({ ...view, classTeacher: { id: "meena", name: "Meena Singh" } });
  const open = (view: GridView = GRID, structure: AcademicStructure = STRUCTURE) => openPage(view, { ...TWO, "PUT /staff/class-teachers": answer }, structure);

  it("a class with no class teacher has the button Add class teacher, and one with a class teacher says who", async () => {
    open();
    await ready();
    await classTab("Class Settings");
    expect(await screen.findByRole("button", { name: "Add class teacher" })).toBeInTheDocument();
    cleanup();
    for (const api of allApiSlices) store.dispatch(api.util.resetApiState());
    open(withMeena(GRID));
    await ready();
    await classTab("Class Settings");
    expect(await screen.findByRole("button", { name: "Class teacher: Meena Singh" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add class teacher" })).not.toBeInTheDocument();
  });

  it("choosing a teacher where there is none keeps them at once (one request), and the button says who", async () => {
    const { calls, user } = open();
    await ready();
    await classTab("Class Settings");
    await user.click(await screen.findByRole("button", { name: "Add class teacher" }));
    await user.click(await screen.findByRole("option", { name: "Meena Singh" }));
    await waitFor(() => expect(ctPuts(calls)).toHaveLength(1));
    expect(ctPuts(calls)[0].body).toEqual({ classId: "c5", sectionId: "c5-A", teacherId: "meena" });
    expect(await screen.findByRole("button", { name: "Class teacher: Meena Singh" })).toBeInTheDocument();
  });

  it("changing the class teacher opens a window that asks first: Cancel sends nothing; Make class teacher sends it, and the button says the new one", async () => {
    const { calls, user } = open(withMeena(GRID));
    await ready();
    await classTab("Class Settings");
    await user.click(await screen.findByRole("button", { name: "Class teacher: Meena Singh" }));
    await user.click(await screen.findByRole("option", { name: "Dev Patel" }));
    const ask = await screen.findByRole("dialog", { name: "Make Dev Patel the class teacher of Class 5 - A?" });
    expect(ask).toHaveTextContent("Meena Singh will no longer be.");
    expect(ctPuts(calls)).toHaveLength(0);
    await user.click(within(ask).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Make Dev Patel the class teacher of Class 5 - A?" })).not.toBeInTheDocument());
    expect(ctPuts(calls)).toHaveLength(0);
    expect(screen.getByRole("button", { name: "Class teacher: Meena Singh" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Class teacher: Meena Singh" }));
    await user.click(await screen.findByRole("option", { name: "Dev Patel" }));
    await user.click(within(await screen.findByRole("dialog", { name: "Make Dev Patel the class teacher of Class 5 - A?" })).getByRole("button", { name: "Make class teacher" }));
    await waitFor(() => expect(ctPuts(calls)).toHaveLength(1));
    expect(ctPuts(calls)[0].body).toEqual({ classId: "c5", sectionId: "c5-A", teacherId: "dev" });
    expect(await screen.findByRole("button", { name: "Class teacher: Dev Patel" })).toBeInTheDocument();
  });

  it("No class teacher: asks first, sends no teacher for the class, and the button says Add class teacher again; the lessons not saved yet stay", async () => {
    const { calls, user } = open(withMeena(GRID));
    await ready();
    await put(user, MON1(), "English");
    await classTab("Class Settings");
    await user.click(await screen.findByRole("button", { name: "Class teacher: Meena Singh" }));
    await user.click(await screen.findByRole("button", { name: "No class teacher" }));
    const ask = await screen.findByRole("dialog", { name: "Take Meena Singh off as the class teacher of Class 5 - A?" });
    expect(ask).toHaveTextContent("Class 5 - A will have no class teacher until you choose one.");
    expect(ctPuts(calls)).toHaveLength(0);
    await user.click(within(ask).getByRole("button", { name: "Take off" }));
    await waitFor(() => expect(ctPuts(calls)).toHaveLength(1));
    expect(ctPuts(calls)[0].body).toEqual({ classId: "c5", sectionId: "c5-A", teacherId: null });
    expect(await screen.findByRole("button", { name: "Add class teacher" })).toBeInTheDocument();
    await classTab("Class Timetable");
    expect(MON1()).toHaveAccessibleName(/: ENG$/);
    expect(screen.getByText("Not saved")).toBeInTheDocument();
    expect(calls.filter((c) => c.method === "GET" && c.path === "/timetable/grid")).toHaveLength(1);
  });

  it("changing the class teacher keeps the lessons that are not saved yet, and does not read the week again", async () => {
    const { calls, user } = open();
    await ready();
    await put(user, MON1(), "English");
    expect(await screen.findByText("Not saved")).toBeInTheDocument();
    await classTab("Class Settings");
    await user.click(await screen.findByRole("button", { name: "Add class teacher" }));
    await user.click(await screen.findByRole("option", { name: "Meena Singh" }));
    expect(await screen.findByRole("button", { name: "Class teacher: Meena Singh" })).toBeInTheDocument();
    // The lesson is still there (a period shows the subject's short name).
    await classTab("Class Timetable");
    expect(MON1()).toHaveAccessibleName(/: ENG$/);
    expect(screen.getByText("Not saved")).toBeInTheDocument();
    expect(calls.filter((c) => c.method === "GET" && c.path === "/timetable/grid")).toHaveLength(1);
  });

  it("a Pre-Primary class has no Mother teacher box: the Class teacher button is the one, and a change in it puts the new class teacher on the periods with no teacher", async () => {
    const cells: GridCell[] = [{ day: 1, period: 1, lessons: [{ subjectId: "english", teacherId: null, room: null }] }];
    const { user } = open(withMeena({ ...GRID, exists: true, cells }), PP_STRUCTURE);
    await ready();
    expect(screen.queryByRole("button", { name: /Mother teacher/ })).not.toBeInTheDocument();
    await classTab("Class Settings");
    await user.click(await screen.findByRole("button", { name: "Class teacher: Meena Singh" }));
    await user.click(await screen.findByRole("option", { name: "Dev Patel" }));
    await user.click(within(await screen.findByRole("dialog", { name: "Make Dev Patel the class teacher of Class 5 - A?" })).getByRole("button", { name: "Make class teacher" }));
    // The week changed (the new class teacher is on the periods with no teacher): it is shown at once.
    await waitFor(() => expect(MON1()).toHaveTextContent("Dev Patel"));
    await classTab("Class Settings");
    expect(await screen.findByRole("button", { name: "Class teacher: Dev Patel" })).toBeInTheDocument();
  });

  it("with no teacher in the school the toolbar still says so, and there is no Add a teacher link in it", async () => {
    open({ ...GRID, teachers: [] }, PP_STRUCTURE);
    await ready();
    expect(await screen.findByText("No teacher available in your school")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Add a teacher" })).not.toBeInTheDocument();
  });
});
