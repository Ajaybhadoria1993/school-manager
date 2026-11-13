import { afterEach, describe, expect, it, vi } from "vitest";
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
import { ALLOTMENT, ART, DEV, ENGLISH, MATHS, MEENA } from "../../../test/timetableFixtures";
import type { Teacher } from "../../../types";
import TeacherAssignClassPage from "../TeacherAssignClass";
import TeacherDetailPage from "../TeacherDetail";

/** A teacher's page opened from Teacher (the menu entry on top): the classes they are given, and their username. */

const FULL: Teacher = { ...MEENA, login: { username: "meena.singh", isActive: true }, classTeacherOf: ["Class 5 - A"] };

const year = { id: "y1", name: "2026-2027" };
const CLASSES = {
  classTeacherOf: [{ classId: "c5", sectionId: "c5-A", label: "Class 5 - A", academicYear: year }],
  subjects: [
    { classId: "c5", sectionId: "c5-A", label: "Class 5 - A", academicYear: year, subjectId: "maths", subjectName: "Mathematics", periodsPerWeek: 6, placedPeriods: 4 },
    { classId: "c5", sectionId: "c5-B", label: "Class 5 - B", academicYear: year, subjectId: "english", subjectName: "English", periodsPerWeek: 5, placedPeriods: 5 },
  ],
};

function openPage(teacher: Teacher, extra: Record<string, Handler> = {}) {
  // The school admin: the page asks who is looking (what the school allowed them).
  signInAs("school_admin");
  const calls = fakeApi({
    [`GET /staff/teachers/${teacher.id}`]: () => teacher,
    [`GET /staff/teachers/${teacher.id}/classes`]: () => CLASSES,
    "GET /staff/teachers": () => ({ items: [teacher, DEV] }),
    "GET /subjects": () => ({ items: [MATHS, ENGLISH, ART] }),
    "GET /academics/structure": () => STRUCTURE,
    "GET /subjects/allotments": () => ALLOTMENT,
    "PUT /subjects/allotments/teacher": () => ALLOTMENT,
    "PUT /staff/class-teachers": (body) => ({ ...(body as object), label: "Class 5", teacher: null }),
    "GET /staff/usernames/check": () => ({ available: true, suggestions: [] }),
    ...extra,
  });
  const router = createMemoryRouter(
    [
      { path: "/teachers/:id", element: <TeacherDetailPage /> },
      { path: "/teachers/:id/assign-class", element: <TeacherAssignClassPage /> },
      { path: "/teachers/:id/edit", element: <p>Change a teacher</p> },
      { path: "/teachers", element: <p>The teachers</p> },
      { path: "/school/timetable/teacher/:teacherId", element: <p>The week</p> },
    ],
    { initialEntries: [`/teachers/${teacher.id}`] }
  );
  render(
    <Provider store={store}>
      <ToastProvider>
        <RouterProvider router={router} />
      </ToastProvider>
    </Provider>
  );
  return { calls, user: userEvent.setup(), router };
}

afterEach(() => {
  signOut();
  cleanup();
  for (const api of allApiSlices) store.dispatch(api.util.resetApiState());
  vi.unstubAllGlobals();
});

const writes = (calls: Call[]) => calls.filter((c) => c.method !== "GET");
const server = (status: number, message: string, code?: string, details?: object[]) => () =>
  new Response(JSON.stringify({ success: false, message, code, details }), { status, headers: { "Content-Type": "application/json" } });

type U = ReturnType<typeof userEvent.setup>;
/** Opens a dropdown of the window (named by its label) and picks a row. */
async function choose(user: U, scope: HTMLElement, label: string, option: string) {
  await user.click(within(scope).getByRole("button", { name: new RegExp(`(^|\\s)${label}$`) }));
  await user.click(await screen.findByRole("option", { name: option }));
}
/** Opens the searchable Subject box of the window and picks a row of its list. */
async function pickSubject(user: U, scope: HTMLElement, option: string, box = /^Subject$/) {
  await user.click(within(scope).getByRole("combobox", { name: box }));
  await user.click(await screen.findByRole("option", { name: option }));
}
const assignWindow = async (user: U) => {
  await user.click(await screen.findByRole("button", { name: "Assign class" }));
  // Assign class is a page of its own: its form is what the tests work in.
  return screen.findByRole("form", { name: "Assign a class to Meena Singh" });
};

