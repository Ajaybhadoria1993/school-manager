import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Provider } from "react-redux";
import { RouterProvider, createMemoryRouter } from "react-router";
import { ToastProvider } from "../../../components/ui/toast-context";
import { allApiSlices } from "../../../redux/api/apiRoot";
import store from "../../../redux/store";
import { fakeApi, type Call, type Handler } from "../../../test/fakeApi";
import { CLASSES, STRUCTURE, classOverviewFor, studentsFor } from "../../../test/schoolClass";
import { ALLOTMENT, ART, DEV, ENGLISH, GRID, MATHS, MEENA } from "../../../test/timetableFixtures";
import type { ClassOverview } from "../../../types";
import SchoolClassDetailPage from "../SchoolClassDetail";
import SchoolClassTimetablePage from "../SchoolClassTimetable";

/**
 * The teachers of a class. Its School Class page names the class teacher at the top (N/A when there is none); its Timetable & teachers page
 * gives the section a class teacher and each subject a teacher, from the teachers' list (2026-11-04: the box moved there from the class page).
 */

// Section A of Class 5 has Meena Singh as its class teacher; Class 1 (no sections) has none.
const WITH_HEAD: ClassOverview[] = CLASSES.map((c) =>
  c.id === "c5" ? { ...c, sections: c.sections.map((s) => (s.id === "c5-A" ? { ...s, classTeacher: { id: "meena", name: "Meena Singh" } } : s)) } : c
);

