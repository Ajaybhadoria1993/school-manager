import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Provider } from "react-redux";
import { RouterProvider, createMemoryRouter } from "react-router";
import { ToastProvider } from "../../../components/ui/toast-context";
import { DEFAULT_TEACHER_RULES } from "../../../constants/teacherFields";
import { allApiSlices } from "../../../redux/api/apiRoot";
import store from "../../../redux/store";
import { fakeApi, spreadsheet, type Call, type Handler } from "../../../test/fakeApi";
import { STRUCTURE } from "../../../test/schoolClass";
import { signInAs, signOut } from "../../../test/session";
import { ENGLISH, MATHS } from "../../../test/timetableFixtures";
import type { ExportPreview, UpdateTeacherSettingsInput, UserRole } from "../../../types";
import { defaultTeacherLayout } from "../../../utils/teacherLayout";
import TeacherExportPage from "../TeacherExport";

/**
 * Teacher > Export (2026-11-13), the way Students > Export works: the Excel's columns, the file before it is made, and the file. A school with
 * no teacher yet sees one sample row and downloads the same sample, so the file can be tried before the first teacher is added.
 */
const SAMPLE: ExportPreview = {
  total: 0,
  sample: true,
  rows: [{ name: "Sample Teacher", mobile: "9876500000", gender: "Female", dateOfBirth: "14-07-1988", designation: "PGT (Post graduate teacher)", status: "Teaching" }],
};
const TWO: ExportPreview = {
  total: 2,
  rows: [
    { name: "Asha Rao", mobile: "9000000011", gender: "Female", dateOfBirth: "", designation: "PGT (Post graduate teacher)", status: "Teaching" },
    { name: "Dev Patel", mobile: "9000000022", gender: "Male", dateOfBirth: "", designation: "", status: "Teaching" },
  ],
};

