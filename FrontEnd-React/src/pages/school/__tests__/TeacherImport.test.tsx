import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Provider } from "react-redux";
import { RouterProvider, createMemoryRouter } from "react-router";
import store from "../../../redux/store";
import { allApiSlices } from "../../../redux/api/apiRoot";
import { ToastProvider } from "../../../components/ui/toast-context";
import { FormBarSlotContext } from "../../../components/layout/FormBarSlot";
import type { ImportSheet } from "../../../types";
import { fakeApi as pretendApi, spreadsheet, type Call, type Handler } from "../../../test/fakeApi";
import { stubDownloads, textOf } from "../../../test/downloads";
import { ENGLISH, MATHS } from "../../../test/timetableFixtures";
import TeacherImportPage from "../TeacherImport";

/** The school's own sheet: the sample file's titles, two teachers; Sanskrit is not one of the school's subjects. */
const SHEET: ImportSheet = {
  fileName: "staff.xlsx",
  sheetName: "Teachers",
  headerRow: 2,
  headers: ["Name *", "Mobile *", "Gender", "Subjects"],
  rows: [
    { row: 3, cells: ["Meena Singh", "9876543210", "f", "Mathematics, Sanskrit"] },
    { row: 4, cells: ["Dev Patel", "9876500000", "M", "English"] },
  ],
};

type Body = { rows: { row: number; teacher: Record<string, unknown>; subjectNames: string[]; username?: string; password?: string }[] };
/** The server made every row: a username from the name, and a password for each row whose file gave none. */
const madeAll = (body: unknown) => {
  const results = (body as Body).rows.map((r) => ({
    row: r.row,
    ok: true,
    errors: [],
    teacher: { id: `t${r.row}`, name: String(r.teacher.name) },
    login: { username: r.username ?? `${String(r.teacher.name).toLowerCase().replace(/\W+/g, ".")}_41`, password: r.password ? null : `Gen@${r.row}Pw` },
  }));
  return { results, ok: results.length, failed: 0 };
};

const fakeApi = (extra: Record<string, Handler> = {}) =>
  pretendApi({
    "GET /subjects": () => ({ items: [MATHS, ENGLISH] }),
    "POST /staff/teachers/import/read": () => SHEET,
    "POST /staff/teachers/import": madeAll,
    ...extra,
  });

/** `slot`: the layout's bottom strip for a form's bar (the signed-in app has one; the page alone has none). */
function openPage(path = "/school/teachers/import", slot: HTMLElement | null = null) {
  const router = createMemoryRouter(
    [
      { path: "/school/teachers/import", element: <TeacherImportPage /> },
      { path: "/teachers/import", element: <TeacherImportPage /> },
      { path: "/school/teachers", element: <p>The Manage Teacher list</p> },
      { path: "/teachers", element: <p>All the teachers</p> },
    ],
    { initialEntries: [path] }
  );
  render(
    <Provider store={store}>
      <ToastProvider>
        <FormBarSlotContext.Provider value={slot}>
          <RouterProvider router={router} />
        </FormBarSlotContext.Provider>
      </ToastProvider>
    </Provider>
  );
  // applyAccept off: a file of the wrong kind must reach the page's own check (a browser's file window would have filtered it).
  return { router, user: userEvent.setup({ applyAccept: false }) };
}

type U = ReturnType<typeof userEvent.setup>;
/** Picks the school's file in step 1; the table opens. */
async function openFile(user: U, name = "staff.xlsx") {
  await screen.findByText("Drag and drop your teachers file here");
  await user.upload(document.getElementById("teachers-file") as HTMLInputElement, new File(["(the sheet)"], name));
  return screen.findByRole("table", { name: "Your file" });
}
const box = (title: string, row: number) => screen.getByLabelText(`${title}, row ${row}`, { selector: "input" });
const said = (title: string, row: number) => box(title, row).parentElement?.querySelector("p")?.textContent;
const uploadButton = () => screen.getByRole("button", { name: /^Upload \d+ teachers?$/ });
const writes = (calls: Call[]) => calls.filter((c) => c.method === "POST" && c.path === "/staff/teachers/import");

