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
import { STRUCTURE } from "../../../test/schoolClass";
import { ALLOTMENT, ENGLISH, GRID, MATHS, MEENA } from "../../../test/timetableFixtures";
import type { Teacher } from "../../../types";
import TeacherAssignClassPage from "../TeacherAssignClass";
import TeacherDetailPage from "../TeacherDetail";

/** Assign class is a page of its own (2026-11-13: it was a window, "naya page hi open karo, modal nahi"). */
const FULL: Teacher = { ...MEENA, subjectIds: ["maths", "english"], login: { username: "meena.singh", isActive: true } };

function openPage(start: string, extra: Record<string, Handler> = {}, teacher: Teacher = FULL) {
  signInAs("school_admin");
  const calls = fakeApi({
    [`GET /staff/teachers/${FULL.id}`]: () => teacher,
    [`GET /staff/teachers/${FULL.id}/classes`]: () => ({ classTeacherOf: [], subjects: [] }),
    "GET /subjects": () => ({ items: [MATHS, ENGLISH] }),
    "GET /academics/structure": () => STRUCTURE,
    "GET /subjects/allotments": () => ALLOTMENT,
    "GET /timetable/grid": () => GRID,
    "PUT /subjects/allotments/teacher": () => ALLOTMENT,
    ...extra,
  });
  const router = createMemoryRouter(
    [
      { path: "/teachers/:id", element: <TeacherDetailPage /> },
      { path: "/teachers/:id/assign-class", element: <TeacherAssignClassPage /> },
      { path: "/school/teachers/:id", element: <TeacherDetailPage /> },
      { path: "/school/teachers/:id/assign-class", element: <TeacherAssignClassPage /> },
    ],
    { initialEntries: [start] }
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
  signOut();
  cleanup();
  for (const api of allApiSlices) store.dispatch(api.util.resetApiState());
  vi.unstubAllGlobals();
});

type U = ReturnType<typeof userEvent.setup>;
const form = () => screen.findByRole("form", { name: "Assign a class to Meena Singh" });
async function pickClass(user: U, d: HTMLElement) {
  await user.click(within(d).getByRole("button", { name: /(^|\s)Class$/ }));
  await user.click(await screen.findByRole("option", { name: "Class 5" }));
  await user.click(within(d).getByRole("button", { name: /(^|\s)Section$/ }));
  await user.click(await screen.findByRole("option", { name: "A" }));
}

describe("Assign class: a page, not a window", () => {
  it("the button on the teacher's page opens a page of its own (its address changes, no window opens)", async () => {
    const { router, user } = openPage("/teachers/meena");
    await user.click(await screen.findByRole("button", { name: "Assign class" }));
    const d = await form();
    expect(router.state.location.pathname).toBe("/teachers/meena/assign-class");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Assign class" })).toBeInTheDocument();
    expect(within(d).getByRole("button", { name: "Assign" })).toBeInTheDocument();
    expect(within(d).getByRole("button", { name: "Cancel" })).toBeInTheDocument();
  });

  it("has the way back under the title: Teacher > Meena Singh > Assign class", async () => {
    const { router, user } = openPage("/teachers/meena/assign-class");
    await form();
    expect(screen.getByRole("link", { name: "Teacher" })).toHaveAttribute("href", "/teachers");
    const crumb = await screen.findByRole("link", { name: "Meena Singh" });
    expect(crumb).toHaveAttribute("href", "/teachers/meena");
    await user.click(crumb);
    await waitFor(() => expect(router.state.location.pathname).toBe("/teachers/meena"));
  });

  it("opened from Manage Teacher it stays under Manage Teacher", async () => {
    const { router, user } = openPage("/school/teachers/meena");
    await user.click(await screen.findByRole("button", { name: "Assign class" }));
    await form();
    expect(router.state.location.pathname).toBe("/school/teachers/meena/assign-class");
    expect(screen.getByText("Manage Teacher")).toBeInTheDocument();
  });

  it("Cancel goes back to the teacher's page and sends nothing", async () => {
    const { calls, router, user } = openPage("/teachers/meena/assign-class");
    const d = await form();
    await user.click(within(d).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/teachers/meena"));
    expect(calls.filter((c) => c.method !== "GET")).toHaveLength(0);
  });

  it("a success goes back to the teacher's page, with the message", async () => {
    const { calls, router, user } = openPage("/teachers/meena/assign-class");
    const d = await form();
    await pickClass(user, d);
    await user.click(within(d).getByRole("combobox", { name: /^Subject$/ }));
    await user.click(await screen.findByRole("option", { name: "Mathematics" }));
    await user.click(within(d).getByRole("button", { name: "Assign" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/teachers/meena"));
    expect(calls.filter((c) => c.method === "PUT")).toHaveLength(1);
    expect(await screen.findByText("Meena Singh is given Mathematics of Class 5 - A")).toBeInTheDocument();
  });

  it("a refusal keeps the page, with the reason, so it can be tried again", async () => {
    const refused = () => new Response(JSON.stringify({ success: false, message: "Meena Singh is teaching Class 5 - B at the same time", code: "TIMETABLE_CLASHES" }), { status: 409, headers: { "Content-Type": "application/json" } });
    const { router, user } = openPage("/teachers/meena/assign-class", { "PUT /subjects/allotments/teacher": refused });
    const d = await form();
    await pickClass(user, d);
    await user.click(within(d).getByRole("combobox", { name: /^Subject$/ }));
    await user.click(await screen.findByRole("option", { name: "Mathematics" }));
    await user.click(within(d).getByRole("button", { name: "Assign" }));
    expect(await within(d).findByText("Meena Singh is teaching Class 5 - B at the same time")).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/teachers/meena/assign-class");
  });

  it("the class's timetable is beside the form on the page", async () => {
    const { user } = openPage("/teachers/meena/assign-class");
    const d = await form();
    expect(screen.queryByRole("region", { name: /^Timetable of/ })).not.toBeInTheDocument();
    await pickClass(user, d);
    expect(await screen.findByRole("region", { name: "Timetable of Class 5 - A" })).toBeInTheDocument();
  });

  it("a teacher who has left cannot be given a class: it says so, with a way back", async () => {
    openPage("/teachers/meena/assign-class", {}, { ...FULL, isActive: false });
    expect(await screen.findByText("Meena Singh has left the school, so no class can be given to them.")).toBeInTheDocument();
    expect(screen.queryByRole("form", { name: /Assign a class/ })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to Meena Singh" })).toHaveAttribute("href", "/teachers/meena");
  });

  it("a teacher who cannot be loaded says why, with a way back to all teachers", async () => {
    openPage("/teachers/meena/assign-class", { "GET /staff/teachers/meena": () => new Response(JSON.stringify({ success: false, message: "Teacher not found" }), { status: 404, headers: { "Content-Type": "application/json" } }) });
    expect(await screen.findByText("Teacher not found")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "All teachers" })).toHaveAttribute("href", "/teachers");
  });
});
