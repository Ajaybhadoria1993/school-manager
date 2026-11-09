import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Provider } from "react-redux";
import { RouterProvider, createMemoryRouter } from "react-router";
import { ToastProvider } from "../../../components/ui/toast-context";
import { allApiSlices } from "../../../redux/api/apiRoot";
import store from "../../../redux/store";
import type { ExportPreview, StudentSettings } from "../../../types";
import { fakeApi, spreadsheet, type Handler } from "../../../test/fakeApi";
import { SETTINGS, STRUCTURE } from "../../../test/fixtures";
import StudentExportPage from "../StudentExport";

const PREVIEW = (total: number): ExportPreview => ({ total, rows: total > 0 ? [{ studentName: "Asha Verma", className: "Class 1", gender: "Female" }] : [] });

/** The school's reads of this page; PUT answers with the settings as the server would keep them. */
function school(total: number, extra: Record<string, Handler> = {}) {
  let now: StudentSettings = SETTINGS;
  return fakeApi({
    "GET /academics/structure": () => STRUCTURE,
    "GET /students/settings": () => now,
    "GET /students/export/preview": () => PREVIEW(total),
    "PUT /students/settings": (body) => {
      const input = body as { fields?: object; customFields?: StudentSettings["customFields"]; exportColumns?: StudentSettings["exportColumns"] | null };
      now = {
        ...now,
        fields: { ...now.fields, ...input.fields },
        customFields: input.customFields ?? now.customFields,
        exportColumns: input.exportColumns ?? now.exportColumns,
        exportIsDefault: input.exportColumns === null,
      };
      return now;
    },
    ...extra,
  });
}

function openPage() {
  const router = createMemoryRouter(
    [
      { path: "/school/students/export", element: <StudentExportPage /> },
      { path: "/school/students", element: <p>The students</p> },
    ],
    { initialEntries: ["/school/students/export"] }
  );
  render(
    <Provider store={store}>
      <ToastProvider>
        <RouterProvider router={router} />
      </ToastProvider>
    </Provider>
  );
  return userEvent.setup();
}

const openFields = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.click(await screen.findByRole("button", { name: "Show the columns" }));
  return screen.findByRole("list", { name: "Columns" });
};
const puts = (calls: ReturnType<typeof fakeApi>) => calls.filter((c) => c.method === "PUT");

afterEach(() => {
  cleanup();
  for (const api of allApiSlices) store.dispatch(api.util.resetApiState());
  vi.unstubAllGlobals();
});

