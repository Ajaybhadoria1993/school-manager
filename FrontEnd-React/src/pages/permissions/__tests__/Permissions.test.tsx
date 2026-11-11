import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Provider } from "react-redux";
import { RouterProvider, createMemoryRouter } from "react-router";
import { ToastProvider } from "../../../components/ui/toast-context";
import { allApiSlices } from "../../../redux/api/apiRoot";
import store from "../../../redux/store";
import type { PermissionsOverview, UserRole } from "../../../types";
import { fakeApi, type Handler } from "../../../test/fakeApi";
import { signInAs, signOut } from "../../../test/session";
import PermissionsPage from "../Permissions";

const STAFF_KEYS = ["students.view", "students.add", "attendance.view", "attendance.mark", "calendar.view", "calendar.manage"];
const OVERVIEW: PermissionsOverview = {
  groups: [
    {
      key: "students",
      label: "Students",
      items: [
        { key: "students.view", label: "See students and their details", for: ["staff"] },
        { key: "students.add", label: "Add students, one by one or with Bulk upload", for: ["staff"] },
      ],
    },
    {
      key: "attendance",
      label: "Attendance",
      items: [
        { key: "attendance.view", label: "See students' attendance", for: ["staff", "teacher"] },
        { key: "attendance.mark", label: "Take and correct students' attendance", for: ["staff", "teacher"] },
      ],
    },
    {
      key: "calendar",
      label: "Calendar",
      items: [
        { key: "calendar.view", label: "See the calendar", for: ["staff", "teacher", "parent"] },
        { key: "calendar.manage", label: "Add and change holidays and events", for: ["staff"] },
      ],
    },
    { key: "child", label: "Their child", items: [{ key: "child.attendance", label: "See their child's attendance", for: ["parent"] }] },
  ],
  profiles: [
    { key: "teacher", label: "Teacher", kind: "teacher", permissions: ["calendar.view", "attendance.view", "attendance.mark"], offered: ["attendance.view", "attendance.mark", "calendar.view"], isDefault: true },
    { key: "parent", label: "Parent", kind: "parent", permissions: ["calendar.view", "child.attendance"], offered: ["calendar.view", "child.attendance"], isDefault: true },
    { key: "receptionist", label: "Receptionist", kind: "staff", permissions: ["calendar.view"], offered: STAFF_KEYS, isDefault: true },
    { key: "librarian", label: "Librarian", kind: "staff", permissions: ["calendar.view"], offered: STAFF_KEYS, isDefault: true },
  ],
};

function openPage(role: UserRole = "school_admin", extra: Record<string, Handler> = {}) {
  signInAs(role);
  const calls = fakeApi({ "GET /permissions": () => OVERVIEW, ...extra });
  const router = createMemoryRouter([{ path: "/permissions", element: <PermissionsPage /> }, { path: "/dashboard", element: <p>Home</p> }], { initialEntries: ["/permissions"] });
  render(
    <Provider store={store}>
      <ToastProvider>
        <RouterProvider router={router} />
      </ToastProvider>
    </Provider>
  );
  return { calls, user: userEvent.setup() };
}
const kind = (name: string) => screen.getByRole("button", { name: new RegExp(`^${name}`) });
const box = (name: string) => screen.getByRole("checkbox", { name });

afterEach(() => {
  cleanup();
  for (const api of allApiSlices) store.dispatch(api.util.resetApiState());
  signOut();
  vi.unstubAllGlobals();
});

