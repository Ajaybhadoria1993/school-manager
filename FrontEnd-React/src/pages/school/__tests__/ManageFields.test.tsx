import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Provider } from "react-redux";
import { RouterProvider, createMemoryRouter } from "react-router";
import { ToastProvider } from "../../../components/ui/toast-context";
import { allApiSlices } from "../../../redux/api/apiRoot";
import store from "../../../redux/store";
import type { StudentSettings } from "../../../types";
import { fakeApi, type Handler } from "../../../test/fakeApi";
import { SETTINGS } from "../../../test/fixtures";
import ManageFieldsPage from "../ManageFields";

/** A new school's settings; PUT answers with them as the server would keep them. */
function server(extra: Record<string, Handler> = {}) {
  let now: StudentSettings = SETTINGS;
  return fakeApi({
    "GET /students/settings": () => now,
    "PUT /students/settings": (body) => {
      const input = body as { fields?: object; customFields?: StudentSettings["customFields"]; exportColumns?: StudentSettings["exportColumns"] | null };
      now = { ...now, fields: { ...now.fields, ...input.fields }, customFields: input.customFields ?? now.customFields, exportColumns: input.exportColumns ?? now.exportColumns, exportIsDefault: input.exportColumns === null };
      return now;
    },
    ...extra,
  });
}

/** The page, reached from `from` (Add student's page is the one before it in the history) or opened directly (nothing before it). */
function open(from: "admit" | "students" | null = "admit") {
  const entries = from
    ? [{ pathname: from === "admit" ? "/school/students/new" : "/school/students" }, { pathname: "/school/students/fields", state: { from } }]
    : [{ pathname: "/school/students/fields" }];
  const router = createMemoryRouter(
    [
      { path: "/school/students/fields", element: <ManageFieldsPage /> },
      { path: "/school/students/new", element: <p>The Add student page</p> },
      { path: "/school/students", element: <p>The students</p> },
    ],
    { initialEntries: entries, initialIndex: entries.length - 1 }
  );
  render(
    <Provider store={store}>
      <ToastProvider>
        <RouterProvider router={router} />
      </ToastProvider>
    </Provider>
  );
  return { router, user: userEvent.setup() };
}
const puts = (calls: ReturnType<typeof fakeApi>) => calls.filter((c) => c.method === "PUT");
const list = () => screen.findByRole("list", { name: "Fields" });

afterEach(() => {
  cleanup();
  for (const api of allApiSlices) store.dispatch(api.util.resetApiState());
  vi.unstubAllGlobals();
});

