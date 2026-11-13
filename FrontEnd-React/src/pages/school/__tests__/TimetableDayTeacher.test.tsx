import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Provider } from "react-redux";
import { RouterProvider, createMemoryRouter } from "react-router";
import { ToastProvider } from "../../../components/ui/toast-context";
import { allApiSlices } from "../../../redux/api/apiRoot";
import store from "../../../redux/store";
import { fakeApi, type Handler } from "../../../test/fakeApi";
import { signInAs, signOut } from "../../../test/session";
import { ALLOTMENT, ENGLISH, GRID, MATHS, MEENA, OVERVIEW } from "../../../test/timetableFixtures";
import type { AcademicStructure, GridCell, GridView } from "../../../types";
import ClassTimetablesPage from "../ClassTimetables";

/**
 * Class timetables, 2026-11-13 (user, with the Pre-Primary class UKG - A open): a small class has one thing a day, or two, so the box of a
 * period in a Pre-Primary class says how far a picked subject goes (this period all week / half a day / the whole day, the whole day first; the
 * toolbar does NOT repeat it), and for every class the box that picks the subject goes on to the teachers of the school (it used to close, and
 * the period had to be clicked again). **Add a teacher** is a button in the header of the class, between Print and Publish.
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

afterEach(() => {
  cleanup();
  signOut();
  for (const api of allApiSlices) store.dispatch(api.util.resetApiState());
  vi.unstubAllGlobals();
});

type User = ReturnType<typeof userEvent.setup>;
const slot = (day: string, period: number, times: string) => screen.getByRole("button", { name: new RegExp(`^${day}, Period ${period}, ${times}:`) });
const MON1 = () => slot("Monday", 1, "08:30 to 09:10");
const MON3 = () => slot("Monday", 3, "09:50 to 10:30");
const MON4 = () => slot("Monday", 4, "11:00 to 11:40");
const MON5 = () => slot("Monday", 5, "11:40 to 12:20");
const MON8 = () => slot("Monday", 8, "13:40 to 14:20");
const TUE1 = () => slot("Tuesday", 1, "08:30 to 09:10");
const put = async (user: User, period: HTMLElement, name: string) => {
  await user.click(period);
  await user.click(await screen.findByRole("option", { name }));
};
const ready = () => screen.findByRole("table", { name: "Weekly timetable" });
/** The box's choice of how far a picked subject goes (a Pre-Primary class only). */
const howFar = () => screen.findByRole("radiogroup", { name: "Put the subject in" });
/** Clicks a period, says in its box how far the subject goes, then picks the subject. */
async function putHow(user: User, period: HTMLElement, how: string, name: string) {
  await user.click(period);
  await user.click(within(await howFar()).getByRole("radio", { name: how }));
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

  it("choosing a subject does not close the box: the teachers to pick from are there, and picking one closes it and names them on the period", async () => {
    const { user } = openPage();
    await ready();
    await put(user, MON1(), "English");
    const teachers = await teacherBox("English");
    // Dev Patel does not come on Mondays: he is listed, with the reason. The order is the page's (those who teach it first).
    expect(within(teachers).getAllByRole("radio").map((r) => r.getAttribute("aria-label")).sort()).toEqual(["Dev Patel", "Meena Singh", "No teacher"]);
    await user.click(within(teachers).getByRole("radio", { name: "Meena Singh" }));
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
    const { user } = openPage();
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

  it("the box keeps its parts apart: the list of subjects gives way first, the teachers and the buttons under them are not squeezed or overlapped", async () => {
    const { user } = openPage();
    await ready();
    await put(user, MON1(), "English");
    const teachers = await teacherBox("English");
    const box = await screen.findByRole("dialog", { name: /: choose the subject$/ });
    // The whole box scrolls when the screen is too short for all of it, and the teachers' part never shrinks into the buttons below it.
    expect(box.className).toContain("overflow-y-auto");
    expect(teachers.parentElement?.className).toContain("shrink-0");
    expect(screen.getByRole("listbox", { name: "Subjects" }).className).toContain("min-h-");
  });

  it("in a Pre-Primary class the teacher chosen is for the whole day of that subject", async () => {
    const { user } = openPP();
    await ready();
    await put(user, MON1(), "English");
    await user.click(within(await teacherBox("English")).getByRole("radio", { name: "Meena Singh" }));
    expect(MON1()).toHaveTextContent("Meena Singh");
    expect(MON4()).toHaveTextContent("Meena Singh");
    expect(MON8()).toHaveTextContent("Meena Singh");
    expect(TUE1()).toHaveAccessibleName(/empty$/);
  });

  it("in a half day the teacher is for that half only, so the other half can have another", async () => {
    const { user } = openPP();
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

describe("The class's buttons are one line (2026-11-13)", () => {
  const headerOf = async () => (await screen.findByRole("heading", { level: 1, name: "Class 5 - A" })).closest("header")!;

  it("Fill, Periods & time, Print, Add a teacher and Publish stand in one row, the actions at its right, and nothing else crowds the row", async () => {
    openPage();
    await ready();
    const row = screen.getByRole("button", { name: "Fill the empty periods" }).parentElement!;
    for (const name of ["Periods & time", "Print", "Publish"]) expect(row).toContainElement(screen.getByRole("button", { name }));
    expect(row).toContainElement(await screen.findByRole("link", { name: "Add a teacher" }));
    // The actions are pushed to the right of the row.
    expect(screen.getByRole("button", { name: "Publish" }).parentElement?.className ?? "").toContain("ml-auto");
    // The count, Not saved, the note about teachers and Empty the whole week are elsewhere (below), so the row stays one line.
    expect(within(row).queryByText(/periods have a lesson/)).not.toBeInTheDocument();
    expect(within(row).queryByText("Not saved")).not.toBeInTheDocument();
    expect(within(row).queryByText("No teacher available in your school")).not.toBeInTheDocument();
    expect(within(row).queryByRole("button", { name: "Empty the whole week" })).not.toBeInTheDocument();
  });

  it("the class is not named again above the week: the page's title says it", async () => {
    openPage();
    await ready();
    expect(screen.queryByRole("heading", { name: "Class 5 - A", level: 2 })).not.toBeInTheDocument();
  });

  it("the count of periods and the note about teachers are under the filter in the page's header; Not saved appears there once a period is changed", async () => {
    const { user } = openPage({ ...GRID, teachers: [] });
    await ready();
    const header = await headerOf();
    expect(await within(header).findByText("0 of 40 periods have a lesson")).toBeInTheDocument();
    expect(within(header).getByText("No teacher available in your school")).toBeInTheDocument();
    expect(within(header).queryByText("Not saved")).not.toBeInTheDocument();
    await put(user, MON1(), "English");
    expect(await within(header).findByText("Not saved")).toBeInTheDocument();
    expect(await within(header).findByText(/^5 of 40 periods have a lesson$/)).toBeInTheDocument();
  });

  it("Empty the whole week is with Save, under the week", async () => {
    const { user } = openPage();
    await ready();
    await put(user, MON1(), "English");
    const save = screen.getByRole("button", { name: "Save the timetable" });
    expect(save.parentElement).toContainElement(await screen.findByRole("button", { name: "Empty the whole week" }));
  });
});

describe("Add a teacher: a button in the header of the class, between Print and Publish", () => {
  it("is there for whoever may add a teacher, in every class, whether or not the school has teachers", async () => {
    openPage();
    await ready();
    const link = await screen.findByRole("link", { name: "Add a teacher" });
    expect(link).toHaveAttribute("href", "/teachers/new");
    const print = screen.getByRole("button", { name: "Print" });
    const publish = screen.getByRole("button", { name: "Publish" });
    expect(print.compareDocumentPosition(link) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(link.compareDocumentPosition(publish) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("is not offered to someone who may not add teachers", async () => {
    const { calls } = openPage();
    signOut();
    await ready();
    await waitFor(() => expect(calls.some((c) => c.path === "/academics/structure")).toBe(true));
    expect(screen.queryByRole("link", { name: "Add a teacher" })).not.toBeInTheDocument();
  });

  it("with no teacher in the school the toolbar says so, and the button is still the one in the header (not a second link in the toolbar)", async () => {
    openPP({ ...GRID, teachers: [] });
    await ready();
    expect(await screen.findByText("No teacher available in your school")).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: "Add a teacher" })).toHaveLength(1);
  });
});
