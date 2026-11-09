import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Provider } from "react-redux";
import { RouterProvider, createMemoryRouter } from "react-router";
import store from "../../../redux/store";
import { allApiSlices } from "../../../redux/api/apiRoot";
import { ToastProvider } from "../../../components/ui/toast-context";
import type { CustomFieldDef } from "../../../constants/studentFields";
import type { ImportSheet } from "../../../types";
import { fakeApi as pretendApi, type Call, type Handler } from "../../../test/fakeApi";
import { ENGLISH, MATHS } from "../../../test/timetableFixtures";
import TeacherImportPage from "../TeacherImport";

/**
 * The school's own fields in the teachers' bulk upload (2026-11-07): whatever the Excel holds can come in. A column that is the name of
 * one of the school's fields is read as it; a column that is no detail can be made a field of its own, one by one or all at once.
 */
const PAN: CustomFieldDef = { key: "c_pan00001", label: "PAN Number", type: "text", options: [], mode: "optional" };
const BLOOD: CustomFieldDef = { key: "c_blood001", label: "Blood Group", type: "choice", options: ["A+", "B+", "O+"], mode: "optional" };

const SHEET: ImportSheet = {
  fileName: "staff.xlsx",
  sheetName: "Teachers",
  headerRow: 1,
  headers: ["Name *", "Mobile *", "PAN Number", "Blood Group", "Hobby", "Remarks"],
  rows: [
    { row: 2, cells: ["Meena Singh", "9876543210", " abcde1234f ", "b+", "Chess", "senior"] },
    { row: 3, cells: ["Dev Patel", "9876500000", "", "Z+", "", ""] },
  ],
};

type Body = { rows: { row: number; teacher: Record<string, unknown> }[] };
const madeAll = (body: unknown) => {
  const results = (body as Body).rows.map((r) => ({ row: r.row, ok: true, errors: [], teacher: { id: `t${r.row}`, name: String(r.teacher.name) }, login: { username: `user_${r.row}`, password: `Gen@${r.row}Pw` } }));
  return { results, ok: results.length, failed: 0 };
};

function fakeApi(initial: CustomFieldDef[], extra: Record<string, Handler> = {}, sheet: ImportSheet = SHEET) {
  let fields = initial;
  return pretendApi({
    "GET /subjects": () => ({ items: [MATHS, ENGLISH] }),
    "GET /staff/teachers/settings": () => ({ customFields: fields }),
    "PUT /staff/teachers/settings": (body) => {
      fields = (body as { customFields: CustomFieldDef[] }).customFields;
      return { customFields: fields };
    },
    "POST /staff/teachers/import/read": () => sheet,
    "POST /staff/teachers/import": madeAll,
    ...extra,
  });
}

function openPage() {
  const router = createMemoryRouter([{ path: "/school/teachers/import", element: <TeacherImportPage /> }, { path: "/school/teachers", element: <p>list</p> }], { initialEntries: ["/school/teachers/import"] });
  render(
    <Provider store={store}>
      <ToastProvider>
        <RouterProvider router={router} />
      </ToastProvider>
    </Provider>
  );
  return userEvent.setup({ applyAccept: false });
}

type U = ReturnType<typeof userEvent.setup>;
async function openFile(user: U) {
  await screen.findByText("Drag and drop your teachers file here");
  // The school's fields are known before a file is picked (they are read with the page).
  await waitFor(() => expect(screen.getByRole("link", { name: "Manage fields" })).toBeInTheDocument());
  await user.upload(document.getElementById("teachers-file") as HTMLInputElement, new File(["(the sheet)"], "staff.xlsx"));
  return screen.findByRole("table", { name: "Your file" });
}
const box = (title: string, row: number) => screen.getByLabelText(`${title}, row ${row}`, { selector: "input" });
const said = (title: string, row: number) => box(title, row).parentElement?.querySelector("p")?.textContent;
const heading = (title: string) => screen.getByRole("button", { name: new RegExp(`What the column "${title}" is$`) });
const puts = (calls: Call[]) => calls.filter((c) => c.method === "PUT" && c.path === "/staff/teachers/settings");
const imports = (calls: Call[]) => calls.filter((c) => c.method === "POST" && c.path === "/staff/teachers/import");

