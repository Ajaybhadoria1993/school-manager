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
import { CLASSES, STRUCTURE, classOverviewFor, studentsFor } from "../../../test/schoolClass";
import { DEV, MEENA } from "../../../test/timetableFixtures";
import type { ClassOverview, Teacher } from "../../../types";
import SchoolClassDetailPage from "../SchoolClassDetail";

/**
 * The class teacher on the class's own page (2026-11-13, user: "class teacher nahi hai to Add class teacher button, dropdown me sab teacher ki
 * list; already hai to replace; jo teacher kisi aur class ka class teacher hai uspe tag; use chuno to modal, wo yahan ban jayega aur wahan se hat
 * jayega"): the badge beside the title is a button, the list of teachers is under it, and a pick that moves somebody asks first.
 */
const KIRAN: Teacher = { ...DEV, id: "kiran", name: "Kiran Rao" };
// Meena is already the class teacher of Class 5 - A (so her entry in the list says so).
const MEENA_HEAD: Teacher = { ...MEENA, classTeacherOf: ["Class 5 - A"] };
// Class 5 - A has Meena as its class teacher; Class 1 (no sections) has none.
const WITH_HEAD: ClassOverview[] = CLASSES.map((c) =>
  c.id === "c5" ? { ...c, sections: c.sections.map((s) => (s.id === "c5-A" ? { ...s, classTeacher: { id: "meena", name: "Meena Singh" } } : s)) } : c
);

function openPage(path: string, extra: Record<string, Handler> = {}, permissions?: string[]) {
  signInAs(permissions ? "receptionist" : "school_admin", permissions);
  const calls = fakeApi({
    "GET /academics/structure": () => STRUCTURE,
    "GET /students/class-overview": (_body, query) => classOverviewFor(query, WITH_HEAD),
    "GET /students": (_body, query) => studentsFor(query),
    "GET /staff/teachers": () => ({ items: [MEENA_HEAD, DEV, KIRAN] }),
    "PUT /staff/class-teachers": (body) => ({ ...(body as object), label: "Class 1", teacher: { id: (body as { teacherId: string }).teacherId, name: "Dev Patel" } }),
    ...extra,
  });
  const router = createMemoryRouter([{ path: "/school-class", element: <p>All classes</p> }, { path: "/school-class/:classId", element: <SchoolClassDetailPage /> }], { initialEntries: [path] });
  render(
    <Provider store={store}>
      <ToastProvider>
        <RouterProvider router={router} />
      </ToastProvider>
    </Provider>
  );
  return { calls, user: userEvent.setup() };
}

afterEach(() => {
  signOut();
  cleanup();
  for (const api of allApiSlices) store.dispatch(api.util.resetApiState());
  vi.unstubAllGlobals();
});

const writes = (calls: Call[]) => calls.filter((c) => c.method !== "GET");
const addButton = () => screen.findByRole("button", { name: "Add class teacher" });
const menu = () => screen.findByRole("listbox", { name: "Teachers to choose from" });
const row = (name: string | RegExp) => within(screen.getByRole("listbox", { name: "Teachers to choose from" })).getByRole("option", { name });

