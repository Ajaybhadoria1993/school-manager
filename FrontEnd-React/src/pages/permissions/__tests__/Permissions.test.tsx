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

const STAFF_KEYS = ["students.view", "students.add", "attendance.view", "attendance.staff", "calendar.view", "calendar.manage"];
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
        { key: "attendance.view", label: "See students' attendance", for: ["staff", "class_teacher"] },
        { key: "attendance.mark", label: "Take and correct students' attendance", for: ["class_teacher"] },
        { key: "attendance.staff", label: "See the staff's attendance", for: ["staff"] },
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
    { key: "teacher", label: "Teacher", kind: "teacher", permissions: ["calendar.view"], offered: ["calendar.view"], isDefault: true },
    { key: "class_teacher", label: "Class teacher", kind: "class_teacher", permissions: ["attendance.view", "attendance.mark"], offered: ["attendance.view", "attendance.mark"], isDefault: true },
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
const profileOf = (key: string) => OVERVIEW.profiles.find((p) => p.key === key)!;
const kind = (name: string) => screen.getByRole("button", { name: new RegExp(`^${name}`) });
const box = (name: string) => screen.getByRole("checkbox", { name });
/** The boxes of the permissions themselves (not a group's All). */
const permissionBoxes = () => screen.getAllByRole("checkbox").filter((c) => !c.getAttribute("aria-label")?.startsWith("All of"));

afterEach(() => {
  cleanup();
  for (const api of allApiSlices) store.dispatch(api.util.resetApiState());
  signOut();
  vi.unstubAllGlobals();
});