afterEach(() => {
  cleanup();
  for (const api of allApiSlices) store.dispatch(api.util.resetApiState());
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("Bulk upload of teachers: step 1", () => {
  it("is a page of its own under Manage Teacher, with the three steps and the sample file", async () => {
    fakeApi();
    openPage();
    expect(await screen.findByRole("heading", { name: "Bulk upload teachers", level: 1 })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Manage Teacher" })).toHaveAttribute("href", "/school/teachers");
    const steps = screen.getByRole("list", { name: "Steps of the bulk upload" });
    expect(within(steps).getAllByRole("listitem").map((li) => li.textContent?.replace(/\s*\((now|done)\)/, ""))).toEqual(["1Upload file", "2Preview & fix", "3Done"]);
    expect(screen.getByText("Drag and drop your teachers file here")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Download sample template" })).toBeInTheDocument();
  });

  it("opened from Teacher, it goes back to Teacher", async () => {
    fakeApi();
    openPage("/teachers/import");
    expect(await screen.findByRole("link", { name: "Teacher" })).toHaveAttribute("href", "/teachers");
    expect(screen.queryByRole("link", { name: "Manage Teacher" })).not.toBeInTheDocument();
  });

  it("offers the sample Excel: one request when pressed, saved under the server's name", async () => {
    const saved: string[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      saved.push(this.download);
    });
    vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: () => "blob:sample", revokeObjectURL: () => {} }));
    const calls = fakeApi({ "GET /staff/teachers/import/template": () => spreadsheet("teachers-template-sunrise-public-school.xlsx") });
    const { user } = openPage();
    await screen.findByText("Drag and drop your teachers file here");
    expect(calls.filter((c) => c.path === "/staff/teachers/import/template")).toHaveLength(0);
    await user.click(screen.getByRole("button", { name: "Download sample template" }));
    await waitFor(() => expect(saved).toEqual(["teachers-template-sunrise-public-school.xlsx"]));
    expect(calls.filter((c) => c.path === "/staff/teachers/import/template")).toHaveLength(1);
  });

  it("refuses a file of the wrong kind before it is sent, and says what the server says when it cannot read one", async () => {
    const calls = fakeApi({
      "POST /staff/teachers/import/read": () => new Response(JSON.stringify({ success: false, message: "This file could not be read as an Excel file." }), { status: 400, headers: { "Content-Type": "application/json" } }),
    });
    const { user } = openPage();
    await screen.findByText("Drag and drop your teachers file here");
    const input = document.getElementById("teachers-file") as HTMLInputElement;
    await user.upload(input, new File(["x"], "notes.pdf"));
    expect(await screen.findByRole("alert")).toHaveTextContent("Upload an Excel file (.xlsx) or a CSV file (.csv).");
    expect(calls.filter((c) => c.path === "/staff/teachers/import/read")).toHaveLength(0);
    await user.upload(input, new File(["x"], "broken.xlsx"));
    expect(await screen.findByText("This file could not be read as an Excel file.")).toBeInTheDocument();
  });
});