function openPage(path = "/teachers/export", preview: ExportPreview = TWO, extra: Record<string, Handler> = {}, who: { role?: UserRole; permissions?: string[] } = {}) {
  signInAs(who.role ?? "school_admin", who.permissions);
  const saved: string[] = [];
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
    saved.push(this.download);
  });
  vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: () => "blob:teachers", revokeObjectURL: () => {} }));
  let columns = defaultTeacherLayout([]);
  const calls = fakeApi({
    "GET /staff/teachers/settings": () => ({ fields: DEFAULT_TEACHER_RULES, customFields: [], exportColumns: columns, exportIsDefault: true }),
    "PUT /staff/teachers/settings": (body) => {
      columns = (body as UpdateTeacherSettingsInput).exportColumns ?? columns;
      return { fields: DEFAULT_TEACHER_RULES, customFields: [], exportColumns: columns, exportIsDefault: false };
    },
    "GET /staff/teachers/export/preview": () => preview,
    "GET /staff/teachers/export": () => spreadsheet("teachers-sunrise-public-school-2026-11-13.xlsx"),
    "GET /subjects": () => ({ items: [MATHS, ENGLISH] }),
    "GET /academics/structure": () => STRUCTURE,
    ...extra,
  });
  const router = createMemoryRouter(
    [
      { path: "/teachers/export", element: <TeacherExportPage /> },
      { path: "/school/teachers/export", element: <TeacherExportPage /> },
      { path: "/teachers/fields", element: <p>Teacher fields</p> },
      { path: "/teachers/inactive", element: <p>Teachers who have left</p> },
      { path: "/teachers", element: <p>All the teachers</p> },
      { path: "/school/teachers", element: <p>The Manage Teacher list</p> },
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
  return { calls, saved, router, user: userEvent.setup() };
}

afterEach(() => {
  signOut();
  cleanup();
  for (const api of allApiSlices) store.dispatch(api.util.resetApiState());
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const gets = (calls: Call[], path: string) => calls.filter((c) => c.method === "GET" && c.path === path);
const headings = () => within(screen.getByRole("table")).getAllByRole("columnheader").map((h) => h.textContent);

describe("Teacher > Export", () => {
  it("shows the Excel's columns closed and the file as it will be: the headings, then the first teachers", async () => {
    openPage();
    expect(await screen.findByRole("heading", { name: "Export teachers", level: 1 })).toBeInTheDocument();
    expect(await screen.findByText("2 teachers in the school")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Teacher" })).toBeInTheDocument();
    const table = await screen.findByRole("table");
    expect(headings()).toEqual(expect.arrayContaining(["Name", "Mobile", "Gender", "Date of Birth", "Designation", "Status"]));
    expect(within(table).getByText("Asha Rao")).toBeInTheDocument();
    expect(within(table).getByText("Dev Patel")).toBeInTheDocument();
    expect(screen.getByText(/The first 2 of 2 teachers/)).toBeInTheDocument();
    // The columns start closed (one line), the preview is what the page opens on.
    expect(screen.getByRole("button", { name: "Show the columns" })).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByRole("link", { name: "Manage fields" })).toHaveAttribute("href", "/teachers/fields");
    expect(screen.getByRole("button", { name: "Export" })).toBeEnabled();
    expect(screen.getByText("All saved")).toBeInTheDocument();
  });

  it("a school with no teacher yet sees one sample row, and downloads the sample file (the Export button was off before)", async () => {
    const { calls, saved, user } = openPage("/teachers/export?status=active", SAMPLE);
    expect(await screen.findByText("No teacher yet · a sample row")).toBeInTheDocument();
    expect(await screen.findByText("Sample Teacher")).toBeInTheDocument();
    expect(screen.getByText(/No teacher is added yet, so the file has this one sample row/)).toBeInTheDocument();
    const download = screen.getByRole("button", { name: "Download sample" });
    expect(download).toBeEnabled();
    expect(gets(calls, "/staff/teachers/export")).toHaveLength(0);
    await user.click(download);
    await waitFor(() => expect(saved).toEqual(["teachers-sunrise-public-school-2026-11-13.xlsx"]));
    expect(await screen.findByText("The sample file is downloaded")).toBeInTheDocument();
    expect(gets(calls, "/staff/teachers/export")).toHaveLength(1);
  });

  it("asks the server for the list's own teachers: its search and filters come along to the preview and to the file", async () => {
    const { calls, saved, user } = openPage("/teachers/export?status=all&q=asha&subject=maths&class=c5&designation=PGT%20(Post%20graduate%20teacher)");
    await screen.findByText("Asha Rao");
    const wanted = { status: "all", search: "asha", subjectId: "maths", classId: "c5", designation: "PGT (Post graduate teacher)" };
    expect(Object.fromEntries(new URLSearchParams(gets(calls, "/staff/teachers/export/preview")[0].query))).toEqual(wanted);
    await user.click(screen.getByRole("button", { name: "Export" }));
    await waitFor(() => expect(saved).toHaveLength(1));
    expect(Object.fromEntries(new URLSearchParams(gets(calls, "/staff/teachers/export")[0].query))).toEqual(wanted);
    expect(await screen.findByText("The teachers file is downloaded")).toBeInTheDocument();
  });

  it("says which teachers the file holds, and a press on it exports everyone instead", async () => {
    const { calls, user } = openPage("/teachers/export?status=inactive&q=asha");
    const chip = await screen.findByRole("button", { name: /Teachers who have left, matching "asha"/ });
    await user.click(chip);
    await waitFor(() => expect(gets(calls, "/staff/teachers/export/preview").length).toBeGreaterThan(1));
    expect(new URLSearchParams(gets(calls, "/staff/teachers/export/preview").at(-1)!.query).get("status")).toBe("active");
    expect(screen.queryByRole("button", { name: /matching "asha"/ })).not.toBeInTheDocument();
  });

  it("changes the columns in the page, saves them on Export first, then downloads the file", async () => {
    const { calls, saved, user } = openPage();
    await screen.findByText("Asha Rao");
    await user.click(screen.getByRole("button", { name: "Show the columns" }));
    const excel = within(screen.getByRole("region", { name: "Excel columns" }));
    await user.click(excel.getByRole("switch", { name: "Qualification in the Excel" }));
    expect(screen.getByText("Changes not saved yet")).toBeInTheDocument();
    expect(calls.filter((c) => c.method === "PUT")).toHaveLength(0);

    await user.click(screen.getByRole("button", { name: "Export" }));
    await waitFor(() => expect(saved).toHaveLength(1));
    const put = calls.filter((c) => c.method === "PUT");
    expect(put).toHaveLength(1);
    expect((put[0].body as UpdateTeacherSettingsInput).exportColumns?.map((c) => c.key)).not.toContain("qualification");
    // Saved before the file is made: the server makes it from what is saved.
    expect(calls.findIndex((c) => c.method === "PUT")).toBeLessThan(calls.findIndex((c) => c.path === "/staff/teachers/export"));
  });

  it("asks before leaving with columns not saved", async () => {
    const { router, user } = openPage();
    await screen.findByText("Asha Rao");
    await user.click(screen.getByRole("button", { name: "Show the columns" }));
    await user.click(within(screen.getByRole("region", { name: "Excel columns" })).getByRole("switch", { name: "Email in the Excel" }));
    await user.click(screen.getByRole("button", { name: "Teacher" }));
    const ask = await screen.findByRole("dialog", { name: "Leave without saving?" });
    await user.click(within(ask).getByRole("button", { name: "Cancel" }));
    expect(router.state.location.pathname).toBe("/teachers/export");
  });

  it("goes back to the list it came from: Manage Teacher from Manage Teacher, the Left list from the Left tab", async () => {
    const first = openPage("/school/teachers/export");
    await screen.findByText("Asha Rao");
    await first.user.click(screen.getByRole("button", { name: "Manage Teacher" }));
    await waitFor(() => expect(first.router.state.location.pathname).toBe("/school/teachers"));
    cleanup();

    const second = openPage("/teachers/export?status=inactive");
    await screen.findByText("Asha Rao");
    await second.user.click(screen.getByRole("button", { name: "Teacher" }));
    await waitFor(() => expect(second.router.state.location.pathname).toBe("/teachers/inactive"));
  });

  it("says why the file could not be made, and keeps the page as it was", async () => {
    const { saved, user } = openPage("/teachers/export", TWO, {
      "GET /staff/teachers/export": () => new Response(JSON.stringify({ success: false, message: "The file could not be made. Try again in a minute." }), { status: 500, headers: { "Content-Type": "application/json" } }),
    });
    await screen.findByText("Asha Rao");
    await user.click(screen.getByRole("button", { name: "Export" }));
    expect(await screen.findByText("The file could not be made. Try again in a minute.")).toBeInTheDocument();
    expect(saved).toEqual([]);
    await waitFor(() => expect(screen.getByRole("button", { name: "Export" })).toBeEnabled());
  });

  it("a person who may export but not change the school's fields sees the preview and the Export button only", async () => {
    const { saved, user } = openPage("/teachers/export", TWO, {}, { role: "receptionist", permissions: ["teachers.view", "teachers.export"] });
    await screen.findByText("Asha Rao");
    expect(screen.queryByRole("region", { name: "Excel columns" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Manage fields" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Save" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Export" }));
    await waitFor(() => expect(saved).toHaveLength(1));
  });
});