afterEach(() => {
  cleanup();
  for (const api of allApiSlices) store.dispatch(api.util.resetApiState());
  vi.unstubAllGlobals();
});

describe("Bulk upload of teachers: the school's own fields", () => {
  it("reads a column that is the name of one of the school's fields as that field, and sends its answers by key", async () => {
    const calls = fakeApi([PAN, BLOOD]);
    const user = openPage();
    await openFile(user);
    expect(heading("PAN Number")).toHaveTextContent("PAN Number (your own)");
    expect(heading("Blood Group")).toHaveTextContent("Blood Group (your own)");
    // A box is shown as it is kept: the list's own name for a choice.
    await user.click(box("PAN Number", 2));
    await user.tab();
    expect(said("Blood Group", 3)).toBe("Choose the Blood Group from the list");
    await user.clear(box("Blood Group", 3));
    await user.type(box("Blood Group", 3), "o+");
    await user.tab();
    expect(box("Blood Group", 3)).toHaveValue("O+");
    await user.click(screen.getByRole("button", { name: /^Upload \d+ teachers?$/ }));
    await user.click(await screen.findByRole("button", { name: "Upload and add" }));
    await screen.findByRole("heading", { name: "2 teachers added" });
    expect((imports(calls)[0].body as Body).rows.map((r) => r.teacher.custom)).toEqual([
      { c_pan00001: "abcde1234f", c_blood001: "B+" },
      { c_blood001: "O+" },
    ]);
  });

  it("says in the field's box what the server refused", async () => {
    fakeApi([PAN, BLOOD], {
      "POST /staff/teachers/import": () => ({
        results: [
          { row: 2, ok: true, errors: [], teacher: { id: "t2", name: "Meena Singh" }, login: { username: "u2", password: "Gen@2Pw" } },
          { row: 3, ok: false, errors: [{ path: "custom.c_blood001", message: "Choose the Blood Group from the list" }] },
        ],
        ok: 1,
        failed: 1,
      }),
    }, { ...SHEET, rows: [SHEET.rows[0], { row: 3, cells: ["Dev Patel", "9876500000", "", "O+", "", ""] }] });
    const user = openPage();
    await openFile(user);
    await user.click(screen.getByRole("button", { name: /^Upload 2 teachers$/ }));
    await user.click(await screen.findByRole("button", { name: "Upload and add" }));
    await screen.findByRole("heading", { name: "1 teacher added" });
    await user.click(screen.getByRole("button", { name: "Fix the 1 row" }));
    expect(said("Blood Group", 3)).toBe("Choose the Blood Group from the list");
  });

  it("offers the columns that are no detail as new fields, all at once: one save, and the file comes in as it is", async () => {
    const calls = fakeApi([PAN, BLOOD]);
    const user = openPage();
    await openFile(user);
    const notice = screen.getByRole("status", { name: "Columns not uploaded" });
    expect(notice).toHaveTextContent("2 columns of your file are not uploaded: Hobby, Remarks");
    expect(puts(calls)).toHaveLength(0);
    await user.click(within(notice).getByRole("button", { name: "Add them as your own fields" }));
    await waitFor(() => expect(heading("Hobby")).toHaveTextContent("Hobby (your own)"));
    expect(puts(calls)).toHaveLength(1);
    const saved = (puts(calls)[0].body as { customFields: CustomFieldDef[] }).customFields;
    expect(saved.slice(0, 2)).toEqual([PAN, BLOOD]);
    expect(saved.slice(2).map((f) => [f.label, f.type, f.mode])).toEqual([["Hobby", "text", "optional"], ["Remarks", "text", "optional"]]);
    expect(saved[2].key).toMatch(/^c_[a-z0-9]{4,16}$/);
    expect(heading("Remarks")).toHaveTextContent("Remarks (your own)");
    expect(screen.queryByRole("status", { name: "Columns not uploaded" })).not.toBeInTheDocument();

    await user.clear(box("Blood Group", 3));
    await user.type(box("Blood Group", 3), "O+");
    await user.tab();
    await user.click(screen.getByRole("button", { name: /^Upload \d+ teachers?$/ }));
    await user.click(await screen.findByRole("button", { name: "Upload and add" }));
    await screen.findByRole("heading", { name: "2 teachers added" });
    const custom = (imports(calls)[0].body as Body).rows[0].teacher.custom as Record<string, unknown>;
    expect(Object.values(custom).sort()).toEqual(["Chess", "abcde1234f", "B+", "senior"].sort());
  });

  it("a column left as Not uploaded stays out; one that is a field already is not offered again as a new one", async () => {
    const calls = fakeApi([PAN, BLOOD]);
    const user = openPage();
    await openFile(user);
    await user.click(heading("Remarks"));
    await user.click(await screen.findByRole("option", { name: "Not uploaded" }));
    expect(screen.getByRole("status", { name: "Columns not uploaded" })).toHaveTextContent("2 columns");
    await user.click(heading("PAN Number"));
    await user.click(await screen.findByRole("option", { name: "Not uploaded" }));
    // PAN Number is a field of the school: leaving its column out was the person's choice, so it is not offered as a new field.
    expect(screen.getByRole("status", { name: "Columns not uploaded" })).toHaveTextContent("2 columns of your file are not uploaded: Hobby, Remarks");
    expect(heading("PAN Number")).toHaveTextContent("Not uploaded");
    expect(puts(calls)).toHaveLength(0);
  });

  it("makes one column a field from its heading: the dialog has the file's title, and the column becomes the field", async () => {
    const calls = fakeApi([PAN, BLOOD]);
    const user = openPage();
    await openFile(user);
    await user.click(heading("Hobby"));
    await user.click(await screen.findByRole("option", { name: "Add a new field…" }));
    const dialog = await screen.findByRole("dialog", { name: "Add your own field" });
    expect(within(dialog).getByLabelText(/^Name of the field/)).toHaveValue("Hobby");
    expect(dialog).toHaveTextContent("As Add teacher and the Excel show it");
    await user.click(within(dialog).getByRole("button", { name: "Add the field" }));
    await waitFor(() => expect(heading("Hobby")).toHaveTextContent("Hobby (your own)"));
    expect(puts(calls)).toHaveLength(1);
    expect((puts(calls)[0].body as { customFields: CustomFieldDef[] }).customFields.map((f) => f.label)).toEqual(["PAN Number", "Blood Group", "Hobby"]);
    // Only that column: the other one is still waiting in the notice.
    expect(screen.getByRole("status", { name: "Columns not uploaded" })).toHaveTextContent("1 column of your file is not uploaded: Remarks");
  });

  it("does not let a field take the name of a usual detail (Mobile, Designation...), in the teachers' words", async () => {
    fakeApi([PAN, BLOOD]);
    const user = openPage();
    await openFile(user);
    await user.click(heading("Hobby"));
    await user.click(await screen.findByRole("option", { name: "Add a new field…" }));
    const dialog = await screen.findByRole("dialog", { name: "Add your own field" });
    await user.clear(within(dialog).getByLabelText(/^Name of the field/));
    await user.type(within(dialog).getByLabelText(/^Name of the field/), "Mobile");
    await user.click(within(dialog).getByRole("button", { name: "Add the field" }));
    expect(await within(dialog).findByText("There is already a field called Mobile")).toBeInTheDocument();
  });

  it("says why when the fields could not be saved, and keeps the columns as they were", async () => {
    fakeApi([PAN, BLOOD], {
      "PUT /staff/teachers/settings": () => new Response(JSON.stringify({ success: false, message: "Up to 20 fields of your own" }), { status: 400, headers: { "Content-Type": "application/json" } }),
    });
    const user = openPage();
    await openFile(user);
    await user.click(within(screen.getByRole("status", { name: "Columns not uploaded" })).getByRole("button", { name: "Add them as your own fields" }));
    expect(await screen.findByText("Up to 20 fields of your own")).toBeInTheDocument();
    expect(heading("Hobby")).toHaveTextContent("Not uploaded");
  });

  it("leads to Manage fields from the first step", async () => {
    fakeApi([PAN]);
    openPage();
    expect(await screen.findByRole("link", { name: "Manage fields" })).toHaveAttribute("href", "/school/teachers/fields");
  });
});