describe("Bulk upload of teachers: Preview & fix gives the room to the table", () => {
  it("has one Choose another file button, at the right of the title (not in a card of its own, not in the bottom bar)", async () => {
    fakeApi();
    const { user } = openPage();
    await openFile(user);
    const button = screen.getByRole("button", { name: "Choose another file" });
    expect(screen.getByRole("heading", { name: "Bulk upload teachers", level: 1 }).closest("header")).toContainElement(button);
    // The file is named in one line.
    expect(screen.getByText("staff.xlsx")).toBeInTheDocument();
    expect(screen.getByText(/Teachers$/)).toBeInTheDocument();
  });

  it("puts Upload at the very end of the page, under the table: not stuck to the bottom of the screen, not in the layout's bottom strip, in no card", async () => {
    fakeApi();
    const slot = document.createElement("div");
    document.body.appendChild(slot);
    const { user } = openPage("/school/teachers/import", slot);
    await openFile(user);
    // Two rows are ready; one more makes a row to fix.
    await user.clear(box("Name *", 4));
    await user.tab();
    // Nothing is pinned in the layout's strip (it stays empty and takes no room).
    expect(slot).toBeEmptyDOMElement();
    // The button comes after the table: it is met by scrolling down, it does not float over the rows.
    expect(screen.getByRole("table", { name: "Your file" }).compareDocumentPosition(uploadButton()) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    const around: string[] = [];
    for (let el = uploadButton().parentElement; el; el = el.parentElement) around.push(el.className);
    expect(around.join(" ")).not.toMatch(/sticky|fixed|bottom-|bg-|border|shadow|backdrop-blur/);
    // The count of rows to fix is on the "Need a fix" tab; for a screen reader the button still says why not all are uploaded.
    expect(screen.getByText("1 row needs a fix and is not uploaded.")).toBeInTheDocument();
    slot.remove();
  });

  it("lets the table grow with its rows, so the page scrolls and not a box inside it (only sideways inside the table)", async () => {
    fakeApi();
    const { user } = openPage();
    await openFile(user);
    const wrap = screen.getByRole("table", { name: "Your file" }).parentElement as HTMLElement;
    expect(wrap.className).not.toMatch(/max-h|overflow-y-auto|overflow-auto|min-h/);
    expect(wrap.className).toContain("overflow-x-auto");
  });

  it("keeps the three steps as a list, in one thin line that fills the row up to the file's name", async () => {
    fakeApi();
    const { user } = openPage();
    await openFile(user);
    const steps = screen.getByRole("list", { name: "Steps of the bulk upload" });
    expect(within(steps).getByRole("listitem", { current: "step" })).toHaveTextContent("Preview & fix");
    // The steps share the width of the row (the lines between them stretch), they are not bunched at its left.
    expect(within(steps).getAllByRole("listitem")[0].className).toContain("flex-1");
    expect(steps.parentElement?.parentElement?.className).toContain("flex-1");
  });
});

describe("Bulk upload of teachers: Preview & fix is just the table", () => {
  it("opens a file with its columns recognised, the boxes kept as they are, and nothing sent but the file", async () => {
    const calls = fakeApi();
    const { user } = openPage();
    await openFile(user);
    expect(calls.map((c) => `${c.method} ${c.path}`).sort()).toEqual(["GET /staff/teachers/settings", "GET /subjects", "POST /staff/teachers/import/read"]);
    // The counts are on the tabs of the table (the file's line above says only which file it is).
    expect(screen.getByRole("tab", { name: /^All rows\s*2$/ })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /^Ready\s*2$/ })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: /What the column "Name \*" is$/ })).toHaveValue("Name");
    expect(screen.getByRole("combobox", { name: /What the column "Mobile \*" is$/ })).toHaveValue("Mobile");
    expect(box("Name *", 3)).toHaveValue("Meena Singh");
    expect(uploadButton()).toHaveTextContent("Upload 2 teachers");
  });

  it("tells a subject the school does not have yet (it will be added), and nothing about the ones it has", async () => {
    fakeApi();
    const { user } = openPage();
    await openFile(user);
    expect(screen.getByText("New subject, added to your school: Sanskrit")).toBeInTheDocument();
    expect(screen.queryByText(/English/, { selector: "p" })).not.toBeInTheDocument();
  });

  it("adds an empty Name and Mobile column when the file has none, and the rows wait for them", async () => {
    fakeApi({ "POST /staff/teachers/import/read": () => ({ ...SHEET, headers: ["Sex", "Post"], rows: [{ row: 2, cells: ["F", "PGT"] }, { row: 3, cells: ["M", "TGT"] }] }) });
    const { user } = openPage();
    await openFile(user);
    expect(screen.getByRole("combobox", { name: /What the column "Name \*" is$/ })).toHaveValue("Name");
    expect(screen.getByRole("combobox", { name: /What the column "Mobile \*" is$/ })).toHaveValue("Mobile");
    expect(said("Name *", 2)).toBe("Enter the teacher's name");
    expect(said("Mobile *", 2)).toBe("Enter the teacher's mobile number: their login needs it");
    expect(screen.getByRole("button", { name: "Upload 0 teachers" })).toBeDisabled();
    await user.type(box("Name *", 2), "Asha Verma");
    await user.type(box("Mobile *", 2), "98765 43210");
    await user.tab();
    expect(box("Mobile *", 2)).toHaveValue("9876543210");
    expect(uploadButton()).toHaveTextContent("Upload 1 teacher");
  });

  it("marks a box that is wrong with its reason under it, and the row's Status takes the person to it", async () => {
    fakeApi({ "POST /staff/teachers/import/read": () => ({ ...SHEET, headers: ["Name *", "Mobile *", "Email"], rows: [{ row: 3, cells: ["Meena Singh", "9876543210", "not-an-email"] }, { row: 4, cells: ["Dev Patel", "9876500000", ""] }] }) });
    const { user } = openPage();
    await openFile(user);
    expect(box("Email", 3)).toHaveAttribute("aria-invalid", "true");
    expect(said("Email", 3)).toBe("Enter a valid email address");
    expect(box("Email", 4)).not.toHaveAttribute("aria-invalid");
    expect(uploadButton()).toHaveTextContent("Upload 1 teacher");
    await user.click(within(screen.getByRole("list", { name: "Row 3 needs a fix" })).getByRole("button", { name: /^Email/ }));
    expect(box("Email", 3)).toHaveFocus();
    await user.clear(box("Email", 3));
    await user.type(box("Email", 3), "meena@school.example");
    await user.tab();
    expect(uploadButton()).toHaveTextContent("Upload 2 teachers");
  });

  it("keeps a box as the school writes it: a gender, a mobile number, a day, a state", async () => {
    fakeApi({
      "POST /staff/teachers/import/read": () => ({ ...SHEET, headers: ["Name *", "Mobile *", "Gender", "Date of Birth", "State"], rows: [{ row: 3, cells: ["Meena Singh", "9876543210", "robot", "1988-05-14", "xx"] }] }),
    });
    const { user } = openPage();
    await openFile(user);
    expect(said("Gender", 3)).toBe("Choose the gender");
    expect(said("State", 3)).toBe("Choose the state");
    await user.clear(box("Gender", 3));
    await user.type(box("Gender", 3), "f");
    await user.clear(box("State", 3));
    await user.type(box("State", 3), "mp");
    await user.clear(box("Date of Birth", 3));
    await user.type(box("Date of Birth", 3), "14051988");
    expect(box("Date of Birth", 3)).toHaveValue("14-05-1988");
    await user.tab();
    expect(box("Gender", 3)).toHaveValue("Female");
    expect(box("State", 3)).toHaveValue("Madhya Pradesh");
    expect(uploadButton()).toHaveTextContent("Upload 1 teacher");
  });

  it("marks the later row when the same mobile number is in the file twice", async () => {
    fakeApi({ "POST /staff/teachers/import/read": () => ({ ...SHEET, rows: [SHEET.rows[0], { row: 4, cells: ["Meena S.", "98765 43210", "F", ""] }] }) });
    const { user } = openPage();
    await openFile(user);
    expect(said("Mobile *", 3)).toBeUndefined();
    expect(said("Mobile *", 4)).toBe("Same mobile number as row 3");
    expect(uploadButton()).toHaveTextContent("Upload 1 teacher");
  });

  it("a row can be left out of the upload with its bin", async () => {
    fakeApi();
    const { user } = openPage();
    await openFile(user);
    await user.click(screen.getByRole("button", { name: "Leave row 4 out of the upload" }));
    expect(screen.queryByLabelText("Name *, row 4")).not.toBeInTheDocument();
    expect(uploadButton()).toHaveTextContent("Upload 1 teacher");
  });
});