describe("A teacher opened from Teacher", () => {
  it("keeps its links under Teacher", async () => {
    openPage(FULL);
    await screen.findByRole("heading", { name: "Meena Singh" });
    expect(screen.getByRole("link", { name: "Teacher" })).toHaveAttribute("href", "/teachers");
    expect(screen.getByRole("link", { name: "Change" })).toHaveAttribute("href", "/teachers/meena/edit");
  });

  it("shows the classes class by class: its subjects with their periods and how many are placed in the timetable, the class teacher post, the way to the timetable", async () => {
    openPage(FULL);
    const region = await screen.findByRole("region", { name: "Classes" });
    const a = await within(region).findByRole("listitem", { name: "Class teacher of Class 5 - A" });
    expect(within(a).getByText("Mathematics")).toBeInTheDocument();
    expect(within(a).getByText("6 periods a week")).toBeInTheDocument();
    expect(within(a).getByText("4 of 6 in timetable")).toBeInTheDocument();
    expect(within(a).getByText("Class teacher")).toBeInTheDocument();
    // 2 of its periods have no lesson yet: a plain line says what that means and leads to the class's timetable (no second link in the header).
    expect(within(a).getByText("2 periods are not in the timetable yet, so they are not in Meena Singh's week.")).toBeInTheDocument();
    expect(within(a).getByRole("link", { name: "Put in timetable" })).toHaveAttribute("href", "/school/timetable/class/c5/c5-A");
    expect(within(a).queryByRole("link", { name: "Open timetable" })).not.toBeInTheDocument();
    const b = within(region).getByRole("listitem", { name: "Class 5 - B" });
    expect(within(b).getByText("English")).toBeInTheDocument();
    expect(within(b).getByText("All 5 in timetable")).toBeInTheDocument();
    expect(within(b).queryByText("Class teacher")).not.toBeInTheDocument();
    // Everything is in: no warning, only the way to the timetable.
    expect(within(b).queryByText(/not in the timetable yet/)).not.toBeInTheDocument();
    expect(within(b).queryByRole("link", { name: "Put in timetable" })).not.toBeInTheDocument();
    expect(within(b).getByRole("link", { name: "Open timetable" })).toHaveAttribute("href", "/school/timetable/class/c5/c5-B");
  });

  it("the way to take a subject away is a button with a word on it, not a bare cross", async () => {
    openPage(FULL);
    const b = await within(await screen.findByRole("region", { name: "Classes" })).findByRole("listitem", { name: "Class 5 - B" });
    expect(within(b).getByRole("button", { name: "Take English of Class 5 - B away from Meena Singh" })).toHaveTextContent("Remove");
  });

  it("says when none of a subject's periods is in the timetable yet", async () => {
    openPage(FULL, { "GET /staff/teachers/meena/classes": () => ({ classTeacherOf: [], subjects: [{ ...CLASSES.subjects[0], placedPeriods: 0 }] }) });
    const region = await screen.findByRole("region", { name: "Classes" });
    expect(await within(region).findByText("Not in timetable yet")).toBeInTheDocument();
    expect(within(region).getByText("6 periods are not in the timetable yet, so they are not in Meena Singh's week.")).toBeInTheDocument();
  });

  it("one period alone is said in the singular", async () => {
    openPage(FULL, { "GET /staff/teachers/meena/classes": () => ({ classTeacherOf: [], subjects: [{ ...CLASSES.subjects[0], periodsPerWeek: 5, placedPeriods: 4 }] }) });
    const region = await screen.findByRole("region", { name: "Classes" });
    expect(await within(region).findByText("1 period is not in the timetable yet, so it is not in Meena Singh's week.")).toBeInTheDocument();
  });

  it("asks first before a subject is taken away: the window says what happens, Cancel changes nothing, the cross alone sends nothing", async () => {
    const { calls, user } = openPage(FULL);
    await user.click(await screen.findByRole("button", { name: "Take English of Class 5 - B away from Meena Singh" }));
    const ask = await screen.findByRole("dialog", { name: "Take English of Class 5 - B away from Meena Singh?" });
    expect(ask).toHaveTextContent("English stays with Class 5 - B, but it will have no teacher.");
    expect(ask).toHaveTextContent("Its 5 periods already placed in the class's timetable stay there, with no teacher");
    expect(writes(calls)).toHaveLength(0);
    await user.click(within(ask).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: /away from Meena Singh/ })).not.toBeInTheDocument());
    expect(writes(calls)).toHaveLength(0);

    await user.click(screen.getByRole("button", { name: "Take English of Class 5 - B away from Meena Singh" }));
    await user.click(within(await screen.findByRole("dialog", { name: /away from Meena Singh/ })).getByRole("button", { name: "Take away" }));
    await waitFor(() => expect(writes(calls)).toHaveLength(1));
    expect(writes(calls)[0]).toMatchObject({ method: "PUT", path: "/subjects/allotments/teacher", body: { classId: "c5", sectionId: "c5-B", subjectId: "english", teacherId: null } });
    expect(await screen.findByText("English of Class 5 - B has no teacher now")).toBeInTheDocument();
  });

  it("asks first before they stop being the class teacher, and says the reason when the server refuses", async () => {
    const { calls, user } = openPage(FULL, { "PUT /staff/class-teachers": () => new Response(JSON.stringify({ success: false, message: "Could not save the class teacher" }), { status: 500, headers: { "Content-Type": "application/json" } }) });
    await user.click(await screen.findByRole("button", { name: "Meena Singh is no longer the class teacher of Class 5 - A" }));
    const ask = await screen.findByRole("dialog", { name: "Remove Meena Singh as class teacher of Class 5 - A?" });
    expect(ask).toHaveTextContent("Class 5 - A will have no class teacher until you choose one.");
    expect(writes(calls)).toHaveLength(0);
    await user.click(within(ask).getByRole("button", { name: "Remove" }));
    await waitFor(() => expect(writes(calls)).toHaveLength(1));
    expect(writes(calls)[0]).toMatchObject({ method: "PUT", path: "/staff/class-teachers", body: { classId: "c5", sectionId: "c5-A", teacherId: null } });
    // The window stays open with the reason, for another try.
    expect(await within(ask).findByText("Could not save the class teacher")).toBeInTheDocument();
  });

  it("assigns a subject of a class from Assign class", async () => {
    const { calls, user } = openPage(FULL);
    const d = await assignWindow(user);
    await choose(user, d, "Class", "Class 5");
    await choose(user, d, "Section", "A");
    await pickSubject(user, d, "Mathematics");
    expect(within(d).queryByLabelText(/^Periods a week/)).not.toBeInTheDocument();
    await user.click(within(d).getByRole("button", { name: "Assign" }));
    await waitFor(() => expect(writes(calls)).toHaveLength(1));
    expect(writes(calls)[0]).toMatchObject({ path: "/subjects/allotments/teacher", body: { classId: "c5", sectionId: "c5-A", subjectId: "maths", teacherId: "meena" } });
  });

  it("asks the periods a week of a subject the class does not study yet", async () => {
    const { calls, user } = openPage(FULL);
    const d = await assignWindow(user);
    await choose(user, d, "Class", "Class 5");
    await choose(user, d, "Section", "A");
    // Art & Craft is the school's, not Class 5 - A's: it is under Other subject.
    await pickSubject(user, d, "Other subject…");
    await pickSubject(user, d, "Art & Craft", /^Other subject$/);
    await user.type(within(d).getByLabelText(/^Periods a week/), "2");
    await user.click(within(d).getByRole("button", { name: "Assign" }));
    await waitFor(() => expect(writes(calls)).toHaveLength(1));
    expect(writes(calls)[0].body).toEqual({ classId: "c5", sectionId: "c5-A", subjectId: "art", teacherId: "meena", periodsPerWeek: 2 });
  });

  it("makes them the class teacher from the same window, of a class without sections too", async () => {
    const { calls, user } = openPage(FULL);
    const d = await assignWindow(user);
    await choose(user, d, "Class", "Class 1");
    expect(within(d).queryByRole("button", { name: /(^|\s)Section$/ })).not.toBeInTheDocument();
    await user.click(within(d).getByRole("checkbox", { name: "Class teacher of Class 1" }));
    await user.click(within(d).getByRole("button", { name: "Assign" }));
    await waitFor(() => expect(writes(calls)).toHaveLength(1));
    expect(writes(calls)[0]).toMatchObject({ path: "/staff/class-teachers", body: { classId: "c1", sectionId: null, teacherId: "meena" } });
  });

  it("says what is missing when nothing is chosen, and the server's reason when it refuses", async () => {
    const message = "Meena Singh is teaching Class 5 - B (Mathematics) at the same time";
    const { calls, user } = openPage(FULL, { "PUT /subjects/allotments/teacher": server(409, message, "TIMETABLE_CLASHES") });
    const d = await assignWindow(user);
    await user.click(within(d).getByRole("button", { name: "Assign" }));
    expect(await within(d).findByText("Choose a class")).toBeInTheDocument();
    await choose(user, d, "Class", "Class 5");
    await choose(user, d, "Section", "A");
    await user.click(within(d).getByRole("button", { name: "Assign" }));
    expect(await within(d).findByText("Choose a subject, or make them the class teacher")).toBeInTheDocument();
    expect(writes(calls)).toHaveLength(0);
    await pickSubject(user, d, "Mathematics");
    await user.click(within(d).getByRole("button", { name: "Assign" }));
    expect(await within(d).findByText(message)).toBeInTheDocument();
  });

  it("changes the username, checked free while it is typed", async () => {
    const { calls, user } = openPage(FULL, {
      "PATCH /staff/teachers/meena/login": (body) => ({ ...FULL, login: { username: (body as { username: string }).username, isActive: true } }),
    });
    await user.click(await screen.findByRole("button", { name: "Change username" }));
    const d = await screen.findByRole("dialog", { name: "Change the username of Meena Singh" });
    const box = within(d).getByLabelText(/^Username/);
    expect(box).toHaveValue("meena.singh");
    await user.clear(box);
    await user.type(box, "meena.s");
    expect(await within(d).findByText("Available")).toBeInTheDocument();
    await user.click(within(d).getByRole("button", { name: "Save username" }));
    await waitFor(() => expect(writes(calls)).toHaveLength(1));
    expect(writes(calls)[0]).toMatchObject({ method: "PATCH", path: "/staff/teachers/meena/login", body: { username: "meena.s" } });
  });

  it("will not save a username that is taken, and offers free ones", async () => {
    const { calls, user } = openPage(FULL, { "GET /staff/usernames/check": () => ({ available: false, suggestions: ["meena.s_41", "meena.s_73"] }) });
    await user.click(await screen.findByRole("button", { name: "Change username" }));
    const d = await screen.findByRole("dialog", { name: "Change the username of Meena Singh" });
    await user.clear(within(d).getByLabelText(/^Username/));
    await user.type(within(d).getByLabelText(/^Username/), "meena.s");
    expect(await within(d).findByText("This username is taken. Try another")).toBeInTheDocument();
    await user.click(within(d).getByRole("button", { name: "Save username" }));
    expect(writes(calls)).toHaveLength(0);
    await user.click(within(d).getByRole("button", { name: "meena.s_41" }));
    expect(within(d).getByLabelText(/^Username/)).toHaveValue("meena.s_41");
  });
});
