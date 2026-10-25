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
  await user.click(await screen.findByRole("button", { name: "Show the fields" }));
  return screen.findByRole("list", { name: "Fields" });
};
const puts = (calls: ReturnType<typeof fakeApi>) => calls.filter((c) => c.method === "PUT");

afterEach(() => {
  cleanup();
  for (const api of allApiSlices) store.dispatch(api.util.resetApiState());
  vi.unstubAllGlobals();
});

describe("Export students: the school's fields and its Excel on one page", () => {
  it("opens with the fields closed and everything saved, and says how many students the file will have", async () => {
    school(3);
    openPage();
    expect(await screen.findByRole("heading", { name: "Export students" })).toBeInTheDocument();
    expect(await screen.findByText("3 students this year")).toBeInTheDocument();
    expect(screen.getByText(/\d+ on · \d+ off/)).toBeInTheDocument();
    expect(screen.getByText("All saved")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Export" })).toBeEnabled();
  });

  it("turning a field on and making another mandatory is one Save: one PUT with only what changed, and the page is saved again", async () => {
    const calls = school(3);
    const user = openPage();
    await openFields(user);
    await user.click(screen.getByRole("switch", { name: "Religion on" }));
    await user.click(screen.getByRole("switch", { name: "Blood Group mandatory" }));
    expect(screen.getByText("Changes not saved yet")).toBeInTheDocument();
    expect(puts(calls)).toHaveLength(0);

    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText("All saved")).toBeInTheDocument();
    expect(puts(calls)).toHaveLength(1);
    const sent = puts(calls)[0].body as { fields: Record<string, string>; exportColumns: { key: string }[]; customFields?: unknown };
    expect(sent.fields).toEqual({ religion: "optional", bloodGroup: "required" });
    expect(sent.exportColumns.at(-1)).toEqual({ key: "religion", heading: "Religion" });
    expect(sent.customFields).toBeUndefined();
  });

  it("a field switched off stays in its place, dimmed, and is saved as not asked", async () => {
    const calls = school(3);
    const user = openPage();
    const list = await openFields(user);
    const before = [...list.querySelectorAll("li")].map((li) => li.textContent);
    await user.click(screen.getByRole("switch", { name: "Blood Group on" }));
    const after = [...screen.getByRole("list", { name: "Fields" }).querySelectorAll("li")].map((li) => li.textContent);
    expect(after.length).toBe(before.length);
    await user.click(screen.getByRole("button", { name: "Save" }));
    await screen.findByText("All saved");
    expect((puts(calls)[0].body as { fields: Record<string, string> }).fields).toEqual({ bloodGroup: "hidden" });
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
    await user.click(screen.getByRole("switch", { name: "Religion on" }));
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
    await user.click(screen.getByRole("switch", { name: "Religion on" }));
    await user.click(screen.getByRole("button", { name: "Save" }));
    await screen.findByText("All saved");
    expect(puts(calls)).toHaveLength(1);
  });

  it("Back to the default asks first and then puts a new school's list back, to be saved with Save", async () => {
    const calls = school(3);
    const user = openPage();
    await openFields(user);
    expect(screen.queryByRole("button", { name: "Back to the default" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("switch", { name: "Religion on" }));
    await user.click(screen.getByRole("button", { name: "Back to the default" }));
    await user.click(await screen.findByRole("button", { name: "Use the default" }));
    // The page equals what is saved again: nothing to save, nothing sent.
    expect(screen.getByText("All saved")).toBeInTheDocument();
    expect(puts(calls)).toHaveLength(0);
  });
});