describe("Manage fields: the school's fields on a page of their own", () => {
  it("is a page, not a dialog: the list is open (no arrow), it says what On / Mandatory / Always mean, and only the settings are read", async () => {
    const calls = server();
    open();
    expect(await screen.findByRole("heading", { name: "Manage fields" })).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await list();
    expect(screen.getByText(/\d+ on · \d+ off/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Show the fields" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Hide the fields" })).not.toBeInTheDocument();
    // The words that were confusing (a name in one column, or the first and last name): said once on the page.
    expect(screen.getByText(/is only the full name in one column of the Excel/)).toBeInTheDocument();
    expect(screen.getByText(/Add student always asks it, whatever you choose here/)).toBeInTheDocument();
    // The details every school keeps, said once (they have no switch).
    expect(screen.getByText(/every school keeps these/i).closest("p")).toHaveTextContent(
      "Student Name, Gender, Date of Birth, Age, Category, Class and Section, both parents' names and mobile numbers, the Address (always needed) and the Previous School (needed from Class 1; Nursery, LKG and UKG may leave it empty). Section is asked when the class has sections"
    );
    // Add student is the strict one; a bulk upload is flexible (an old register seldom holds all of it).
    expect(screen.getByText(/Bulk upload is flexible/).closest("p")).toHaveTextContent("Only the name, gender, date of birth, class and a parent's mobile number are needed");
    expect(screen.getByText("All saved")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
    // No students are needed (a new school has none): the Excel's preview is not asked for.
    expect(calls.map((c) => `${c.method} ${c.path}`)).toEqual(["GET /students/settings"]);
  });

  it("Save sends one PUT with only what changed, says so, and the page stays (it is saved now)", async () => {
    const calls = server();
    const { user } = open();
    await list();
    await user.click(screen.getByRole("switch", { name: "Religion on" }));
    await user.click(screen.getByRole("switch", { name: "Blood Group mandatory" }));
    expect(screen.getByText("Changes not saved yet")).toBeInTheDocument();
    expect(puts(calls)).toHaveLength(0);

    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText("Saved: Add student and the Excel follow it from now on")).toBeInTheDocument();
    expect(await screen.findByText("All saved")).toBeInTheDocument();
    expect(puts(calls)).toHaveLength(1);
    expect((puts(calls)[0].body as { fields: object }).fields).toEqual({ religion: "optional", bloodGroup: "required" });
    expect(screen.getByRole("heading", { name: "Manage fields" })).toBeInTheDocument();
  });

  it("Back goes to where the school came from (Add student), and the crumbs say so", async () => {
    server();
    const { router, user } = open("admit");
    await list();
    expect(screen.getByRole("navigation", { name: "Breadcrumb" })).toHaveTextContent("StudentsAdd studentManage fields");
    await user.click(screen.getByRole("button", { name: "Back to Add student" }));
    expect(router.state.location.pathname).toBe("/school/students/new");
    expect(await screen.findByText("The Add student page")).toBeInTheDocument();
  });

  it("opened from the Students page, Back goes there; opened directly, Back goes to the Students page too", async () => {
    server();
    const first = open("students");
    await list();
    await first.user.click(screen.getByRole("button", { name: "Back to Students" }));
    expect(first.router.state.location.pathname).toBe("/school/students");
    cleanup();
    const direct = open(null);
    await list();
    await direct.user.click(screen.getByRole("button", { name: "Back to Students" }));
    expect(direct.router.state.location.pathname).toBe("/school/students");
  });

  it("leaving with changes not saved asks first: Cancel stays with the changes, Leave drops them (nothing is sent)", async () => {
    const calls = server();
    const { router, user } = open("admit");
    await list();
    await user.click(screen.getByRole("switch", { name: "Religion on" }));
    await user.click(screen.getByRole("button", { name: "Back to Add student" }));
    expect(await screen.findByRole("dialog", { name: "Leave without saving?" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(router.state.location.pathname).toBe("/school/students/fields");
    expect(screen.getByRole("switch", { name: "Religion on" })).toBeChecked();

    await user.click(screen.getByRole("button", { name: "Back to Add student" }));
    await user.click(await screen.findByRole("button", { name: "Leave" }));
    expect(router.state.location.pathname).toBe("/school/students/new");
    expect(puts(calls)).toHaveLength(0);
  });

  it("a save the server refuses says why and keeps the changes; an empty heading is refused on screen first", async () => {
    server({
      "PUT /students/settings": () => new Response(JSON.stringify({ success: false, message: "Could not save the fields. Try again in a minute." }), { status: 500, headers: { "Content-Type": "application/json" } }),
    });
    const { user } = open();
    await list();
    await user.click(screen.getByRole("switch", { name: "Religion on" }));
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText("Could not save the fields. Try again in a minute.")).toBeInTheDocument();
    expect(screen.getByRole("switch", { name: "Religion on" })).toBeChecked();

    await user.click(screen.getByRole("button", { name: "Rename Gender in the Excel" }));
    await user.clear(screen.getByLabelText("Heading of Gender in the Excel"));
    await user.keyboard("{Enter}");
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText("Fix the headings marked in red first.")).toBeInTheDocument();
  });

  it("Back to the default asks first; a school's own field can be added here", async () => {
    server();
    const { user } = open();
    await list();
    expect(screen.queryByRole("button", { name: "Back to the default" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("switch", { name: "Religion on" }));
    await user.click(screen.getByRole("button", { name: "Back to the default" }));
    await user.click(await screen.findByRole("button", { name: "Use the default" }));
    expect(screen.getByText("All saved")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Add your own field/ }));
    expect(await screen.findByRole("dialog", { name: "Add your own field" })).toBeInTheDocument();
  });
});
