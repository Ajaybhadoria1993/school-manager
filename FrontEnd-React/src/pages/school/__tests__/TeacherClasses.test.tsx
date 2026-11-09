import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Provider } from "react-redux";
import { RouterProvider, createMemoryRouter } from "react-router";
import { ToastProvider } from "../../../components/ui/toast-context";
import { allApiSlices } from "../../../redux/api/apiRoot";
import store from "../../../redux/store";
import { fakeApi, type Call, type Handler } from "../../../test/fakeApi";
import { STRUCTURE } from "../../../test/schoolClass";
import { ALLOTMENT, ART, DEV, ENGLISH, MATHS, MEENA } from "../../../test/timetableFixtures";
import type { Teacher } from "../../../types";
import TeacherDetailPage from "../TeacherDetail";

/** A teacher's page opened from Teacher (the menu entry on top): the classes they are given, and their username. */

const FULL: Teacher = { ...MEENA, login: { username: "meena.singh", isActive: true }, classTeacherOf: ["Class 5 - A"] };

const year = { id: "y1", name: "2026-2027" };
const CLASSES = {
  classTeacherOf: [{ classId: "c5", sectionId: "c5-A", label: "Class 5 - A", academicYear: year }],
  subjects: [
    { classId: "c5", sectionId: "c5-A", label: "Class 5 - A", academicYear: year, subjectId: "maths", subjectName: "Mathematics", periodsPerWeek: 6 },
    { classId: "c5", sectionId: "c5-B", label: "Class 5 - B", academicYear: year, subjectId: "english", subjectName: "English", periodsPerWeek: 5 },
  ],
};

function openPage(teacher: Teacher, extra: Record<string, Handler> = {}) {
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
const assignWindow = async (user: U) => {
  await user.click(await screen.findByRole("button", { name: "Assign class" }));
  return screen.findByRole("dialog", { name: "Assign a class to Meena Singh" });
};

describe("A teacher opened from Teacher", () => {
  it("keeps its links under Teacher", async () => {
    openPage(FULL);
    await screen.findByRole("heading", { name: "Meena Singh" });
    expect(screen.getByRole("link", { name: "Teacher" })).toHaveAttribute("href", "/teachers");
    expect(screen.getByRole("link", { name: "Change" })).toHaveAttribute("href", "/teachers/meena/edit");
  });

  it("shows the classes they are the class teacher of and the subjects they teach", async () => {
    openPage(FULL);
    const classes = await screen.findByRole("region", { name: "Classes" });
    expect(await within(classes).findByText("Class 5 - B · English · 5 periods a week")).toBeInTheDocument();
    expect(within(classes).getByText("Class 5 - A · Mathematics · 6 periods a week")).toBeInTheDocument();
    expect(within(classes).getByRole("listitem", { name: "Class teacher of Class 5 - A" })).toBeInTheDocument();
  });

  it("takes a subject away from them in one click (the subject stays with the class)", async () => {
    const { calls, user } = openPage(FULL);
    await user.click(await screen.findByRole("button", { name: "Take English of Class 5 - B away from Meena Singh" }));
    await waitFor(() => expect(writes(calls)).toHaveLength(1));
    expect(writes(calls)[0]).toMatchObject({ method: "PUT", path: "/subjects/allotments/teacher", body: { classId: "c5", sectionId: "c5-B", subjectId: "english", teacherId: null } });
  });

  it("stops them being the class teacher in one click", async () => {
    const { calls, user } = openPage(FULL);
    await user.click(await screen.findByRole("button", { name: "Meena Singh is no longer the class teacher of Class 5 - A" }));
    await waitFor(() => expect(writes(calls)).toHaveLength(1));
    expect(writes(calls)[0]).toMatchObject({ method: "PUT", path: "/staff/class-teachers", body: { classId: "c5", sectionId: "c5-A", teacherId: null } });
  });

  it("assigns a subject of a class from Assign class", async () => {
    const { calls, user } = openPage(FULL);
    const d = await assignWindow(user);
    await choose(user, d, "Class", "Class 5");
    await choose(user, d, "Section", "A");
    await choose(user, d, "Subject", "Mathematics");
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
    await choose(user, d, "Subject", "Art & Craft");
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
    await choose(user, d, "Subject", "Mathematics");
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
