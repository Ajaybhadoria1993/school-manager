import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Provider } from "react-redux";
import { RouterProvider, createMemoryRouter } from "react-router";
import store from "../../../redux/store";
import { allApiSlices } from "../../../redux/api/apiRoot";
import { ToastProvider } from "../../../components/ui/toast-context";
import type { ImportSheet } from "../../../types";
import { fakeApi as pretendApi, spreadsheet, type Call, type Handler } from "../../../test/fakeApi";
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

function openPage(path = "/school/teachers/import") {
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
        <RouterProvider router={router} />
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

describe("Bulk upload of teachers: Preview & fix is just the table", () => {
  it("opens a file with its columns recognised, the boxes kept as they are, and nothing sent but the file", async () => {
    const calls = fakeApi();
    const { user } = openPage();
    await openFile(user);
    expect(calls.map((c) => `${c.method} ${c.path}`).sort()).toEqual(["GET /staff/teachers/settings", "GET /subjects", "POST /staff/teachers/import/read"]);
    expect(screen.getByText((_, el) => el?.tagName === "P" && /Teachers · 2 rows · 2 ready/.test(el.textContent ?? ""))).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /What the column "Name \*" is$/ })).toHaveTextContent("Name");
    expect(screen.getByRole("button", { name: /What the column "Mobile \*" is$/ })).toHaveTextContent("Mobile");
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
    expect(screen.getByRole("button", { name: /What the column "Name \*" is$/ })).toHaveTextContent("Name");
    expect(screen.getByRole("button", { name: /What the column "Mobile \*" is$/ })).toHaveTextContent("Mobile");
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

describe("Bulk upload of teachers: the upload", () => {
  it("asks first, then sends the ready rows in one request with only what the file gave, and says who got which login", async () => {
    const calls = fakeApi();
    const { user } = openPage();
    await openFile(user);
    await user.click(uploadButton());
    const ask = await screen.findByRole("dialog", { name: "Upload 2 teachers?" });
    expect(writes(calls)).toHaveLength(0);
    await user.click(within(ask).getByRole("button", { name: "Upload and add" }));
    await screen.findByRole("heading", { name: "2 teachers added" });

    expect(writes(calls)).toHaveLength(1);
    expect(writes(calls)[0].body).toEqual({
      rows: [
        { row: 3, teacher: { name: "Meena Singh", mobile: "9876543210", gender: "Female" }, subjectNames: ["Mathematics", "Sanskrit"] },
        { row: 4, teacher: { name: "Dev Patel", mobile: "9876500000", gender: "Male" }, subjectNames: ["English"] },
      ],
    });
    // The logins are told once, here.
    const logins = screen.getByRole("table", { name: "Logins to hand out" });
    const cells = within(logins).getAllByRole("row").slice(1).map((r) => within(r).getAllByRole("cell").map((c) => c.textContent));
    expect(cells).toEqual([
      ["Meena Singh", "9876543210", "meena.singh_41", "Gen@3Pw"],
      ["Dev Patel", "9876500000", "dev.patel_41", "Gen@4Pw"],
    ]);
  });

  it("sends a long file in parts of 10 rows, one after the other, and refreshes the teachers once", async () => {
    const rows = Array.from({ length: 23 }, (_, i) => ({ row: i + 3, cells: [`Teacher ${i}`, `98765${String(10000 + i)}`, "", ""] }));
    const calls = fakeApi({ "POST /staff/teachers/import/read": () => ({ ...SHEET, rows }) });
    const { user } = openPage();
    await openFile(user);
    await user.click(uploadButton());
    await user.click(await screen.findByRole("button", { name: "Upload and add" }));
    await screen.findByRole("heading", { name: "23 teachers added" });
    expect(writes(calls).map((c) => (c.body as Body).rows.length)).toEqual([10, 10, 3]);
  });

  it("keeps the password the file gave and does not ask the server to make one", async () => {
    const calls = fakeApi({
      "POST /staff/teachers/import/read": () => ({ ...SHEET, headers: ["Name *", "Mobile *", "Username", "Password"], rows: [{ row: 3, cells: ["Meena Singh", "9876543210", "Meena.S", "Sch00l@Teach1"] }] }),
    });
    const { user } = openPage();
    await openFile(user);
    await user.click(uploadButton());
    await user.click(await screen.findByRole("button", { name: "Upload and add" }));
    await screen.findByRole("heading", { name: "1 teacher added" });
    expect(writes(calls)[0].body).toMatchObject({ rows: [{ username: "meena.s", password: "Sch00l@Teach1" }] });
    // The school has it already: it is in the list to hand out as it was written.
    expect(within(screen.getByRole("table", { name: "Logins to hand out" })).getByText("Sch00l@Teach1")).toBeInTheDocument();
  });

  it("downloads the logins as a file named after the school's file", async () => {
    const saved: string[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      saved.push(this.download);
    });
    vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: () => "blob:logins", revokeObjectURL: () => {} }));
    fakeApi();
    const { user } = openPage();
    await openFile(user);
    await user.click(uploadButton());
    await user.click(await screen.findByRole("button", { name: "Upload and add" }));
    await screen.findByRole("heading", { name: "2 teachers added" });
    await user.click(screen.getByRole("button", { name: "Download login details" }));
    expect(saved).toEqual(["staff-logins.csv"]);
  });

  it("keeps a refused row in the table with the server's reason, and takes the person to the box (adding its column when the file has none)", async () => {
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
    const { user } = openPage();
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
    await screen.findByRole("heading", { name: "1 teacher added" });
    expect(writes(calls)[1].body).toMatchObject({ rows: [{ row: 4, username: "dev.patel9" }] });
  });

  it("moves a teacher the school already has (the same mobile number) to Already in school: said once, nothing to fix", async () => {
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
    const { user } = openPage();
    await openFile(user);
    await user.click(uploadButton());
    await user.click(await screen.findByRole("button", { name: "Upload and add" }));
    await screen.findByRole("heading", { name: "1 teacher added" });
    expect(screen.getByText(/1 row was already in your school/)).toBeInTheDocument();
    expect(screen.queryByText(/still needs? a fix/)).not.toBeInTheDocument();
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

  it("does not let the logins go unseen: asks until they are downloaded", async () => {
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: () => "blob:logins", revokeObjectURL: () => {} }));
    fakeApi();
    const { router, user } = openPage();
    await openFile(user);
    await user.click(uploadButton());
    await user.click(await screen.findByRole("button", { name: "Upload and add" }));
    await screen.findByRole("heading", { name: "2 teachers added" });

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