describe("Bulk upload of teachers: a red box goes back to normal the moment what is typed is right", () => {
  const file = (headers: string[], rows: string[][]) => ({
    "POST /staff/teachers/import/read": () => ({ ...SHEET, headers, rows: rows.map((cells, i) => ({ row: i + 3, cells })) }),
  });
  const EXPERIENCE = "Experience (years)";

  it("without a click away, a wait or Enter: the red box, its reason and the row's Status go while the cursor stays in it", async () => {
    fakeApi(file(["Name *", "Mobile *", EXPERIENCE], [["Meena Singh", "9876543210", "99"]]));
    const { user } = openPage();
    await openFile(user);
    expect(box(EXPERIENCE, 3)).toHaveAttribute("aria-invalid", "true");
    expect(said(EXPERIENCE, 3)).toBe("Experience is 0 to 60 whole years");
    expect(screen.getByRole("button", { name: "Upload 0 teachers" })).toBeDisabled();
    await user.clear(box(EXPERIENCE, 3));
    await user.type(box(EXPERIENCE, 3), "5");
    expect(box(EXPERIENCE, 3)).toHaveValue("5");
    expect(box(EXPERIENCE, 3)).toHaveFocus();
    expect(box(EXPERIENCE, 3)).not.toHaveAttribute("aria-invalid");
    expect(said(EXPERIENCE, 3)).toBeUndefined();
    expect(screen.queryByRole("list", { name: "Row 3 needs a fix" })).not.toBeInTheDocument();
    expect(uploadButton()).toHaveTextContent("Upload 1 teacher");
  });

  it("stays red while what is typed is still wrong, and goes at the keystroke that makes it right", async () => {
    fakeApi(file(["Name *", "Mobile *", EXPERIENCE], [["Meena Singh", "9876543210", "999"]]));
    const { user } = openPage();
    await openFile(user);
    await user.click(box(EXPERIENCE, 3));
    await user.keyboard("{End}{Backspace}");
    // "99" is still more than 60.
    expect(box(EXPERIENCE, 3)).toHaveValue("99");
    expect(box(EXPERIENCE, 3)).toHaveAttribute("aria-invalid", "true");
    await user.keyboard("{Backspace}");
    expect(box(EXPERIENCE, 3)).toHaveValue("9");
    expect(box(EXPERIENCE, 3)).not.toHaveAttribute("aria-invalid");
  });

  it("does not touch what is typed: spaces stay while the cursor is in the box, and it is shaped (a mobile number as 10 digits) when the box is left", async () => {
    fakeApi(file(["Name *", "Mobile *"], [["", ""]]));
    const { user } = openPage();
    await openFile(user);
    await user.type(box("Name *", 3), "Dev ");
    expect(box("Name *", 3)).toHaveValue("Dev ");
    expect(box("Name *", 3)).toHaveFocus();
    expect(box("Name *", 3)).not.toHaveAttribute("aria-invalid");
    await user.type(box("Name *", 3), "Patel");
    expect(box("Name *", 3)).toHaveValue("Dev Patel");
    await user.type(box("Mobile *", 3), "98765 43210");
    expect(box("Mobile *", 3)).toHaveValue("98765 43210");
    expect(box("Mobile *", 3)).not.toHaveAttribute("aria-invalid");
    expect(uploadButton()).toHaveTextContent("Upload 1 teacher");
    await user.tab();
    expect(box("Mobile *", 3)).toHaveValue("9876543210");
    expect(uploadButton()).toHaveTextContent("Upload 1 teacher");
  });

  it("a box that is not red is left alone while it is typed in (no red flashing at every letter), and is judged when it is left", async () => {
    fakeApi(file(["Name *", "Mobile *"], [["Meena Singh", "9876543210"]]));
    const { user } = openPage();
    await openFile(user);
    await user.type(box("Mobile *", 3), "1");
    expect(box("Mobile *", 3)).toHaveValue("98765432101");
    expect(box("Mobile *", 3)).not.toHaveAttribute("aria-invalid");
    expect(uploadButton()).toHaveTextContent("Upload 1 teacher");
    await user.tab();
    expect(box("Mobile *", 3)).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByRole("button", { name: "Upload 0 teachers" })).toBeDisabled();
  });

  it("Escape puts the box back as it was when the person came into it, red again", async () => {
    fakeApi(file(["Name *", "Mobile *"], [["", "9876543210"]]));
    const { user } = openPage();
    await openFile(user);
    await user.type(box("Name *", 3), "Dev");
    expect(box("Name *", 3)).not.toHaveAttribute("aria-invalid");
    await user.keyboard("{Escape}");
    expect(box("Name *", 3)).toHaveValue("");
    expect(box("Name *", 3)).toHaveAttribute("aria-invalid", "true");
    expect(said("Name *", 3)).toBe("Enter the teacher's name");
  });

  it("Enter keeps what was typed and moves to the same box of the next row", async () => {
    fakeApi(file(["Name *", "Mobile *"], [["", "9876543210"], ["Dev Patel", "9876500000"]]));
    const { user } = openPage();
    await openFile(user);
    await user.type(box("Name *", 3), "Meena Singh{Enter}");
    expect(box("Name *", 4)).toHaveFocus();
    expect(box("Name *", 3)).toHaveValue("Meena Singh");
    expect(uploadButton()).toHaveTextContent("Upload 2 teachers");
  });
});