describe("Add class teacher on a class's page", () => {
  it("a class with no class teacher has a button 'Add class teacher' in place of 'N/A'; the teachers are not read until it is opened", async () => {
    const { calls } = openPage("/school-class/c1");
    expect(await addButton()).toBeInTheDocument();
    expect(screen.queryByText("Class teacher: N/A")).not.toBeInTheDocument();
    expect(calls.some((c) => c.path === "/staff/teachers")).toBe(false);
  });

  it("opens a list of every teacher of the school; one who is already the class teacher of another class says which", async () => {
    const { calls, user } = openPage("/school-class/c1");
    await user.click(await addButton());
    await menu();
    expect(screen.getAllByRole("option").map((o) => o.textContent)).toEqual(["Meena SinghClass teacher of Class 5 - A", "Dev Patel", "Kiran Rao"]);
    expect(calls.filter((c) => c.path === "/staff/teachers")).toHaveLength(1);
    expect(calls.find((c) => c.path === "/staff/teachers")!.query).toContain("status=active");
  });

  it("the list can be searched by name", async () => {
    const { user } = openPage("/school-class/c1");
    await user.click(await addButton());
    await menu();
    await user.type(screen.getByRole("searchbox", { name: "Search teachers" }), "kir");
    expect(screen.getAllByRole("option").map((o) => o.textContent)).toEqual(["Kiran Rao"]);
    await user.clear(screen.getByRole("searchbox", { name: "Search teachers" }));
    await user.type(screen.getByRole("searchbox", { name: "Search teachers" }), "zzz");
    expect(screen.queryByRole("option")).not.toBeInTheDocument();
    expect(screen.getByText("No teacher with that name")).toBeInTheDocument();
  });

  it("a teacher who is no class teacher anywhere becomes this class's at once: one request, no window", async () => {
    const { calls, user } = openPage("/school-class/c1");
    await user.click(await addButton());
    await menu();
    await user.click(row("Dev Patel"));
    await waitFor(() => expect(writes(calls)).toHaveLength(1));
    expect(writes(calls)[0]).toMatchObject({ method: "PUT", path: "/staff/class-teachers", body: { classId: "c1", sectionId: null, teacherId: "dev" } });
    expect(writes(calls)[0].body).not.toHaveProperty("releaseOthers");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(await screen.findByText("Dev Patel is the class teacher of Class 1")).toBeInTheDocument();
    // The class's page reads the class again, so the name shows.
    await waitFor(() => expect(calls.filter((c) => c.path === "/students/class-overview").length).toBeGreaterThan(1));
  });

  it("a teacher who is the class teacher of another class opens a window that names it; Cancel sends nothing, Make class teacher moves them", async () => {
    const { calls, user } = openPage("/school-class/c1", { "PUT /staff/class-teachers": (body) => ({ ...(body as object), label: "Class 1", teacher: { id: "meena", name: "Meena Singh" }, released: ["Class 5 - A"] }) });
    await user.click(await addButton());
    await menu();
    await user.click(row(/^Meena Singh/));
    const ask = await screen.findByRole("dialog", { name: "Make Meena Singh the class teacher of Class 1?" });
    expect(ask).toHaveTextContent("Meena Singh is the class teacher of Class 5 - A already.");
    expect(ask).toHaveTextContent("Meena Singh will be taken off it, and Class 5 - A will have no class teacher.");
    expect(writes(calls)).toHaveLength(0);

    await user.click(within(ask).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(writes(calls)).toHaveLength(0);

    await user.click(await addButton());
    await menu();
    await user.click(row(/^Meena Singh/));
    await user.click(within(await screen.findByRole("dialog", { name: "Make Meena Singh the class teacher of Class 1?" })).getByRole("button", { name: "Make class teacher" }));
    await waitFor(() => expect(writes(calls)).toHaveLength(1));
    expect(writes(calls)[0].body).toEqual({ classId: "c1", sectionId: null, teacherId: "meena", releaseOthers: true });
    expect(await screen.findByText("Meena Singh is the class teacher of Class 1, and no longer of Class 5 - A")).toBeInTheDocument();
  });

  it("with a class teacher already: the button names them, the list marks them Current, and another pick asks before it replaces them", async () => {
    const { calls, user } = openPage("/school-class/c5?section=c5-A");
    const button = await screen.findByRole("button", { name: "Class teacher: Meena Singh" });
    await user.click(button);
    await menu();
    expect(row(/^Meena Singh/)).toHaveTextContent("Current");
    expect(row(/^Meena Singh/)).toHaveAttribute("aria-disabled", "true");
    await user.click(row("Dev Patel"));
    const ask = await screen.findByRole("dialog", { name: "Make Dev Patel the class teacher of Class 5 - A?" });
    expect(ask).toHaveTextContent("Class 5 - A has Meena Singh as its class teacher now. Meena Singh will no longer be.");
    expect(writes(calls)).toHaveLength(0);
    await user.click(within(ask).getByRole("button", { name: "Make class teacher" }));
    await waitFor(() => expect(writes(calls)).toHaveLength(1));
    // Dev is no class teacher elsewhere: nothing to release.
    expect(writes(calls)[0].body).toEqual({ classId: "c5", sectionId: "c5-A", teacherId: "dev" });
  });

  it("replacing with a teacher who is the class teacher of another class says both things in one window", async () => {
    const other: Teacher = { ...DEV, classTeacherOf: ["Class 1"] };
    const { calls, user } = openPage("/school-class/c5?section=c5-A", { "GET /staff/teachers": () => ({ items: [MEENA_HEAD, other, KIRAN] }) });
    await user.click(await screen.findByRole("button", { name: "Class teacher: Meena Singh" }));
    await menu();
    await user.click(row(/^Dev Patel/));
    const ask = await screen.findByRole("dialog", { name: "Make Dev Patel the class teacher of Class 5 - A?" });
    expect(ask).toHaveTextContent("Class 5 - A has Meena Singh as its class teacher now. Meena Singh will no longer be.");
    expect(ask).toHaveTextContent("Dev Patel is the class teacher of Class 1 already.");
    await user.click(within(ask).getByRole("button", { name: "Make class teacher" }));
    await waitFor(() => expect(writes(calls)).toHaveLength(1));
    expect(writes(calls)[0].body).toEqual({ classId: "c5", sectionId: "c5-A", teacherId: "dev", releaseOthers: true });
  });

  it("a refusal is said in the window, which stays open", async () => {
    const refused = () => new Response(JSON.stringify({ success: false, message: "Dev Patel is no longer teaching here" }), { status: 400, headers: { "Content-Type": "application/json" } });
    const { user } = openPage("/school-class/c5?section=c5-A", { "PUT /staff/class-teachers": refused });
    await user.click(await screen.findByRole("button", { name: "Class teacher: Meena Singh" }));
    await menu();
    await user.click(row("Dev Patel"));
    const ask = await screen.findByRole("dialog", { name: "Make Dev Patel the class teacher of Class 5 - A?" });
    await user.click(within(ask).getByRole("button", { name: "Make class teacher" }));
    expect(await within(ask).findByText("Dev Patel is no longer teaching here")).toBeInTheDocument();
  });

  it("a class with sections has the button on the picked section (its own class teacher), and none until one is picked", async () => {
    const { user } = openPage("/school-class/c5");
    await screen.findByRole("navigation", { name: "Sections of Class 5" });
    expect(screen.queryByRole("button", { name: /class teacher/i })).not.toBeInTheDocument();
    await user.click(screen.getByRole("link", { name: /Section B/ }));
    expect(await addButton()).toBeInTheDocument();
  });

  it("a person who may not change class teachers sees the plain badge, as before", async () => {
    openPage("/school-class/c1", {}, ["classes.view"]);
    expect(await screen.findByText("Class teacher: N/A")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add class teacher" })).not.toBeInTheDocument();
  });
});