function openPage(path: string, extra: Record<string, Handler> = {}) {
  const calls = fakeApi({
    "GET /academics/structure": () => STRUCTURE,
    "GET /students/class-overview": (_body, query) => classOverviewFor(query, WITH_HEAD),
    "GET /students": (_body, query) => studentsFor(query),
    "GET /subjects/allotments": (_body, query) => (query.get("sectionId") === "c5-A" ? ALLOTMENT : { ...ALLOTMENT, rows: [] }),
    "GET /timetable/grid": () => GRID,
    "GET /staff/teachers": () => ({ items: [MEENA, DEV] }),
    "GET /subjects": () => ({ items: [MATHS, ENGLISH, ART] }),
    "PUT /staff/class-teachers": (body) => ({ ...(body as object), label: "Class 5 - A", teacher: { id: "dev", name: "Dev Patel" } }),
    "PUT /subjects/allotments/teacher": () => ALLOTMENT,
    ...extra,
  });
  const router = createMemoryRouter(
    [
      { path: "/school-class", element: <p>All classes</p> },
      { path: "/school-class/:classId", element: <SchoolClassDetailPage /> },
      { path: "/school-class/:classId/timetable", element: <SchoolClassTimetablePage /> },
    ],
    { initialEntries: [path] }
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

const writes = (calls: Call[]) => calls.filter((c) => c.method !== "GET");
type U = ReturnType<typeof userEvent.setup>;
async function choose(user: U, scope: HTMLElement, label: string, option: string) {
  await user.click(within(scope).getByRole("button", { name: new RegExp(`(^|\\s)${label}$`) }));
  await user.click(await screen.findByRole("option", { name: option }));
}
const panel = () => screen.findByRole("region", { name: "Teachers of Class 5 - A" });

describe("the class teacher, on the class's School Class page", () => {
  it("is named at the top, N/A when there is none, and the teachers box is not on this page", async () => {
    openPage("/school-class/c1");
    expect(await screen.findByText("Class teacher: N/A")).toBeInTheDocument();
    await screen.findByRole("heading", { name: /Students of Class 1/ });
    expect(screen.queryByRole("region", { name: /^Teachers of/ })).not.toBeInTheDocument();
  });

  it("is the picked section's; with no section picked each section's card says its own", async () => {
    openPage("/school-class/c5?section=c5-A");
    expect(await screen.findByText("Class teacher: Meena Singh")).toBeInTheDocument();
    cleanup();
    for (const api of allApiSlices) store.dispatch(api.util.resetApiState());

    openPage("/school-class/c5");
    const card = await screen.findByRole("link", { name: /Section A/ });
    expect(card).toHaveTextContent("Meena Singh");
    expect(screen.queryByText(/^Class teacher:/)).not.toBeInTheDocument();
  });

  it("Timetable & teachers opens the class's own page, on the picked section", async () => {
    openPage("/school-class/c5?section=c5-B");
    expect(await screen.findByRole("link", { name: "Timetable & teachers" })).toHaveAttribute("href", "/school-class/c5/timetable?section=c5-B");
    // The class's work (attendance, diary, tests), 2026-11-04.
    expect(screen.getByRole("link", { name: "Class work" })).toHaveAttribute("href", "/class-work/c5?section=c5-B");
    cleanup();
    for (const api of allApiSlices) store.dispatch(api.util.resetApiState());
    openPage("/school-class/c1");
    expect(await screen.findByRole("link", { name: "Timetable & teachers" })).toHaveAttribute("href", "/school-class/c1/timetable");
  });
});

describe("the teachers of a class, on its Timetable & teachers page", () => {
  it("with a section picked: its class teacher and each subject with its teacher", async () => {
    const { calls } = openPage("/school-class/c5/timetable?section=c5-A");
    const box = await panel();
    expect(within(box).getByRole("button", { name: /(^|\s)Class teacher$/ })).toHaveTextContent("Meena Singh");
    expect(await within(box).findByRole("button", { name: /(^|\s)Mathematics teacher$/ })).toHaveTextContent("Meena Singh");
    expect(within(box).getByRole("button", { name: /(^|\s)English teacher$/ })).toHaveTextContent("No teacher");
    expect(within(box).getByText("6 periods a week")).toBeInTheDocument();
    expect(calls.find((c) => c.path === "/subjects/allotments")?.query).toBe("?classId=c5&sectionId=c5-A");
  });

  it("changes the class teacher by picking one", async () => {
    const { calls, user } = openPage("/school-class/c5/timetable?section=c5-A");
    const box = await panel();
    await choose(user, box, "Class teacher", "Dev Patel");
    await waitFor(() => expect(writes(calls)).toHaveLength(1));
    expect(writes(calls)[0]).toMatchObject({ method: "PUT", path: "/staff/class-teachers", body: { classId: "c5", sectionId: "c5-A", teacherId: "dev" } });
    expect(await screen.findByText("Dev Patel is the class teacher of Class 5 - A")).toBeInTheDocument();
  });

  it("gives a subject its teacher by picking one, and says the server's reason when it refuses", async () => {
    const message = "Dev Patel is teaching Class 5 - B (English) at the same time";
    const { calls, user } = openPage("/school-class/c5/timetable?section=c5-A", {
      "PUT /subjects/allotments/teacher": () => new Response(JSON.stringify({ success: false, message, code: "TIMETABLE_CLASHES" }), { status: 409, headers: { "Content-Type": "application/json" } }),
    });
    const box = await panel();
    await within(box).findByRole("button", { name: /(^|\s)English teacher$/ });
    await choose(user, box, "English teacher", "Dev Patel");
    await waitFor(() => expect(writes(calls)).toHaveLength(1));
    expect(writes(calls)[0]).toMatchObject({ path: "/subjects/allotments/teacher", body: { classId: "c5", sectionId: "c5-A", subjectId: "english", teacherId: "dev" } });
    expect(await screen.findByText(message)).toBeInTheDocument();
  });

  it("adds a subject with its periods a week and its teacher", async () => {
    const { calls, user } = openPage("/school-class/c5/timetable?section=c5-A");
    const box = await panel();
    await user.click(await within(box).findByRole("button", { name: "Add subject" }));
    await choose(user, box, "New subject", "Art & Craft");
    await user.type(within(box).getByLabelText(/^Periods a week/), "2");
    await choose(user, box, "Teacher", "Dev Patel");
    await user.click(within(box).getByRole("button", { name: "Add" }));
    await waitFor(() => expect(writes(calls)).toHaveLength(1));
    expect(writes(calls)[0].body).toEqual({ classId: "c5", sectionId: "c5-A", subjectId: "art", teacherId: "dev", periodsPerWeek: 2 });
  });

  it("a class with sections opens on its first section when none is named", async () => {
    openPage("/school-class/c5/timetable");
    expect(await panel()).toBeInTheDocument();
  });

  it("shows the box at once for a class without sections", async () => {
    openPage("/school-class/c1/timetable");
    expect(await screen.findByRole("region", { name: "Teachers of Class 1" })).toBeInTheDocument();
  });
});