describe("Bulk upload of teachers: the upload", () => {
  it("asks first, then sends the ready rows in one request with only what the file gave", async () => {
    const calls = fakeApi();
    stubDownloads();
    const { router, user } = openPage();
    await openFile(user);
    await user.click(uploadButton());
    const ask = await screen.findByRole("dialog", { name: "Upload 2 teachers?" });
    expect(writes(calls)).toHaveLength(0);
    await user.click(within(ask).getByRole("button", { name: "Upload and add" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/school/teachers"));

    expect(writes(calls)).toHaveLength(1);
    expect(writes(calls)[0].body).toEqual({
      rows: [
        { row: 3, teacher: { name: "Meena Singh", mobile: "9876543210", gender: "Female" }, subjectNames: ["Mathematics", "Sanskrit"] },
        { row: 4, teacher: { name: "Dev Patel", mobile: "9876500000", gender: "Male" }, subjectNames: ["English"] },
      ],
    });
  });

  it("when every row is added it goes straight to the teachers (no Done step), after saving the logins file: the server made up the passwords and tells them only now", async () => {
    fakeApi();
    const { saved, blobs } = stubDownloads();
    const { router, user } = openPage();
    await openFile(user);
    await user.click(uploadButton());
    await user.click(await screen.findByRole("button", { name: "Upload and add" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/school/teachers"));
    expect(screen.getByText("The Manage Teacher list")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /teachers? added/ })).not.toBeInTheDocument();
    // The logins file was saved once, with both teachers' made-up passwords.
    expect(saved).toEqual(["staff-logins.csv"]);
    const csv = await textOf(blobs[0]);
    expect(csv).toContain("Meena Singh,9876543210,meena.singh_41,Gen@3Pw");
    expect(csv).toContain("Dev Patel,9876500000,dev.patel_41,Gen@4Pw");
    // And the person is told, on the teachers' page.
    expect(screen.getByText(/2 teachers added/)).toHaveTextContent("The login details are saved to your downloads");
  });

  it("goes to the teachers from /teachers/import too: to the list it came from", async () => {
    fakeApi();
    stubDownloads();
    const { router, user } = openPage("/teachers/import");
    await openFile(user);
    await user.click(uploadButton());
    await user.click(await screen.findByRole("button", { name: "Upload and add" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/teachers"));
  });

  it("sends a long file in parts of 10 rows, one after the other, and then goes to the teachers", async () => {
    const rows = Array.from({ length: 23 }, (_, i) => ({ row: i + 3, cells: [`Teacher ${i}`, `98765${String(10000 + i)}`, "", ""] }));
    const calls = fakeApi({ "POST /staff/teachers/import/read": () => ({ ...SHEET, rows }) });
    stubDownloads();
    const { router, user } = openPage();
    await openFile(user);
    await user.click(uploadButton());
    await user.click(await screen.findByRole("button", { name: "Upload and add" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/school/teachers"));
    expect(writes(calls).map((c) => (c.body as Body).rows.length)).toEqual([10, 10, 3]);
    expect(screen.getByText(/23 teachers added/)).toBeInTheDocument();
  });

  it("keeps the password the file gave and does not ask the server to make one: nothing to save, so no file", async () => {
    const calls = fakeApi({
      "POST /staff/teachers/import/read": () => ({ ...SHEET, headers: ["Name *", "Mobile *", "Username", "Password"], rows: [{ row: 3, cells: ["Meena Singh", "9876543210", "Meena.S", "Sch00l@Teach1"] }] }),
    });
    const { saved } = stubDownloads();
    const { router, user } = openPage();
    await openFile(user);
    await user.click(uploadButton());
    await user.click(await screen.findByRole("button", { name: "Upload and add" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/school/teachers"));
    expect(writes(calls)[0].body).toMatchObject({ rows: [{ username: "meena.s", password: "Sch00l@Teach1" }] });
    // The school wrote that password itself: no file of logins, and nothing said about one.
    expect(saved).toEqual([]);
    expect(screen.getByText(/1 teacher added/)).not.toHaveTextContent("login details");
  });

  it("stays on the Done step, with the logins on the page, if the logins file could not be saved (the passwords are told only once)", async () => {
    fakeApi();
    vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: () => { throw new Error("blocked"); }, revokeObjectURL: () => {} }));
    const { router, user } = openPage();
    await openFile(user);
    await user.click(uploadButton());
    await user.click(await screen.findByRole("button", { name: "Upload and add" }));
    await screen.findByRole("heading", { name: "2 teachers added" });
    expect(router.state.location.pathname).toBe("/school/teachers/import");
    expect(within(screen.getByRole("table", { name: "Logins to hand out" })).getByText("Gen@3Pw")).toBeInTheDocument();
  });

  it("stays on the Done step when a row was refused: the others' logins are listed there, to download", async () => {
    const { saved } = stubDownloads();
    fakeApi({
      "POST /staff/teachers/import": (body) => {
        const made = madeAll(body);
        return {
          results: [made.results[0], { row: 4, ok: false, code: "USERNAME_TAKEN", errors: [{ path: "username", message: "This username is taken. Try another, for example dev.patel_41" }] }],
          ok: 1,
          failed: 1,
        };
      },
    });
    const { router, user } = openPage();
    await openFile(user);
    await user.click(uploadButton());
    await user.click(await screen.findByRole("button", { name: "Upload and add" }));
    await screen.findByRole("heading", { name: "1 teacher added" });
    expect(router.state.location.pathname).toBe("/school/teachers/import");
    expect(saved).toEqual([]);
    const cells = within(screen.getByRole("table", { name: "Logins to hand out" })).getAllByRole("row").slice(1).map((r) => within(r).getAllByRole("cell").map((c) => c.textContent));
    expect(cells).toEqual([["Meena Singh", "9876543210", "meena.singh_41", "Gen@3Pw"]]);
    await user.click(screen.getByRole("button", { name: "Download login details" }));
    expect(saved).toEqual(["staff-logins.csv"]);
  });

  it("keeps a refused row in the table with the server's reason, and takes the person to the box (adding its column when the file has none)", async () => {
    stubDownloads();
    let tries = 0;
    const calls = fakeApi({
      "POST /staff/teachers/import": (body) => {
        tries += 1;
        const made = madeAll(body);
        if (tries > 1) return made;
        return {
          results: [made.results[0], { row: 4, ok: false, code: "USERNAME_TAKEN", errors: [{ path: "username", message: "This username is taken. Try another, for example dev.patel_41" }] }],
          ok: 1,
          failed: 1,
        };
      },
    });
    const { router, user } = openPage();
    await openFile(user);
    await user.click(uploadButton());
    await user.click(await screen.findByRole("button", { name: "Upload and add" }));
    await screen.findByRole("heading", { name: "1 teacher added" });
    expect(screen.getByText(/1 row still needs a fix/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Fix the 1 row" }));
    // Row 3 is in the school now: only the refused row is left, and its detail has no column yet.
    expect(screen.queryByLabelText("Name *, row 3")).not.toBeInTheDocument();
    await user.click(within(screen.getByRole("list", { name: "Row 4 needs a fix" })).getByRole("button", { name: /^Username/ }));
    expect(box("Username", 4)).toHaveFocus();
    expect(said("Username", 4)).toBe("This username is taken. Try another, for example dev.patel_41");
    await user.type(box("Username", 4), "dev.patel9");
    await user.tab();
    expect(uploadButton()).toHaveTextContent("Upload 1 teacher");
    await user.click(uploadButton());
    await user.click(await screen.findByRole("button", { name: "Upload and add" }));
    // Now every row of the file is in: the person is taken to the teachers.
    await waitFor(() => expect(router.state.location.pathname).toBe("/school/teachers"));
    expect(writes(calls)[1].body).toMatchObject({ rows: [{ row: 4, username: "dev.patel9" }] });
    // The logins file has both teachers of this visit (the first upload's, and this one's).
    expect(screen.getByText(/2 teachers added/)).toBeInTheDocument();
  });

  it("a teacher the school already has (the same mobile number) is nothing to fix: the rest is added and the person goes to the teachers, told about it", async () => {
    stubDownloads();
    fakeApi({
      "POST /staff/teachers/import": (body) => {
        const made = madeAll(body);
        return {
          results: [made.results[0], { row: 4, ok: false, code: "TEACHER_MOBILE_EXISTS", errors: [{ path: "mobile", message: "Dev Patel already has this mobile number" }] }],
          ok: 1,
          failed: 1,
        };
      },
    });
    const { router, user } = openPage();
    await openFile(user);
    await user.click(uploadButton());
    await user.click(await screen.findByRole("button", { name: "Upload and add" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/school/teachers"));
    expect(screen.getByText(/1 teacher added/)).toHaveTextContent("1 row was already in your school");
  });

  it("says when a part did not go through and keeps what was made", async () => {
    let tries = 0;
    fakeApi({
      "POST /staff/teachers/import/read": () => ({ ...SHEET, rows: Array.from({ length: 12 }, (_, i) => ({ row: i + 3, cells: [`Teacher ${i}`, `98765${String(10000 + i)}`, "", ""] })) }),
      "POST /staff/teachers/import": (body) => {
        tries += 1;
        return tries === 1 ? madeAll(body) : new Response(JSON.stringify({ success: false, message: "The server is busy" }), { status: 503, headers: { "Content-Type": "application/json" } });
      },
    });
    const { user } = openPage();
    await openFile(user);
    await user.click(uploadButton());
    await user.click(await screen.findByRole("button", { name: "Upload and add" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("The upload stopped after 10 rows: The server is busy");
    // The ten made are out of the table; the two left can be uploaded again.
    expect(uploadButton()).toHaveTextContent("Upload 2 teachers");
  });
});

describe("Bulk upload of teachers: leaving", () => {
  it("asks before leaving a table with rows in it; staying keeps it", async () => {
    fakeApi();
    const { router, user } = openPage();
    await openFile(user);
    await user.click(screen.getByRole("link", { name: "Manage Teacher" }));
    const ask = await screen.findByRole("dialog", { name: "Leave without uploading?" });
    await user.click(within(ask).getByRole("button", { name: "Cancel" }));
    expect(router.state.location.pathname).toBe("/school/teachers/import");
    expect(screen.getByRole("table", { name: "Your file" })).toBeInTheDocument();
    await user.click(screen.getByRole("link", { name: "Manage Teacher" }));
    await user.click(within(await screen.findByRole("dialog", { name: "Leave without uploading?" })).getByRole("button", { name: "Leave without uploading" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/school/teachers"));
  });

  it("does not let the logins go unseen (a part of the file was refused, so the Done step stays): asks until they are downloaded", async () => {
    stubDownloads();
    fakeApi({
      "POST /staff/teachers/import": (body) => {
        const made = madeAll(body);
        return {
          results: [made.results[0], { row: 4, ok: false, code: "USERNAME_TAKEN", errors: [{ path: "username", message: "This username is taken. Try another, for example dev.patel_41" }] }],
          ok: 1,
          failed: 1,
        };
      },
    });
    const { router, user } = openPage();
    await openFile(user);
    await user.click(uploadButton());
    await user.click(await screen.findByRole("button", { name: "Upload and add" }));
    await screen.findByRole("heading", { name: "1 teacher added" });

    await user.click(screen.getByRole("link", { name: "Manage Teacher" }));
    const ask = await screen.findByRole("dialog", { name: "Leave without the login details?" });
    expect(ask).toHaveTextContent("passwords");
    await user.click(within(ask).getByRole("button", { name: "Cancel" }));
    expect(router.state.location.pathname).toBe("/school/teachers/import");

    await user.click(screen.getByRole("button", { name: "Download login details" }));
    await user.click(screen.getByRole("link", { name: "Manage Teacher" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/school/teachers"));
  });

  it("a page with nothing in it leaves without asking", async () => {
    fakeApi();
    const { router, user } = openPage();
    await screen.findByText("Drag and drop your teachers file here");
    await user.click(screen.getByRole("link", { name: "Manage Teacher" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/school/teachers"));
  });
});
