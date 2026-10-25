import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Provider } from "react-redux";
import { RouterProvider, createMemoryRouter } from "react-router";
import store from "../../../redux/store";
import { allApiSlices } from "../../../redux/api/apiRoot";
import { ToastProvider } from "../../../components/ui/toast-context";
import type { ImportSheet } from "../../../types";
import { defaultLayout } from "../../../utils/exportLayout";
import { fakeApi as pretendApi, spreadsheet, type Handler } from "../../../test/fakeApi";
import { CAPACITY, SETTINGS, STRUCTURE } from "../../../test/fixtures";
import StudentImportPage from "../StudentImport";

/** Every row has the address and the school it comes from (the details every school needs), so only what a test is about is wrong. */
const HOME = ["12 MG Road", "Bhopal", "MP", "462001", "Little Flower School"];
/** The school's own sheet: no Section column although Class 6 has sections; "Class 9" (not a class of the school) twice. */
const SHEET: ImportSheet = {
  fileName: "list.csv",
  sheetName: "",
  headerRow: 1,
  headers: ["Student Name", "Class", "Gender", "DOB", "Father Name", "Mobile No", "Address", "City", "State", "PIN", "Previous School"],
  rows: [
    { row: 2, cells: ["Asha Verma", "Class 1", "F", "14-05-2016", "Ravi Verma", "9876543210", ...HOME] },
    { row: 3, cells: ["Sara Khan", "6", "F", "03-03-2015", "Imran Khan", "9866677788", ...HOME] },
    { row: 4, cells: ["Meera Joshi", "Class 9", "F", "01-01-2012", "Kiran Joshi", "9844455566", ...HOME] },
    { row: 5, cells: ["Neel Joshi", "Class 9", "M", "02-02-2012", "Kiran Joshi", "9844455566", ...HOME] },
  ],
};

// ---- A pretend API: every request is answered here and remembered ------------------------------------------------------------

/** The school's reads and the file it reads, with what a test answers differently on top. */
const fakeApi = (extra: Record<string, Handler> = {}) =>
  pretendApi({
    "GET /academics/structure": () => STRUCTURE,
    "GET /students/capacity": () => CAPACITY,
    "GET /students/settings": () => SETTINGS,
    "POST /students/import/read": () => SHEET,
    ...extra,
  });

function openPage() {
  const router = createMemoryRouter(
    [
      { path: "/school/students/import", element: <StudentImportPage /> },
      { path: "/school/students", element: <p>The students</p> },
    ],
    { initialEntries: ["/school/students/import"] }
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

/** Picks the school's file in step 1; the table opens. */
async function openFile(user: ReturnType<typeof userEvent.setup>) {
  await screen.findByText("Drag and drop your students file here");
  await user.upload(document.getElementById("students-file") as HTMLInputElement, new File(["(the sheet)"], "list.csv", { type: "text/csv" }));
  return screen.findByRole("table", { name: "Your file" });
}
const box = (title: string, row: number) => screen.getByLabelText(`${title}, row ${row}`, { selector: "input" });
const said = (title: string, row: number) => box(title, row).parentElement?.querySelector("p")?.textContent;
const uploadButton = () => screen.getByRole("button", { name: /^Upload \d+ students?$/ });

afterEach(() => {
  // The page leaves first, so nothing on screen asks the API again when the cache is emptied for the next test.
  cleanup();
  for (const api of allApiSlices) store.dispatch(api.util.resetApiState());
  vi.unstubAllGlobals();
});

describe("Bulk upload: step 1", () => {
  it("says why when the sample file could not be made, and saves nothing", async () => {
    const saved: string[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      saved.push(this.download);
    });
    fakeApi({
      "GET /students/import/template": () => new Response(JSON.stringify({ success: false, message: "The sample file could not be made. Try again in a minute." }), { status: 500, headers: { "Content-Type": "application/json" } }),
    });
    const user = openPage();
    await screen.findByText("Drag and drop your students file here");
    await user.click(screen.getByRole("button", { name: "Download sample template" }));
    expect(await screen.findByText("The sample file could not be made. Try again in a minute.")).toBeInTheDocument();
    expect(saved).toEqual([]);
    // The button is there to be pressed again.
    await waitFor(() => expect(screen.getByRole("button", { name: "Download sample template" })).toBeEnabled());
  });

  it("offers the sample Excel (the only place it is offered now): one request when pressed, saved under the server's name", async () => {
    const saved: string[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      saved.push(this.download);
    });
    const calls = fakeApi({ "GET /students/import/template": () => spreadsheet("students-template-sunrise-public-school.xlsx") });
    const user = openPage();
    await screen.findByText("Drag and drop your students file here");
    expect(calls.filter((c) => c.path === "/students/import/template")).toHaveLength(0);
    await user.click(screen.getByRole("button", { name: "Download sample template" }));
    await waitFor(() => expect(saved).toEqual(["students-template-sunrise-public-school.xlsx"]));
    expect(calls.filter((c) => c.path === "/students/import/template")).toHaveLength(1);
  });
});