describe("Permissions: what each kind of person of the school may do", () => {
  it("lists the kinds (teacher and parent first, then the staff) with how many things each may do, and opens the first one", async () => {
    openPage();
    expect(await screen.findByRole("heading", { name: "Permissions", level: 1 })).toBeInTheDocument();
    const people = within(await screen.findByRole("list", { name: "Kinds of person" }));
    expect(people.getAllByRole("button").map((b) => b.textContent)).toEqual(["Teacher3", "Parent2"]);
    const staff = within(screen.getByRole("list", { name: "Kinds of staff" }));
    expect(staff.getAllByRole("button").map((b) => b.textContent)).toEqual(["Receptionist1", "Librarian1"]);
    // The first kind is open, with only what can be given to it.
    expect(await screen.findByRole("heading", { name: "Teacher" })).toBeInTheDocument();
    expect(screen.queryByRole("checkbox", { name: "Add students, one by one or with Bulk upload" })).not.toBeInTheDocument();
    expect(box("Take and correct students' attendance")).toBeChecked();
  });

  it("a kind's boxes are only what can be given to it: the staff get the school's pages, the parents their child's", async () => {
    const { user } = openPage();
    await screen.findByRole("heading", { name: "Teacher" });
    await user.click(kind("Parent"));
    expect(screen.getAllByRole("checkbox").map((c) => c.closest("label")?.textContent)).toEqual(["See the calendar", "See their child's attendance"]);
    await user.click(kind("Receptionist"));
    expect(screen.getAllByRole("checkbox")).toHaveLength(6);
    expect(screen.queryByRole("checkbox", { name: "See their child's attendance" })).not.toBeInTheDocument();
    expect(box("See the calendar")).toBeChecked();
    expect(box("See students and their details")).not.toBeChecked();
  });

  it("ticking Add students also ticks See students; Save sends the list and a note says it is saved", async () => {
    const { calls, user } = openPage("school_admin", {
      "PUT /permissions/receptionist": (body) => ({ ...OVERVIEW.profiles[2], permissions: (body as { permissions: string[] }).permissions, isDefault: false }),
    });
    await screen.findByRole("heading", { name: "Teacher" });
    await user.click(kind("Receptionist"));
    expect(screen.getByRole("button", { name: /^Save$/ })).toBeDisabled();
    await user.click(box("Add students, one by one or with Bulk upload"));
    expect(box("See students and their details")).toBeChecked();
    expect(box("Add students, one by one or with Bulk upload")).toBeChecked();
    // Not saved yet: said beside the kind, and nothing has been sent.
    expect(within(kind("Receptionist")).getByLabelText("Not saved yet")).toBeInTheDocument();
    expect(calls.filter((c) => c.method === "PUT")).toHaveLength(0);

    await user.click(screen.getByRole("button", { name: /^Save$/ }));
    expect(await screen.findByText(/Receptionist: saved/)).toBeInTheDocument();
    const put = calls.find((c) => c.method === "PUT")!;
    expect(put.path).toBe("/permissions/receptionist");
    expect((put.body as { permissions: string[] }).permissions.sort()).toEqual(["calendar.view", "students.add", "students.view"]);
  });

  it("clearing See students also clears what needed it", async () => {
    const { user } = openPage();
    await screen.findByRole("heading", { name: "Teacher" });
    await user.click(kind("Receptionist"));
    await user.click(box("Add students, one by one or with Bulk upload"));
    await user.click(box("See students and their details"));
    expect(box("Add students, one by one or with Bulk upload")).not.toBeChecked();
    expect(box("See students and their details")).not.toBeChecked();
    // Back to what was saved: nothing to save.
    expect(screen.getByRole("button", { name: /^Save$/ })).toBeDisabled();
  });

  it("an unsaved change stays with its kind while another is looked at", async () => {
    const { user } = openPage();
    await screen.findByRole("heading", { name: "Teacher" });
    await user.click(kind("Librarian"));
    await user.click(box("See students and their details"));
    await user.click(kind("Receptionist"));
    expect(box("See students and their details")).not.toBeChecked();
    await user.click(kind("Librarian"));
    expect(box("See students and their details")).toBeChecked();
  });

  it("a kind the school has changed can go back to the usual list: one request, then a note", async () => {
    const changed = { ...OVERVIEW, profiles: OVERVIEW.profiles.map((p) => (p.key === "receptionist" ? { ...p, permissions: ["students.view"], isDefault: false } : p)) };
    const { calls, user } = openPage("school_admin", {
      "GET /permissions": () => changed,
      "DELETE /permissions/receptionist": () => ({ ...OVERVIEW.profiles[2] }),
    });
    await screen.findByRole("heading", { name: "Teacher" });
    // A kind on its usual list has no such button.
    expect(screen.queryByRole("button", { name: "Back to the usual list" })).not.toBeInTheDocument();
    await user.click(kind("Receptionist"));
    await user.click(screen.getByRole("button", { name: "Back to the usual list" }));
    expect(await screen.findByText(/Receptionist: back to the usual list/)).toBeInTheDocument();
    expect(calls.filter((c) => c.method === "DELETE")).toHaveLength(1);
  });

  it("a refusal from the server is said, and the boxes stay as they were ticked", async () => {
    const { user } = openPage("school_admin", {
      "PUT /permissions/receptionist": () => new Response(JSON.stringify({ success: false, message: "You do not have permission to do this" }), { status: 403, headers: { "Content-Type": "application/json" } }),
    });
    await screen.findByRole("heading", { name: "Teacher" });
    await user.click(kind("Receptionist"));
    await user.click(box("See students and their details"));
    await user.click(screen.getByRole("button", { name: /^Save$/ }));
    expect(await screen.findByText("You do not have permission to do this")).toBeInTheDocument();
    expect(box("See students and their details")).toBeChecked();
  });

  it("the principal can read it but not change it: the boxes are fixed and there is no Save", async () => {
    openPage("principal");
    await screen.findByRole("heading", { name: "Teacher" });
    expect(screen.getAllByRole("checkbox").every((c) => (c as HTMLInputElement).disabled)).toBe(true);
    expect(screen.queryByRole("button", { name: /^Save$/ })).not.toBeInTheDocument();
  });

  it("says when it could not be loaded, and tries again", async () => {
    let first = true;
    const { user } = openPage("school_admin", {
      "GET /permissions": () => {
        if (first) {
          first = false;
          return new Response(JSON.stringify({ success: false, message: "Try again in a minute." }), { status: 500, headers: { "Content-Type": "application/json" } });
        }
        return OVERVIEW;
      },
    });
    expect(await screen.findByText("Try again in a minute.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(screen.getByRole("heading", { name: "Teacher" })).toBeInTheDocument());
  });
});
