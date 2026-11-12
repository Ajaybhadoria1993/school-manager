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
/** The school's own sheet: no Section column although Class 6 has sections (no problem: it is placed); "Class 9" (not a class of the school) twice. */
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
    // Nobody in the file is a student the school already has, unless a test says so.
    "POST /students/import/match": () => ({ matches: [] }),
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
  it("opens a file with red boxes that say why, no Section column (it is placed, not asked), and no panels above the table", async () => {
    const calls = fakeApi();
    const user = openPage();
    await openFile(user);
    // One read of the file, and ONE question about the whole file: which of its students the school already has.
    await waitFor(() => expect(calls.filter((c) => c.path === "/students/import/match")).toHaveLength(1));
    expect(calls.map((c) => `${c.method} ${c.path}`).sort()).toEqual([
      "GET /academics/structure",
      "GET /students/capacity",
      "GET /students/settings",
      "POST /students/import/match",
      "POST /students/import/read",
    ]);

    // Class 6 has sections and the file has no Section column: none is added, and the row is no problem (it is placed in a section).
    expect(screen.queryByRole("combobox", { name: /What the column "Section" is$/ })).not.toBeInTheDocument();
    expect(box("Class", 3)).not.toHaveAttribute("aria-invalid");
    expect(said("Class", 4)).toBe('Your school has no "Class 9": type one of your classes');
    for (const gone of ["Your school also wants", "Missing in your file", "One class of the file is not in your school"]) {
      expect(screen.queryByText(new RegExp(gone))).not.toBeInTheDocument();
    }
    expect(uploadButton()).toHaveTextContent("Upload 2 students");
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
      expect(screen.queryByRole("combobox", { name: new RegExp(`What the column "${absent}" is$`) }), absent).not.toBeInTheDocument();
    }
    // Both rows are ready as they are.
    expect(screen.getByRole("button", { name: /^Upload \d+ students?$/ })).toHaveTextContent("Upload 2 students");
  });

  it("fixes in place: a class changed once and the same change offered for the other row", async () => {
    const calls = fakeApi();
    const user = openPage();
    await openFile(user);
    const before = calls.length;

    // Asha (Class 1) and Sara (Class 6, placed in its section) are ready; the two Class 9 rows are not.
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

  it("a section is never a reason to stop a row: no Section column is added, a class with sections places its students, and the table says where", async () => {
    fakeApi({
      "POST /students/import/read": () => ({
        fileName: "no-sections.csv",
        sheetName: "",
        headerRow: 1,
        headers: ["Student Name", "Class", "Gender", "DOB", "Father Name", "Mobile No"],
        rows: [
          { row: 2, cells: ["Sara Khan", "6", "F", "03-03-2015", "Imran Khan", "9866677788"] },
          { row: 3, cells: ["Tina Das", "Class 6", "F", "04-04-2015", "Amit Das", "9866677799"] },
          { row: 4, cells: ["Uma Rao", "Class 1", "F", "05-05-2016", "Anil Rao", "9111111111"] },
        ],
      }),
    });
    const user = openPage();
    const table = await openFile(user);
    expect(screen.queryByRole("combobox", { name: /What the column "Section" is$/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("list", { name: /needs a fix/ })).not.toBeInTheDocument();
    expect(within(table).getAllByText("Ready")).toHaveLength(3);
    // Class 6 is split into sections (only A here): both of its students are in it, said under Ready. Class 1 has none: nothing is said.
    expect(screen.getAllByText("Goes to Class 6 - A")).toHaveLength(2);
    expect(screen.queryByText(/Goes to Class 1/)).not.toBeInTheDocument();
    expect(uploadButton()).toHaveTextContent("Upload 3 students");
  });

  it("sends the section the table chose, a section the file names that the class does not have is said (never a red box), and nothing is asked of the server for it", async () => {
    const calls = fakeApi({
      "POST /students/import/read": () => ({
        fileName: "odd.csv",
        sheetName: "",
        headerRow: 1,
        headers: ["Student Name", "Class", "Section", "Gender", "DOB", "Father Name", "Mobile No"],
        rows: [{ row: 2, cells: ["Sara Khan", "6", "C", "F", "03-03-2015", "Imran Khan", "9866677788"] }],
      }),
      "POST /students/import": () => ({ dryRun: false, ok: 1, failed: 0, results: [{ row: 2, ok: true, errors: [], warnings: [], student: { id: "s1", name: "Sara Khan", admissionNumber: "ADM-2026-0001" } }] }),
    });
    const user = openPage();
    await openFile(user);
    expect(box("Section", 2)).not.toHaveAttribute("aria-invalid");
    expect(screen.getByText('Class 6 has no section "C": the student goes to section A.')).toBeInTheDocument();
    await user.click(uploadButton());
    await user.click(await screen.findByRole("button", { name: "Upload and admit" }));
    await screen.findByRole("heading", { name: "1 student admitted to 2026-2027" });
    const sent = calls.find((c) => c.method === "POST" && c.path === "/students/import");
    expect((sent?.body as { rows: { student: { classId: string; sectionId: string } }[] }).rows[0].student).toMatchObject({ classId: "c6", sectionId: "c6-A" });
  });

  it('"Need a fix" keeps its rows while they are fixed; opened again, it shows what is left', async () => {
    fakeApi();
    const user = openPage();
    await openFile(user);
    await user.click(screen.getByRole("tab", { name: "Need a fix 2" }));
    const rows = () => within(screen.getByRole("table", { name: "Your file" })).getAllByRole("row").length - 1;
    expect(rows()).toBe(2);
    await user.clear(box("Class", 4));
    await user.type(box("Class", 4), "Class 1");
    await user.tab();
    expect(rows()).toBe(2);
    await user.click(screen.getByRole("tab", { name: "Need a fix 1" }));
    expect(rows()).toBe(1);
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

    expect(await screen.findByRole("combobox", { name: /What the column "House" is$/ })).toHaveValue("House (your own)");
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
    // Asha (Class 1) and Sara (Class 6, placed in its section) are ready: both are sent.
    expect(imported.rows).toHaveLength(2);
    expect(imported.rows[0]).toMatchObject({ row: 2, student: { classId: "c1", custom: { [key]: "Red" } } });
  });

  it("makes a new field from a column's own heading (named as the file calls it), and that same column becomes it", async () => {
    const withRoute: ImportSheet = {
      ...SHEET,
      headers: [...SHEET.headers, "Locker No"],
      rows: SHEET.rows.map((r) => ({ ...r, cells: [...r.cells, "L-12"] })),
    };
    const calls = fakeApi({
      "POST /students/import/read": () => withRoute,
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
    const headings = () => screen.getAllByRole("combobox", { name: /What the column/ }).length;
    const before = headings();
    const route = screen.getByRole("combobox", { name: /What the column "Locker No" is$/ });
    expect(route).toHaveValue("Not uploaded");

    // Nothing in the list is a locker number: the last row makes it, with the heading's own name ready in the dialog.
    await user.click(route);
    await user.click(await screen.findByRole("option", { name: "Add a new field…" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByLabelText(/Name of the field/)).toHaveValue("Locker No");
    await user.click(within(dialog).getByRole("button", { name: "Add the field" }));

    // The column itself is the field now (no column was added), with the file's own answers in it.
    await waitFor(() => expect(screen.getByRole("combobox", { name: /What the column "Locker No" is$/ })).toHaveValue("Locker No (your own)"));
    expect(headings()).toBe(before);
    expect(box("Locker No", 2)).toHaveValue("L-12");
    const put = calls.filter((c) => c.method === "PUT");
    expect(put).toHaveLength(1);
    const sent = put[0].body as { customFields: { key: string; label: string; type: string }[]; exportColumns: { key: string; heading: string }[] };
    expect(sent.customFields).toEqual([expect.objectContaining({ label: "Locker No", type: "text", mode: "optional" })]);
    const key = sent.customFields[0].key;
    expect(sent.exportColumns).toEqual([...defaultLayout(), { key, heading: "Locker No" }]);

    await user.click(uploadButton());
    await user.click(await screen.findByRole("button", { name: "Upload and admit" }));
    expect(await screen.findByRole("heading", { name: "1 student admitted to 2026-2027" })).toBeInTheDocument();
    const imported = calls.find((c) => c.method === "POST" && c.path === "/students/import")!.body as { rows: { student: { custom?: object } }[] };
    expect(imported.rows[0].student.custom).toEqual({ [key]: "L-12" });
  });

  it("Age cannot be added from a heading (it is worked out from the date of birth): the list says so, and another name makes the field for the file's ages", async () => {
    const withAge: ImportSheet = { ...SHEET, headers: [...SHEET.headers, "Age"], rows: SHEET.rows.map((r, i) => ({ ...r, cells: [...r.cells, String(6 + i)] })) };
    const calls = fakeApi({
      "POST /students/import/read": () => withAge,
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
    const age = screen.getByRole("combobox", { name: /What the column "Age" is$/ });
    expect(age).toHaveValue("Not uploaded");

    await user.click(age);
    await user.keyboard("Age");
    expect(await screen.findByRole("option", { name: /^Age is worked out from the Date of birth, so it is not uploaded/ })).toHaveAttribute("aria-disabled", "true");
    expect(screen.queryByRole("option", { name: /as a new field/ })).not.toBeInTheDocument();

    await user.keyboard(" in file");
    await user.click(await screen.findByRole("option", { name: "Add “Age in file” as a new field" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByLabelText(/Name of the field/)).toHaveValue("Age in file");
    await user.click(within(dialog).getByRole("radio", { name: "Number" }));
    await user.click(within(dialog).getByRole("button", { name: "Add the field" }));

    await waitFor(() => expect(screen.getByRole("combobox", { name: /What the column "Age" is$/ })).toHaveValue("Age in file (your own)"));
    const put = calls.filter((c) => c.method === "PUT");
    expect(put).toHaveLength(1);
    const sent = put[0].body as { customFields: { key: string; label: string; type: string }[] };
    expect(sent.customFields).toEqual([expect.objectContaining({ label: "Age in file", type: "number" })]);
    const key = sent.customFields[0].key;

    await user.click(uploadButton());
    await user.click(await screen.findByRole("button", { name: "Upload and admit" }));
    expect(await screen.findByRole("heading", { name: "1 student admitted to 2026-2027" })).toBeInTheDocument();
    const imported = calls.find((c) => c.method === "POST" && c.path === "/students/import")!.body as { rows: { student: { custom?: object } }[] };
    // A number field's answer goes as a number.
    expect(imported.rows[0].student.custom).toEqual({ [key]: 6 });
  });

  it("the window to add a field says why a taken name is refused: Age is worked out, not switched on", async () => {
    fakeApi();
    const user = openPage();
    await openFile(user);
    await user.click(screen.getByRole("button", { name: "Add a column" }));
    await user.click(screen.getByRole("button", { name: "Not in the list? Create a new field of your own" }));
    const dialog = await screen.findByRole("dialog");
    await user.type(within(dialog).getByLabelText(/Name of the field/), "Age");
    await user.click(within(dialog).getByRole("button", { name: "Add the field" }));
    expect(within(dialog).getByText("Age is worked out from the Date of birth: give your field another name")).toBeInTheDocument();
    await user.clear(within(dialog).getByLabelText(/Name of the field/));
    await user.type(within(dialog).getByLabelText(/Name of the field/), "Religion");
    await user.click(within(dialog).getByRole("button", { name: "Add the field" }));
    expect(within(dialog).getByText("There is already a field called Religion: switch it on in the list")).toBeInTheDocument();
  });

  it("a word typed in a heading becomes the new field's name, and Cancel in the dialog leaves the column as it was", async () => {
    const withRoute: ImportSheet = { ...SHEET, headers: [...SHEET.headers, "Locker No"], rows: SHEET.rows.map((r) => ({ ...r, cells: [...r.cells, "L-12"] })) };
    const calls = fakeApi({ "POST /students/import/read": () => withRoute, "PUT /students/settings": () => SETTINGS });
    const user = openPage();
    await openFile(user);
    const route = screen.getByRole("combobox", { name: /What the column "Locker No" is$/ });
    await user.click(route);
    await user.keyboard("Bag colour");
    await user.click(await screen.findByRole("option", { name: "Add “Bag colour” as a new field" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByLabelText(/Name of the field/)).toHaveValue("Bag colour");
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: /What the column "Locker No" is$/ })).toHaveValue("Not uploaded");
    expect(calls.filter((c) => c.method === "PUT")).toHaveLength(0);
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
    // Meera's class, typed while Asha is being admitted.
    await user.clear(box("Class", 4));
    await user.type(box("Class", 4), "Class 1");
    await user.tab();
    release();
    await screen.findByRole("heading", { name: "1 student admitted to 2026-2027" });
    await user.click(screen.getByRole("button", { name: "Fix the 3 rows" }));
    expect(box("Class", 4)).toHaveValue("Class 1");
    expect(screen.queryByLabelText("Student Name, row 2", { selector: "input" })).not.toBeInTheDocument();
  });
});

// ---- Class 11 and 12: the stream ------------------------------------------------------------------------------------------------

/** The school with Class 11 and 12 taught in streams (Science has sections A and B), and Class 11 as a whole from before. */
const WITH_STREAMS = {
  ...STRUCTURE,
  classes: [
    ...STRUCTURE.classes,
    { id: "c11", name: "Class 11", order: 11, departmentId: null, capacity: null, sections: [] },
    { id: "c11s", name: "Class 11 Science", order: 12, departmentId: null, capacity: null, sections: [{ id: "c11s-A", classId: "c11s", name: "A", capacity: 40, room: null }, { id: "c11s-B", classId: "c11s", name: "B", capacity: 40, room: null }] },
    { id: "c11c", name: "Class 11 Commerce", order: 13, departmentId: null, capacity: null, sections: [] },
  ],
};
const SENIORS: ImportSheet = {
  fileName: "seniors.csv",
  sheetName: "",
  headerRow: 1,
  headers: ["Student Name", "Class", "Gender", "DOB", "Father Name", "Mobile No"],
  rows: [
    { row: 2, cells: ["Ria Sen", "11", "F", "03-03-2010", "Amit Sen", "9866600001"] },
    { row: 3, cells: ["Tia Sen", "Class 11", "F", "04-04-2010", "Amit Sen", "9866600002"] },
    { row: 4, cells: ["Uma Rao", "11 Commerce", "F", "05-05-2010", "Anil Rao", "9866600003"] },
    { row: 5, cells: ["Veer Rao", "Class 6", "M", "06-06-2015", "Anil Rao", "9866600004"] },
  ],
};

describe("Bulk upload: Class 11 and 12 are put in a stream", () => {
  it("adds a Stream column for the rows that name Class 11 without one; their boxes say what to type, and nothing is uploaded for them", async () => {
    fakeApi({ "GET /academics/structure": () => WITH_STREAMS, "POST /students/import/read": () => SENIORS });
    const user = openPage();
    const table = await openFile(user);
    expect(screen.getByRole("combobox", { name: /What the column "Stream" is$/ })).toHaveValue("Stream");
    // The two rows that name Class 11 as a whole need the stream; the one with its stream in the class cell and Class 6 are ready.
    expect(box("Stream", 2)).toHaveAttribute("aria-invalid", "true");
    expect(said("Stream", 2)).toBe("Class 11 is taught in streams: type one of Science, Commerce");
    expect(box("Stream", 3)).toHaveAttribute("aria-invalid", "true");
    expect(box("Stream", 4)).not.toHaveAttribute("aria-invalid");
    expect(within(table).getAllByText("Ready")).toHaveLength(2);
    expect(uploadButton()).toHaveTextContent("Upload 2 students");
    // The stream of a row that has one in its class cell is not asked again; Class 11 as a whole is never offered as the answer.
    expect(said("Class", 2)).toBeUndefined();
  });

  it("typing the stream makes the row ready, in that stream's class; the stream's sections are shared out", async () => {
    const calls = fakeApi({
      "GET /academics/structure": () => WITH_STREAMS,
      "POST /students/import/read": () => SENIORS,
      "POST /students/import": () => ({ dryRun: false, ok: 4, failed: 0, results: [okRow(2, "Ria Sen"), okRow(3, "Tia Sen"), okRow(4, "Uma Rao"), okRow(5, "Veer Rao")] }),
    });
    const user = openPage();
    await openFile(user);
    await user.type(box("Stream", 2), "Science");
    await user.tab();
    expect(box("Stream", 2)).not.toHaveAttribute("aria-invalid");
    expect(uploadButton()).toHaveTextContent("Upload 3 students");
    await user.type(box("Stream", 3), "Science");
    await user.tab();
    expect(uploadButton()).toHaveTextContent("Upload 4 students");

    await user.click(uploadButton());
    await user.click(await screen.findByRole("button", { name: "Upload and admit" }));
    await screen.findByRole("heading", { name: "4 students admitted to 2026-2027" });
    const sent = (calls.find((c) => c.method === "POST" && c.path === "/students/import")!.body as { rows: { row: number; student: { classId: string; sectionId: string | null } }[] }).rows;
    // Science has sections A and B: the two students are shared between them. Commerce has none. Class 11 as a whole is never sent.
    expect(sent.map((r) => [r.row, r.student.classId, r.student.sectionId])).toEqual([
      [2, "c11s", "c11s-A"],
      [3, "c11s", "c11s-B"],
      [4, "c11c", null],
      [5, "c6", "c6-A"],
    ]);
  });

  it("a stream the school does not have is said in the Stream box, and the school's Class 11 as a whole is not an answer", async () => {
    fakeApi({ "GET /academics/structure": () => WITH_STREAMS, "POST /students/import/read": () => SENIORS });
    const user = openPage();
    await openFile(user);
    await user.type(box("Stream", 2), "Arts");
    await user.tab();
    expect(said("Stream", 2)).toBe('Class 11 has no stream "Arts": Science, Commerce');
    expect(box("Stream", 2)).toHaveAttribute("aria-invalid", "true");
  });
});

// ---- Students the school already has ----------------------------------------------------------------------------------------

/** Four students, three of them with a number of the school's own register: what a school brings in. */
const ROSTER: ImportSheet = {
  fileName: "roster.csv",
  sheetName: "",
  headerRow: 1,
  headers: ["Adm No", "Student Name", "Class", "Gender", "DOB", "Father Name", "Mobile No", "Address", "City", "State", "PIN", "Previous School"],
  rows: [
    { row: 2, cells: ["2019/45", "Asha Verma", "Class 1", "F", "14-05-2016", "Ravi Verma", "9876543210", ...HOME] },
    { row: 3, cells: ["", "Bina Rao", "Class 1", "F", "02-02-2016", "Anil Rao", "9111111111", ...HOME] },
    { row: 4, cells: ["2019/47", "Kabir Roy", "Class 1", "M", "03-03-2016", "Sunil Roy", "9222222222", ...HOME] },
    { row: 5, cells: ["", "Dev Nair", "Class 1", "M", "04-04-2016", "Anil Nair", "9333333333", ...HOME] },
  ],
};
/** A student the school has, as the server describes them. */
const saved = (name: string, over: Record<string, unknown> = {}) => ({
  id: `s-${name}`,
  name,
  admissionNumber: "ADM-2026-0001",
  dateOfBirth: "2016-05-14",
  className: "Class 1",
  sectionName: null,
  inactive: false,
  ...over,
});
const tab = (name: RegExp) => screen.findByRole("tab", { name });
const importCalls = (calls: { method: string; path: string; body: unknown }[]) => calls.filter((c) => c.method === "POST" && c.path === "/students/import");
const uploaded = (call: { body: unknown }) => (call.body as { rows: { row: number }[] }).rows.map((r) => r.row);
const okRow = (row: number, name: string) => ({ row, ok: true, errors: [], warnings: [], student: { id: `n${row}`, name, admissionNumber: `ADM-2026-00${row}` } });

describe("Bulk upload: students the school already has", () => {
  it("asks the server ONCE for the whole file, with only what tells one child from another", async () => {
    const calls = fakeApi({ "POST /students/import/read": () => ROSTER });
    const user = openPage();
    await openFile(user);
    await waitFor(() => expect(calls.filter((c) => c.path === "/students/import/match")).toHaveLength(1));
    const asked = calls.find((c) => c.path === "/students/import/match")!.body as { rows: Record<string, unknown>[] };
    expect(asked.rows).toHaveLength(4);
    expect(asked.rows[0]).toEqual({ row: 2, firstName: "Asha", lastName: "Verma", dateOfBirth: "2016-05-14", mobile: "9876543210", admissionNumber: "2019/45" });
    // No number in the register for Bina: none is sent. Nothing else of the row (the address, the class) leaves the screen.
    expect(asked.rows[1]).toEqual({ row: 3, firstName: "Bina", lastName: "Rao", dateOfBirth: "2016-02-02", mobile: "9111111111" });
  });

  it("another file chosen after the first is asked about too, with its own answer (the first file's answer is forgotten)", async () => {
    let file: ImportSheet = ROSTER;
    const calls = fakeApi({
      "POST /students/import/read": () => file,
      "POST /students/import/match": (body) => {
        const rows = (body as { rows: { row: number }[] }).rows;
        // Only the first file has a student the school already has.
        return { matches: file === ROSTER ? [{ row: rows[0].row, kind: "same", student: saved("Asha Verma") }] : [] };
      },
    });
    const user = openPage();
    await openFile(user);
    await tab(/^Already in school\s*1$/);

    file = { ...ROSTER, fileName: "second.csv", rows: ROSTER.rows.slice(1) };
    await user.click(screen.getAllByRole("button", { name: "Choose another file" })[0]);
    await openFile(user);
    await waitFor(() => expect(calls.filter((c) => c.path === "/students/import/match")).toHaveLength(2));
    await waitFor(() => expect(uploadButton()).toBeEnabled());
    expect(uploadButton()).toHaveTextContent("Upload 3 students");
    expect(screen.queryByRole("tab", { name: /^Already in school/ })).not.toBeInTheDocument();
  });

  it("a student the school already has is shown as such, not uploaded, and costs the person nothing to fix; another child's number is a fix, and a maybe is a note", async () => {
    const calls = fakeApi({
      "POST /students/import/read": () => ROSTER,
      "POST /students/import/match": () => ({
        matches: [
          { row: 2, kind: "same", student: saved("Asha Verma") },
          { row: 3, kind: "maybe", student: saved("Bina Rao", { admissionNumber: "ADM-2026-0002", dateOfBirth: "2016-02-02" }) },
          { row: 4, kind: "number", student: saved("Meera Joshi", { admissionNumber: "2019/47" }) },
        ],
      }),
      "POST /students/import": () => ({ dryRun: false, ok: 2, failed: 0, results: [okRow(3, "Bina Rao"), okRow(5, "Dev Nair")] }),
    });
    const user = openPage();
    await openFile(user);

    await tab(/^Already in school\s*1$/);
    expect(screen.getByRole("tab", { name: /^Need a fix\s*1$/ })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /^Ready\s*2$/ })).toBeInTheDocument();
    expect(screen.getByText(/4 rows/)).toHaveTextContent("4 rows · 2 ready · 1 need a fix · 1 already in your school");
    expect(uploadButton()).toHaveTextContent("Upload 2 students");

    // Row 2: who they are and where; no red anywhere in it.
    expect(screen.getByText("Already in your school")).toBeInTheDocument();
    expect(screen.getByText("Asha Verma · ADM-2026-0001 · Class 1")).toBeInTheDocument();
    expect(screen.queryByRole("list", { name: "Row 2 needs a fix" })).not.toBeInTheDocument();
    // Row 3: ready, with the note.
    expect(screen.getByText(/^Maybe the same student as Bina Rao \(ADM-2026-0002, Class 1\)/)).toBeInTheDocument();
    // Row 4: the number is another child's.
    const fix = within(screen.getByRole("list", { name: "Row 4 needs a fix" })).getByRole("button", { name: /^Admission no\./ });
    expect(fix).toHaveAccessibleName("Admission no.: Admission number 2019/47 is already Meera Joshi's (Class 1)");

    await user.click(uploadButton());
    // The window says what will not be uploaded, and why.
    expect(await screen.findByText("The 1 row that need a fix are not uploaded; they stay in the table.")).toBeInTheDocument();
    expect(screen.getByText("The 1 row already in your school is not uploaded again.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Upload and admit" }));
    // Only the ready rows were sent; the student the school has is not.
    expect(await screen.findByRole("heading", { name: "2 students admitted to 2026-2027" })).toBeInTheDocument();
    expect(importCalls(calls)).toHaveLength(1);
    expect(uploaded(importCalls(calls)[0])).toEqual([3, 5]);
    expect(screen.getByText("1 row was already in your school: it was not admitted again.")).toBeInTheDocument();
    // The one row still to fix is counted without the student already there.
    expect(screen.getByRole("button", { name: "Fix the 1 row" })).toBeInTheDocument();
  });

  it("the same file again: every student is already there, nothing is left to upload, and it says so", async () => {
    const calls = fakeApi({
      "POST /students/import/read": () => ROSTER,
      "POST /students/import/match": () => ({ matches: ROSTER.rows.map((r) => ({ row: r.row, kind: "same", student: saved(r.cells[1], { admissionNumber: r.cells[0] || "ADM-2026-0009" }) })) }),
    });
    const user = openPage();
    await openFile(user);
    await tab(/^Already in school\s*4$/);
    expect(screen.getByText("Every student of this file is already in your school. There is nothing new to upload.")).toBeInTheDocument();
    expect(uploadButton()).toHaveTextContent("Upload 0 students");
    expect(uploadButton()).toBeDisabled();
    expect(screen.getByRole("tab", { name: /^Need a fix\s*0$/ })).toBeInTheDocument();
    expect(importCalls(calls)).toHaveLength(0);
  });

  it("a row that is already in the school needs no fix, whatever else is wrong with it", async () => {
    fakeApi({
      // Row 4 of the sample file is in "Class 9", which the school does not have.
      "POST /students/import/match": () => ({ matches: [{ row: 4, kind: "same", student: saved("Meera Joshi") }] }),
    });
    const user = openPage();
    await openFile(user);
    await tab(/^Already in school\s*1$/);
    expect(screen.getByRole("tab", { name: /^Need a fix\s*1$/ })).toBeInTheDocument();
    expect(screen.queryByRole("list", { name: "Row 4 needs a fix" })).not.toBeInTheDocument();
    expect(box("Class", 4)).not.toHaveAttribute("aria-invalid");
  });

  it("a change to the name, the birthday, the mobile or the number takes the answer back (the server decides at the upload); another change keeps it, and nothing more is asked", async () => {
    const calls = fakeApi({
      "POST /students/import/read": () => ROSTER,
      "POST /students/import/match": () => ({ matches: [{ row: 2, kind: "same", student: saved("Asha Verma") }] }),
    });
    const user = openPage();
    await openFile(user);
    await tab(/^Already in school\s*1$/);
    const asked = () => calls.filter((c) => c.path === "/students/import/match").length;
    expect(asked()).toBe(1);

    // The city is not who the child is.
    await user.clear(box("City", 2));
    await user.type(box("City", 2), "Indore");
    await user.tab();
    expect(screen.getByRole("tab", { name: /^Already in school\s*1$/ })).toBeInTheDocument();

    // A name is.
    await user.clear(box("Student Name", 2));
    await user.type(box("Student Name", 2), "Asha Verma Rao");
    await user.tab();
    await waitFor(() => expect(screen.queryByRole("tab", { name: /^Already in school/ })).not.toBeInTheDocument());
    // Row 2 is a student of the file like the others now: all four are ready.
    expect(uploadButton()).toHaveTextContent("Upload 4 students");
    expect(asked()).toBe(1);
  });

  it("when the file cannot be checked the table works as before and says so; the server still refuses a student already there, and the row moves to Already in school", async () => {
    const calls = fakeApi({
      "POST /students/import/match": () => new Response(JSON.stringify({ success: false, message: "Try again in a minute." }), { status: 500, headers: { "Content-Type": "application/json" } }),
      "POST /students/import": () => ({
        dryRun: false,
        ok: 0,
        failed: 1,
        results: [
          {
            row: 2,
            ok: false,
            code: "DUPLICATE_STUDENT",
            errors: [{ path: "", message: "Asha Verma, born on 14-05-2016, is already in your school with the same primary guardian's mobile number: ADM-2026-0001 (Class 1)." }],
            warnings: [],
          },
        ],
      }),
    });
    const user = openPage();
    await openFile(user);
    expect(await screen.findByText(/could not be checked against the students already in your school/)).toBeInTheDocument();
    expect(uploadButton()).toHaveTextContent("Upload 2 students");

    await user.click(uploadButton());
    await user.click(await screen.findByRole("button", { name: "Upload and admit" }));
    expect(await screen.findByRole("heading", { name: "No student was admitted" })).toBeInTheDocument();
    expect(importCalls(calls)).toHaveLength(1);
    expect(screen.getByText("1 row was already in your school: it was not admitted again.")).toBeInTheDocument();
    // The three other rows are still in the table (the answer named only Asha); the refused one is not one of them.
    expect(screen.getByRole("button", { name: "Fix the 3 rows" })).toBeInTheDocument();
    await user.click(screen.getByRole("tab", { name: /^Already in school\s*1$/ }));
    expect(screen.getAllByText(/Asha Verma, born on 14-05-2016, is already in your school/).length).toBeGreaterThan(0);
  });

  it("the same name and birthday twice in the file, with another parent's mobile, is a note on the later row; the row is still ready", async () => {
    const twice: ImportSheet = {
      ...ROSTER,
      rows: [
        { row: 2, cells: ["", "Asha Verma", "Class 1", "F", "14-05-2016", "Ravi Verma", "9876543210", ...HOME] },
        { row: 3, cells: ["", "Asha Verma", "Class 1", "F", "14-05-2016", "Mohan Verma", "9811122233", ...HOME] },
      ],
    };
    fakeApi({ "POST /students/import/read": () => twice });
    const user = openPage();
    await openFile(user);
    expect(await screen.findByText("Maybe the same student as row 2: the same name and date of birth, but not the same parent's mobile number")).toBeInTheDocument();
    expect(uploadButton()).toHaveTextContent("Upload 2 students");
  });
});

describe("Bulk upload: more students than seats", () => {
  // Class 6 has one section (A, 30 seats) with 29 students already: one seat left, and three come in this file.
  const BIG: ImportSheet = {
    ...SHEET,
    fileName: "big.csv",
    rows: [
      { row: 2, cells: ["Sara Khan", "Class 6", "F", "03-03-2015", "Imran Khan", "9866677788", ...HOME] },
      { row: 3, cells: ["Tina Das", "Class 6", "F", "04-04-2015", "Amit Das", "9866677799", ...HOME] },
      { row: 4, cells: ["Uma Rao", "Class 6", "F", "05-05-2015", "Anil Rao", "9111111111", ...HOME] },
    ],
  };
  const almostFull = () => ({ ...CAPACITY, sections: [{ sectionId: "c6-A", classId: "c6", capacity: 30, enrolled: 29, seatsLeft: 1, nextRollNumber: 30 }] });
  const raised = { classId: "c6", className: "Class 6", sectionId: "c6-A", sectionName: "A", from: 30, to: 32, classFrom: null, classTo: null };

  it("asks nothing about seats: the note says the seats will grow, the upload goes over them, and the end says what was raised and to divide the class", async () => {
    const calls = fakeApi({
      "POST /students/import/read": () => BIG,
      "GET /students/capacity": almostFull,
      "POST /students/import": () => ({ dryRun: false, ok: 3, failed: 0, seatsRaised: [raised], results: [okRow(2, "Sara Khan"), okRow(3, "Tina Das"), okRow(4, "Uma Rao")] }),
    });
    const user = openPage();
    await openFile(user);
    // Before the upload: a note, no question and no checkbox.
    expect(screen.getByText("Class 6 - A will get more seats")).toBeInTheDocument();
    expect(screen.getByText(/3 students in the file, 1 seat left/)).toBeInTheDocument();
    expect(screen.getByText(/Recommended: divide Class 6 into more sections/)).toBeInTheDocument();
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    expect(uploadButton()).toHaveTextContent("Upload 3 students");

    await user.click(uploadButton());
    expect(screen.queryByText(/only up to their seats/)).not.toBeInTheDocument();
    await user.click(await screen.findByRole("button", { name: "Upload and admit" }));
    await screen.findByRole("heading", { name: "3 students admitted to 2026-2027" });
    // Every row was sent with the yes already given, and none was refused for the seats.
    expect(importCalls(calls)[0].body).toMatchObject({ dryRun: false, allowOverCapacity: true });
    expect(screen.getByText("Class 6 - A: seats raised from 30 to 32.")).toBeInTheDocument();
    expect(screen.getByText(/Recommended: divide Class 6 into more sections/)).toBeInTheDocument();
  });

  it("a section that has room for everyone shows no note, and the end says nothing about seats", async () => {
    fakeApi({
      "POST /students/import/read": () => BIG,
      "POST /students/import": () => ({ dryRun: false, ok: 3, failed: 0, seatsRaised: [], results: [okRow(2, "Sara Khan"), okRow(3, "Tina Das"), okRow(4, "Uma Rao")] }),
    });
    const user = openPage();
    await openFile(user);
    expect(screen.queryByText(/will get more seats/)).not.toBeInTheDocument();
    await user.click(uploadButton());
    await user.click(await screen.findByRole("button", { name: "Upload and admit" }));
    await screen.findByRole("heading", { name: "3 students admitted to 2026-2027" });
    expect(screen.queryByText(/Recommended: divide/)).not.toBeInTheDocument();
  });
});