describe("Bulk upload: Preview & fix is just the table", () => {
  it("opens a file with an empty Section column added, red boxes that say why, and no panels above the table", async () => {
    const calls = fakeApi();
    const user = openPage();
    await openFile(user);
    expect(calls.map((c) => `${c.method} ${c.path}`).sort()).toEqual(["GET /academics/structure", "GET /students/capacity", "GET /students/settings", "POST /students/import/read"]);

    // Class 6 has sections and the file has no Section column: one is added, empty, at the right.
    expect(screen.getByRole("button", { name: /What the column "Section" is$/ })).toHaveTextContent("Section");
    expect(box("Section", 3)).toHaveAttribute("aria-invalid", "true");
    expect(said("Section", 3)).toBe("Class 6 has sections A: type one");
    expect(box("Class", 3)).not.toHaveAttribute("aria-invalid");
    expect(said("Class", 4)).toBe('Your school has no "Class 9": type one of your classes');
    for (const gone of ["Your school also wants", "Missing in your file", "One class of the file is not in your school"]) {
      expect(screen.queryByText(new RegExp(gone))).not.toBeInTheDocument();
    }
    expect(uploadButton()).toHaveTextContent("Upload 1 student");
  });

  it("a file without an address or a previous school is accepted as it is: no such columns are added and every row is ready (an old register seldom holds them)", async () => {
    fakeApi({
      "POST /students/import/read": () => ({
        fileName: "bare.csv",
        sheetName: "",
        headerRow: 1,
        headers: ["Student Name", "Class", "Gender", "DOB", "Father Name", "Mobile No"],
        rows: [
          { row: 2, cells: ["Asha Verma", "Class 1", "F", "14-05-2016", "Ravi Verma", "9876543210"] },
          { row: 3, cells: ["Bina Rao", "Class 1", "F", "02-02-2016", "Anil Rao", "9111111111"] },
        ],
      }),
    });
    const user = openPage();
    await openFile(user);
    for (const absent of ["Address", "City", "State", "PIN code", "Previous school"]) {
      expect(screen.queryByRole("button", { name: new RegExp(`What the column "${absent}" is$`) }), absent).not.toBeInTheDocument();
    }
    // Both rows are ready as they are.
    expect(screen.getByRole("button", { name: /^Upload \d+ students?$/ })).toHaveTextContent("Upload 2 students");
  });

  it("fixes in place: the section typed in its box; a class changed once and the same change offered for the other row", async () => {
    const calls = fakeApi();
    const user = openPage();
    await openFile(user);
    const before = calls.length;

    await user.type(box("Section", 3), "A");
    await user.tab();
    expect(uploadButton()).toHaveTextContent("Upload 2 students");

    // A label in Status takes the person to the box.
    await user.click(within(screen.getByRole("list", { name: "Row 4 needs a fix" })).getByRole("button", { name: /^Class/ }));
    expect(box("Class", 4)).toHaveFocus();
    await user.clear(box("Class", 4));
    await user.type(box("Class", 4), "Class 1");
    await user.tab();
    expect(await screen.findByText(/1 more row has/)).toHaveTextContent('1 more row has "Class 9" in Class. Change it to "Class 1" too?');
    await user.click(screen.getByRole("button", { name: "Change it" }));
    expect(box("Class", 5)).toHaveValue("Class 1");
    expect(uploadButton()).toHaveTextContent("Upload 4 students");
    // Nothing is sent while the table is changed.
    expect(calls.length).toBe(before);
  });

  it('"Need a fix" keeps its rows while they are fixed; opened again, it shows what is left', async () => {
    fakeApi();
    const user = openPage();
    await openFile(user);
    await user.click(screen.getByRole("tab", { name: "Need a fix 3" }));
    const rows = () => within(screen.getByRole("table", { name: "Your file" })).getAllByRole("row").length - 1;
    expect(rows()).toBe(3);
    await user.type(box("Section", 3), "A");
    await user.tab();
    expect(rows()).toBe(3);
    await user.click(screen.getByRole("tab", { name: "Need a fix 2" }));
    expect(rows()).toBe(2);
  });

  it("makes a new field of the school's own from the + (saved once, at the end of the file) and sends its answers with the rows", async () => {
    const calls = fakeApi({
      "PUT /students/settings": (body) => ({ ...SETTINGS, ...(body as object), exportIsDefault: false }),
      "POST /students/import": () => ({
        dryRun: false,
        ok: 1,
        failed: 0,
        results: [{ row: 2, ok: true, errors: [], warnings: [], student: { id: "s1", name: "Asha Verma", admissionNumber: "ADM-2026-0001" } }],
      }),
    });
    const user = openPage();
    await openFile(user);

    await user.click(screen.getByRole("button", { name: "Add a column" }));
    await user.click(screen.getByRole("button", { name: "Not in the list? Create a new field of your own" }));
    const dialog = await screen.findByRole("dialog");
    await user.type(within(dialog).getByLabelText(/Name of the field/), "House");
    await user.click(within(dialog).getByRole("radio", { name: "List of choices" }));
    await user.type(within(dialog).getByLabelText(/Choices/), "Red{Enter}Blue");
    await user.click(within(dialog).getByRole("button", { name: "Add the field" }));

    expect(await screen.findByRole("button", { name: /What the column "House" is$/ })).toHaveTextContent("House (your own)");
    const put = calls.filter((c) => c.method === "PUT");
    expect(put).toHaveLength(1);
    const sent = put[0].body as { customFields: { key: string; label: string; options: string[] }[]; exportColumns: { key: string; heading: string }[] };
    expect(sent.customFields).toEqual([expect.objectContaining({ label: "House", type: "choice", options: ["Red", "Blue"], mode: "optional" })]);
    const key = sent.customFields[0].key;
    expect(sent.exportColumns).toEqual([...defaultLayout(), { key, heading: "House" }]);
    // The person is put in the new column's first box.
    expect(box("House", 2)).toHaveFocus();
    await user.type(box("House", 2), "red");
    await user.tab();

    await user.click(uploadButton());
    await user.click(await screen.findByRole("button", { name: "Upload and admit" }));
    expect(await screen.findByRole("heading", { name: "1 student admitted to 2026-2027" })).toBeInTheDocument();
    const imported = calls.find((c) => c.method === "POST" && c.path === "/students/import")!.body as { rows: { row: number; student: { custom?: object; classId: string } }[] };
    expect(imported.rows).toHaveLength(1);
    expect(imported.rows[0]).toMatchObject({ row: 2, student: { classId: "c1", custom: { [key]: "Red" } } });
  });

  it("keeps a change made in the table while the rows are being admitted", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    fakeApi({
      "POST /students/import": async () => {
        await gate;
        return { dryRun: false, ok: 1, failed: 0, results: [{ row: 2, ok: true, errors: [], warnings: [], student: { id: "s1", name: "Asha Verma", admissionNumber: "ADM-2026-0001" } }] };
      },
    });
    const user = openPage();
    await openFile(user);
    await user.click(uploadButton());
    await user.click(await screen.findByRole("button", { name: "Upload and admit" }));
    await screen.findByText("Admitting the students...");
    // Sara's section, typed while Asha is being admitted.
    await user.type(box("Section", 3), "A");
    await user.tab();
    release();
    await screen.findByRole("heading", { name: "1 student admitted to 2026-2027" });
    await user.click(screen.getByRole("button", { name: "Fix the 3 rows" }));
    expect(box("Section", 3)).toHaveValue("A");
    expect(screen.queryByLabelText("Student Name, row 2", { selector: "input" })).not.toBeInTheDocument();
  });
});