describe("Permissions: what each kind of person of the school may do", () => {
  it("lists the kinds (teacher, class teacher and parent first, then the staff) with how many of what can be given each has, and opens the first one", async () => {
    openPage();
    expect(await screen.findByRole("heading", { name: "Permissions", level: 1 })).toBeInTheDocument();
    const people = within(await screen.findByRole("list", { name: "Kinds of person" }));
    expect(people.getAllByRole("button").map((b) => b.textContent)).toEqual(["Teacher1/1", "Class teacher2/2", "Parent2/2"]);
    const staff = within(screen.getByRole("list", { name: "Kinds of staff" }));
    expect(staff.getAllByRole("button").map((b) => b.textContent)).toEqual(["Receptionist1/6", "Librarian1/6"]);
    // The first kind is open, with only what can be given to it, and says who it is for.
    expect(await screen.findByRole("heading", { name: "Teacher" })).toBeInTheDocument();
    // Staff marked Also a teacher get it too, on top of their role's list (2026-11-26).
    expect(screen.getByText("Every teacher, in the classes and subjects they teach. Staff who also teach get it too, with their role's list.")).toBeInTheDocument();
    expect(screen.queryByRole("checkbox", { name: "Add students, one by one or with Bulk upload" })).not.toBeInTheDocument();
    expect(screen.queryByRole("checkbox", { name: "Take and correct students' attendance" })).not.toBeInTheDocument();
    expect(box("See the calendar")).toBeChecked();
  });

  it("the class teacher has a list of their own: what only a class teacher does, in their own class (2026-11-26)", async () => {
    const { user } = openPage();
    await screen.findByRole("heading", { name: "Teacher" });
    await user.click(kind("Class teacher"));
    expect(screen.getByRole("heading", { name: "Class teacher" })).toBeInTheDocument();
    expect(screen.getByText("A class teacher, in their own class only, on top of what every teacher may do.")).toBeInTheDocument();
    expect(screen.getAllByRole("checkbox", { name: /attendance/ }).map((c) => c.closest("label")?.textContent)).toEqual(["See students' attendance", "Take and correct students' attendance"]);
    expect(box("Take and correct students' attendance")).toBeChecked();
    expect(screen.queryByRole("checkbox", { name: "See the staff's attendance" })).not.toBeInTheDocument();
  });

  it("a role the school named itself (Add staff > Other) has a list of its own under Roles you named; saving sends that role", async () => {
    const otherRoles = { key: "other", label: "Other roles", kind: "staff" as const, permissions: ["calendar.view"], offered: STAFF_KEYS, isDefault: true };
    const coach = { key: "other:sports coach", label: "Sports Coach", kind: "staff" as const, permissions: ["calendar.view"], offered: STAFF_KEYS, isDefault: true };
    const { calls, user } = openPage("school_admin", {
      "GET /permissions": () => ({ ...OVERVIEW, profiles: [...OVERVIEW.profiles, otherRoles, coach] }),
      "PUT /permissions/other%3Asports%20coach": (body) => ({ ...coach, permissions: (body as { permissions: string[] }).permissions, isDefault: false }),
    });
    await screen.findByRole("heading", { name: "Teacher" });
    expect(within(screen.getByRole("list", { name: "Kinds of staff" })).getAllByRole("button").map((b) => b.textContent)).toEqual(["Receptionist1/6", "Librarian1/6", "Other roles1/6"]);
    expect(within(screen.getByRole("list", { name: "Roles you named" })).getAllByRole("button").map((b) => b.textContent)).toEqual(["Sports Coach1/6"]);
    await user.click(kind("Other roles"));
    expect(screen.getByText("Every role you named that has no list of its own.")).toBeInTheDocument();
    await user.click(kind("Sports Coach"));
    expect(screen.getByText("Everyone added as Sports Coach.")).toBeInTheDocument();
    await user.click(box("See students and their details"));
    // Not saved yet, a named role can go back to following Other roles.
    expect(screen.getByRole("button", { name: "Same as Other roles" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /^Save$/ }));
    expect(await screen.findByText(/Sports Coach: saved/)).toBeInTheDocument();
    expect(calls.find((c) => c.method === "PUT")?.path).toBe("/permissions/other%3Asports%20coach");
  });

  it("a school with no role of its own has no Roles you named list, and the principal cannot make one", async () => {
    openPage();
    await screen.findByRole("heading", { name: "Teacher" });
    expect(screen.queryByRole("list", { name: "Roles you named" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "New role" })).toBeInTheDocument();
    cleanup();
    openPage("principal");
    await screen.findByRole("heading", { name: "Teacher" });
    expect(screen.queryByRole("button", { name: "New role" })).not.toBeInTheDocument();
  });

  it("New role (2026-11-26): the school writes a name, the role opens with every staff permission to tick", async () => {
    const coach = { key: "other:sports coach", label: "Sports Coach", kind: "staff" as const, permissions: ["calendar.view"], offered: STAFF_KEYS, isDefault: true, custom: true, people: 0 };
    let made = false;
    const { calls, user } = openPage("school_admin", {
      "GET /permissions": () => ({ ...OVERVIEW, profiles: made ? [...OVERVIEW.profiles, coach] : OVERVIEW.profiles }),
      "POST /permissions/roles": () => {
        made = true;
        return coach;
      },
    });
    await screen.findByRole("heading", { name: "Teacher" });
    await user.click(screen.getByRole("button", { name: "New role" }));
    await user.type(await screen.findByLabelText(/^Role name/), "Sports Coach");
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Make the role" }));
    expect(await screen.findByText(/Sports Coach: made/)).toBeInTheDocument();
    expect(calls.find((c) => c.method === "POST")?.body).toEqual({ name: "Sports Coach" });
    // The new role is open: every staff permission to tick.
    expect(await screen.findByRole("heading", { name: "Sports Coach" })).toBeInTheDocument();
    expect(screen.getByText("Nobody has this role yet: choose it in Add staff.")).toBeInTheDocument();
    expect(permissionBoxes()).toHaveLength(STAFF_KEYS.length);
    expect(within(screen.getByRole("list", { name: "Roles you named" })).getAllByRole("button").map((b) => b.textContent)).toEqual(["Sports Coach1/6"]);
  });

  it("a name the server refuses is said in the window, which stays open", async () => {
    const { user } = openPage("school_admin", {
      "POST /permissions/roles": () =>
        new Response(JSON.stringify({ success: false, message: "Librarian is already a role: choose it in Add staff.", code: "ROLE_NAME_TAKEN" }), { status: 409, headers: { "Content-Type": "application/json" } }),
    });
    await screen.findByRole("heading", { name: "Teacher" });
    await user.click(screen.getByRole("button", { name: "New role" }));
    await user.type(await screen.findByLabelText(/^Role name/), "Librarian");
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Make the role" }));
    expect(await within(screen.getByRole("dialog")).findByText("Librarian is already a role: choose it in Add staff.")).toBeInTheDocument();
  });

  it("a role the school made and nobody has can be deleted after a question; one someone has cannot", async () => {
    const coach = { key: "other:sports coach", label: "Sports Coach", kind: "staff" as const, permissions: ["calendar.view"], offered: STAFF_KEYS, isDefault: true, custom: true, people: 0 };
    const cook = { key: "other:cook", label: "Cook", kind: "staff" as const, permissions: ["calendar.view"], offered: STAFF_KEYS, isDefault: true, custom: true, people: 2 };
    const { calls, user } = openPage("school_admin", {
      "GET /permissions": () => ({ ...OVERVIEW, profiles: [...OVERVIEW.profiles, cook, coach] }),
      "DELETE /permissions/roles/other%3Asports%20coach": () => ({ key: coach.key }),
    });
    await screen.findByRole("heading", { name: "Teacher" });
    await user.click(kind("Cook"));
    expect(screen.getByText("Everyone added as Cook (2 of the staff).")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Delete role" })).not.toBeInTheDocument();
    await user.click(kind("Sports Coach"));
    await user.click(screen.getByRole("button", { name: "Delete role" }));
    await user.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Delete" }));
    expect(await screen.findByText(/Sports Coach: deleted/)).toBeInTheDocument();
    expect(calls.filter((c) => c.method === "DELETE").map((c) => c.path)).toEqual(["/permissions/roles/other%3Asports%20coach"]);
  });

  it("each group is a box with its count and an All tick: All ticks every one of the group, again clears them", async () => {
    const { user } = openPage();
    await screen.findByRole("heading", { name: "Teacher" });
    await user.click(kind("Receptionist"));
    const students = within(screen.getByRole("group", { name: "Students" }));
    expect(students.getByText("0/2")).toBeInTheDocument();
    await user.click(students.getByRole("checkbox", { name: "All of Students" }));
    expect(box("See students and their details")).toBeChecked();
    expect(box("Add students, one by one or with Bulk upload")).toBeChecked();
    expect(students.getByText("2/2")).toBeInTheDocument();
    expect(students.getByRole("checkbox", { name: "All of Students" })).toBeChecked();
    expect(within(kind("Receptionist")).getByText("3/6")).toBeInTheDocument();
    await user.click(students.getByRole("checkbox", { name: "All of Students" }));
    expect(box("See students and their details")).not.toBeChecked();
    expect(box("Add students, one by one or with Bulk upload")).not.toBeChecked();
    // Back to what was saved: nothing to save.
    expect(screen.getByRole("button", { name: /^Save$/ })).toBeDisabled();
  });

  it("a kind's boxes are only what can be given to it: the staff get the school's pages, the parents their child's", async () => {
    const { user } = openPage();
    await screen.findByRole("heading", { name: "Teacher" });
    await user.click(kind("Parent"));
    expect(permissionBoxes().map((c) => c.closest("label")?.textContent)).toEqual(["See the calendar", "See their child's attendance"]);
    await user.click(kind("Receptionist"));
    expect(permissionBoxes()).toHaveLength(6);
    expect(screen.queryByRole("checkbox", { name: "See their child's attendance" })).not.toBeInTheDocument();
    expect(box("See the calendar")).toBeChecked();
    expect(box("See students and their details")).not.toBeChecked();
  });

  it("ticking Add students also ticks See students; Save sends the list and a note says it is saved", async () => {
    const { calls, user } = openPage("school_admin", {
      "PUT /permissions/receptionist": (body) => ({ ...profileOf("receptionist"), permissions: (body as { permissions: string[] }).permissions, isDefault: false }),
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
      "DELETE /permissions/receptionist": () => ({ ...profileOf("receptionist") }),
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