describe("Export students: the Excel's columns and the file on one page", () => {
  it("opens with the fields closed and everything saved, and says how many students the file will have", async () => {
    school(3);
    openPage();
    expect(await screen.findByRole("heading", { name: "Export students" })).toBeInTheDocument();
    expect(await screen.findByText("3 students this year")).toBeInTheDocument();
    expect(screen.getByText(/\d+ in the Excel · \d+ out/)).toBeInTheDocument();
    expect(screen.getByText("All saved")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Export" })).toBeEnabled();
  });

  it("a column put in the file and a detail made mandatory are one Save: one PUT with only what changed, and the page is saved again", async () => {
    const calls = school(3);
    const user = openPage();
    await openFields(user);
    await user.click(screen.getByRole("switch", { name: "Religion in the Excel" }));
    await user.click(screen.getByRole("switch", { name: "Blood Group mandatory" }));
    expect(screen.getByText("Changes not saved yet")).toBeInTheDocument();
    expect(puts(calls)).toHaveLength(0);

    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText("All saved")).toBeInTheDocument();
    expect(puts(calls)).toHaveLength(1);
    const sent = puts(calls)[0].body as { fields: Record<string, string>; exportColumns: { key: string }[]; customFields?: unknown };
    // The column is the Excel's alone: what Add student asks is not changed by it (only Mandatory is shared).
    expect(sent.fields).toEqual({ bloodGroup: "required" });
    expect(sent.exportColumns.at(-1)).toEqual({ key: "religion", heading: "Religion" });
    expect(sent.customFields).toBeUndefined();
  });

  it("a column taken out of the file stays in its place, dimmed, and what the form asks is not changed", async () => {
    const calls = school(3);
    const user = openPage();
    const list = await openFields(user);
    const before = [...list.querySelectorAll("li")].map((li) => li.textContent);
    await user.click(screen.getByRole("switch", { name: "Blood Group in the Excel" }));
    const after = [...screen.getByRole("list", { name: "Columns" }).querySelectorAll("li")].map((li) => li.textContent);
    expect(after.length).toBe(before.length);
    await user.click(screen.getByRole("button", { name: "Save" }));
    await screen.findByText("All saved");
    const sent = puts(calls)[0].body as { fields?: unknown; exportColumns: { key: string }[] };
    expect(sent.fields).toBeUndefined();
    expect(sent.exportColumns.some((c) => c.key === "bloodGroup")).toBe(false);
  });

  it("the column of a mandatory detail cannot be taken out here; Mandatory is the form's setting too", async () => {
    school(3);
    const user = openPage();
    await openFields(user);
    expect(screen.getByRole("switch", { name: "Aadhaar No. in the Excel" })).toBeDisabled();
    await user.click(screen.getByRole("switch", { name: "Aadhaar No. mandatory" }));
    expect(screen.getByRole("switch", { name: "Aadhaar No. in the Excel" })).toBeEnabled();
  });

  it("a heading typed over is saved with the layout; an empty one is refused on screen before anything is sent", async () => {
    const calls = school(3);
    const user = openPage();
    await openFields(user);
    await user.click(screen.getByRole("button", { name: "Rename Gender in the Excel" }));
    const box = screen.getByLabelText("Heading of Gender in the Excel");
    await user.clear(box);
    await user.keyboard("{Enter}");
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText("Fix the headings marked in red first.")).toBeInTheDocument();
    expect(puts(calls)).toHaveLength(0);

    await user.click(screen.getByRole("button", { name: "Rename Gender in the Excel" }));
    const again = screen.getByLabelText("Heading of Gender in the Excel");
    await user.type(again, "Sex{Enter}");
    await user.click(screen.getByRole("button", { name: "Save" }));
    await screen.findByText("All saved");
    expect((puts(calls)[0].body as { exportColumns: { key: string; heading: string }[] }).exportColumns.find((c) => c.key === "gender")).toEqual({ key: "gender", heading: "Sex" });
  });

  it("Export saves a change first, then downloads (two requests, in that order); with no students there is nothing to export", async () => {
    const saved: string[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      saved.push(this.download);
    });
    const calls = school(3, { "GET /students/export": () => spreadsheet("students-sunrise.xlsx") });
    const user = openPage();
    await openFields(user);
    await user.click(screen.getByRole("switch", { name: "Religion in the Excel" }));
    await user.click(screen.getByRole("button", { name: "Export" }));
    await waitFor(() => expect(saved).toEqual(["students-sunrise.xlsx"]));
    expect(calls.filter((c) => c.method === "PUT" || c.path === "/students/export").map((c) => `${c.method} ${c.path}`)).toEqual(["PUT /students/settings", "GET /students/export"]);
  });

  it("with no students yet the fields can still be set and saved; only Export is out of reach", async () => {
    const calls = school(0);
    const user = openPage();
    expect(await screen.findByText("0 students this year")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Export" })).toBeDisabled();
    await openFields(user);
    await user.click(screen.getByRole("switch", { name: "Religion in the Excel" }));
    await user.click(screen.getByRole("button", { name: "Save" }));
    await screen.findByText("All saved");
    expect(puts(calls)).toHaveLength(1);
  });

  it("with no student admitted the preview shows one sample row, says so, and Export downloads that sample file", async () => {
    const saved: string[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      saved.push(this.download);
    });
    const calls = school(0, {
      "GET /students/export/preview": () => ({ total: 0, sample: true, rows: [{ studentName: "Sample Student", className: "Class 5", gender: "Female" }] }),
      "GET /students/export": () => spreadsheet("students-sunrise.xlsx"),
    });
    const user = openPage();
    expect(await screen.findByText("Sample Student")).toBeInTheDocument();
    expect(screen.getByText(/No student is admitted yet/)).toBeInTheDocument();
    expect(screen.queryByText(/the file would only have the headings/)).not.toBeInTheDocument();
    const exportButton = screen.getByRole("button", { name: "Export" });
    expect(exportButton).toBeEnabled();
    await user.click(exportButton);
    await waitFor(() => expect(saved).toEqual(["students-sunrise.xlsx"]));
    expect(calls.some((c) => c.path === "/students/export")).toBe(true);
  });

  it("Back to the default asks first and then puts a new school's columns back (the form is not touched), to be saved with Save", async () => {
    const calls = school(3);
    const user = openPage();
    await openFields(user);
    expect(screen.queryByRole("button", { name: "Back to the default" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("switch", { name: "Religion in the Excel" }));
    await user.click(screen.getByRole("button", { name: "Back to the default" }));
    await user.click(await screen.findByRole("button", { name: "Use the default" }));
    // The page equals what is saved again: nothing to save, nothing sent.
    expect(screen.getByText("All saved")).toBeInTheDocument();
    expect(puts(calls)).toHaveLength(0);
  });
});
