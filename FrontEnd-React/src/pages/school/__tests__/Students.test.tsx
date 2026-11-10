import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Provider } from "react-redux";
import { RouterProvider, createMemoryRouter } from "react-router";
import { ToastProvider } from "../../../components/ui/toast-context";
import { allApiSlices } from "../../../redux/api/apiRoot";
import store from "../../../redux/store";
import { yearViewChanged } from "../../../redux/slices/yearViewSlice";
import type { StudentPage, StudentRow, StudentSettings, UserRole } from "../../../types";
import { fakeApi, spreadsheet, type Handler } from "../../../test/fakeApi";
import { CAPACITY, SETTINGS, STRUCTURE } from "../../../test/fixtures";
import { signInAs, signOut } from "../../../test/session";
import StudentsPage from "../Students";

const NOBODY: StudentPage = { academicYear: { id: "y1", name: "2026-2027" }, items: [], page: 1, limit: 12, total: 0, totalPages: 1 };
const ASHA: StudentRow = {
  id: "s1",
  firstName: "Asha",
  lastName: "Verma",
  name: "Asha Verma",
  gender: "Female",
  admissionNumber: "ADM-2026-0001",
  dateOfBirth: "2016-05-14",
  admissionDate: "2026-06-01",
  status: "active",
  place: { enrolmentId: "e1", classId: "c1", className: "Class 1", sectionId: null, sectionName: null, rollNumber: null },
  primaryGuardian: { id: "g1", name: "Ravi Verma", relation: "Father", mobile: "9876543210" },
};

/** The school's three reads of this page, with nobody admitted unless `students` says so. */
function school(students: StudentRow[] = [], extra: Record<string, Handler> = {}) {
  let settings: StudentSettings = SETTINGS;
  return fakeApi({
    "GET /students/settings": () => settings,
    "PUT /students/settings": (body) => {
      const input = body as { fields?: object };
      settings = { ...settings, fields: { ...settings.fields, ...input.fields } };
      return settings;
    },
    "GET /academics/structure": () => STRUCTURE,
    "GET /students/capacity": () => ({ ...CAPACITY, totals: { ...CAPACITY.totals, students: students.length } }),
    "GET /students": () => ({ ...NOBODY, items: students, total: students.length }),
    ...extra,
  });
}

function openPage(entry = "/school/students", who: { role?: UserRole; permissions?: string[] } = {}) {
  // The school admin unless said: the page asks who is looking (what the school allowed them).
  signInAs(who.role ?? "school_admin", who.permissions);
  const router = createMemoryRouter([{ path: "/school/students", element: <StudentsPage /> }], { initialEntries: [entry] });
  render(
    <Provider store={store}>
      <ToastProvider>
        <RouterProvider router={router} />
      </ToastProvider>
    </Provider>
  );
  return userEvent.setup();
}

/** What the page's header offers, left to right (the little help button of the title has no text of its own). */
function headerButtons() {
  const header = screen.getByRole("heading", { name: "Students", level: 1 }).closest("header")!;
  return [...header.querySelectorAll("a, button")].map((el) => el.textContent?.trim() ?? "").filter(Boolean);
}

afterEach(() => {
  // The page leaves first, so nothing on screen asks the API again when the cache is emptied for the next test.
  cleanup();
  for (const api of allApiSlices) store.dispatch(api.util.resetApiState());
  signOut();
  vi.unstubAllGlobals();
});

describe("Students, a new school with nobody admitted yet", () => {
  it("is simple: the card says so and offers only Add your first student and Check your classes and sections", async () => {
    school();
    openPage();
    const heading = await screen.findByRole("heading", { name: "No students yet" });
    const card = heading.parentElement!;
    expect(within(card).getAllByRole("link").map((l) => l.textContent?.trim())).toEqual(["Add your first student", "Check your classes and sections"]);
    expect(within(card).getByRole("link", { name: "Add your first student" })).toHaveAttribute("href", "/school/students/new");
    expect(within(card).getByRole("link", { name: "Check your classes and sections" })).toHaveAttribute("href", "/school/classes");
    // None of the other ways in, and no long explanation.
    expect(screen.queryByRole("link", { name: "Manage fields" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Upload from Excel" })).not.toBeInTheDocument();
    expect(card.querySelectorAll("p")).toHaveLength(0);
  });

  it("has the same header as a school that has students: Guide, Export, Bulk upload, Add student (no sample button of its own)", async () => {
    school();
    openPage();
    await screen.findByText("No students yet");
    expect(headerButtons()).toEqual(["Guide", "Export", "Bulk upload", "Add student"]);
    expect(screen.queryByRole("button", { name: "Download sample Excel" })).not.toBeInTheDocument();
  });

  it("lets Export open at once, so a new school can choose its fields there (the file itself needs students)", async () => {
    const calls = school();
    openPage();
    await screen.findByText("No students yet");
    expect(screen.getByRole("link", { name: "Export" })).toHaveAttribute("href", "/school/students/export");
    // Looking at the page reads neither the settings nor the sample file.
    expect(calls.filter((c) => c.path === "/students/settings" || c.path === "/students/import/template")).toHaveLength(0);
  });
});

const KABIR: StudentRow = { ...ASHA, id: "s2", firstName: "Kabir", lastName: "Rao", name: "Kabir Rao", admissionNumber: "ADM-2026-0002", primaryGuardian: { id: "g2", name: "Anil Rao", relation: "Father", mobile: "9111111111" } };

describe("Students, active and inactive", () => {
  it("has two tabs, Active and Inactive, and no Recycle bin anywhere", async () => {
    school([ASHA, KABIR]);
    openPage();
    await screen.findByText("Asha Verma");
    const tabs = screen.getByRole("navigation", { name: "Students by status" });
    expect(within(tabs).getByRole("link", { name: "Active students" })).toHaveAttribute("href", "/school/students");
    expect(within(tabs).getByRole("link", { name: "Inactive students" })).toHaveAttribute("href", "/school/students/inactive");
    expect(screen.queryByText(/recycle/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/selected/)).not.toBeInTheDocument();
  });

  it("ticking rows says how many are chosen; the box at the top chooses (or clears) the whole page", async () => {
    school([ASHA, KABIR]);
    const user = openPage();
    await screen.findByText("Asha Verma");
    await user.click(screen.getByRole("checkbox", { name: "Select Asha Verma" }));
    expect(screen.getByText("1 selected")).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Select Kabir Rao" })).not.toBeChecked();
    await user.click(screen.getByRole("checkbox", { name: "Select all students on this page" }));
    expect(screen.getByText("2 selected")).toBeInTheDocument();
    await user.click(screen.getByRole("checkbox", { name: "Select all students on this page" }));
    expect(screen.queryByText(/selected/)).not.toBeInTheDocument();
  });

  it("Make inactive asks first (with an optional reason), sends one request with the ids, and clears the selection; Cancel sends nothing", async () => {
    const calls = school([ASHA, KABIR], { "POST /students/deactivate": () => ({ deactivated: 2, skipped: 0 }) });
    const user = openPage();
    await screen.findByText("Asha Verma");
    await user.click(screen.getByRole("checkbox", { name: "Select Asha Verma" }));
    await user.click(screen.getByRole("checkbox", { name: "Select Kabir Rao" }));
    await user.click(screen.getByRole("button", { name: "Make inactive" }));

    const dialog = await screen.findByRole("dialog", { name: "Make 2 students inactive?" });
    expect(dialog).toHaveTextContent("Asha Verma and Kabir Rao");
    expect(dialog).toHaveTextContent("Nothing is deleted");
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(calls.filter((c) => c.method === "POST")).toHaveLength(0);

    await user.click(screen.getByRole("button", { name: "Make inactive" }));
    const again = await screen.findByRole("dialog");
    await user.type(within(again).getByRole("textbox", { name: /Why/ }), "Wrong file");
    await user.click(within(again).getByRole("button", { name: "Make inactive" }));
    await waitFor(() => expect(calls.filter((c) => c.method === "POST" && c.path === "/students/deactivate")).toHaveLength(1));
    expect(calls.find((c) => c.path === "/students/deactivate")?.body).toEqual({ ids: ["s1", "s2"], reason: "Wrong file" });
    await waitFor(() => expect(screen.queryByText(/selected/)).not.toBeInTheDocument());
    await waitFor(() => expect(calls.filter((c) => c.method === "GET" && c.path === "/students").length).toBeGreaterThan(1));
  });
});

describe("Students, a school that has students", () => {
  it("Add student carries the class and section chosen in the list, so the form opens with them filled in", async () => {
    school([ASHA]);
    openPage("/school/students?class=c6&section=c6-A");
    await screen.findByText("Asha Verma");
    expect(screen.getByRole("link", { name: "Add student" })).toHaveAttribute("href", "/school/students/new?class=c6&section=c6-A");
  });

  it("Add student opens a plain form when no class is chosen", async () => {
    school([ASHA]);
    openPage();
    await screen.findByText("Asha Verma");
    expect(screen.getByRole("link", { name: "Add student" })).toHaveAttribute("href", "/school/students/new");
  });

  it("shows the list, not the empty state, under the same header", async () => {
    school([ASHA]);
    openPage();
    expect(await screen.findByText("Asha Verma")).toBeInTheDocument();
    expect(screen.queryByText("No students yet")).not.toBeInTheDocument();
    expect(headerButtons()).toEqual(["Guide", "Export", "Bulk upload", "Add student"]);
    expect(screen.getByRole("link", { name: "Bulk upload" })).toHaveAttribute("href", "/school/students/import");
  });
});

describe("Students while a year that is over is open (read only)", () => {
  afterEach(() => {
    store.dispatch(yearViewChanged(null));
  });

  it("is only looked at: Guide and Export stay; no Bulk upload, no Add student, no ticking of students to make them inactive", async () => {
    school([ASHA]);
    store.dispatch(yearViewChanged("y26"));
    openPage();
    expect(await screen.findByText("Asha Verma")).toBeInTheDocument();
    expect(headerButtons()).toEqual(["Guide", "Export"]);
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  });

  it("the running year still has all four buttons and the tick boxes", async () => {
    school([ASHA]);
    openPage();
    expect(await screen.findByText("Asha Verma")).toBeInTheDocument();
    expect(headerButtons()).toEqual(["Guide", "Export", "Bulk upload", "Add student"]);
    expect(screen.getAllByRole("checkbox").length).toBeGreaterThan(0);
  });
});

describe("Students for a person the school allowed (Permissions)", () => {
  const reception = (permissions: string[]) => ({ role: "receptionist" as const, permissions });

  it("a receptionist who may only see students sees the list, and none of Export, Bulk upload, Add student, the inactive list or the ticks", async () => {
    school([ASHA]);
    openPage("/school/students", reception(["students.view"]));
    expect(await screen.findByText("Asha Verma")).toBeInTheDocument();
    expect(headerButtons()).toEqual(["Guide"]);
    expect(screen.queryByRole("navigation", { name: "Students by status" })).not.toBeInTheDocument();
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  });

  it("each button comes with its own permission: add students gives Add student and Bulk upload, export gives Export, status the inactive list and the ticks", async () => {
    school([ASHA]);
    openPage("/school/students", reception(["students.view", "students.add"]));
    await screen.findByText("Asha Verma");
    expect(headerButtons()).toEqual(["Guide", "Bulk upload", "Add student"]);
    cleanup();

    school([ASHA]);
    openPage("/school/students", reception(["students.view", "students.export"]));
    await screen.findByText("Asha Verma");
    expect(headerButtons()).toEqual(["Guide", "Export"]);
    cleanup();

    school([ASHA]);
    openPage("/school/students", reception(["students.view", "students.status"]));
    await screen.findByText("Asha Verma");
    expect(screen.getByRole("navigation", { name: "Students by status" })).toBeInTheDocument();
    expect(screen.getAllByRole("checkbox").length).toBeGreaterThan(0);
  });

  it("Export is a direct download for a person who may export but does not run the school (the layout page is the school admin's)", async () => {
    const saved: string[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      saved.push(this.download);
    });
    const calls = school([ASHA], { "GET /students/export": () => spreadsheet("students-sunrise.xlsx") });
    const user = openPage("/school/students", reception(["students.view", "students.export"]));
    await screen.findByText("Asha Verma");
    expect(screen.queryByRole("link", { name: "Export" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Export" }));
    await waitFor(() => expect(saved).toEqual(["students-sunrise.xlsx"]));
    expect(calls.filter((c) => c.path === "/students/export")).toHaveLength(1);
  });

  it("the school admin and the principal have everything, whatever list their session carries", async () => {
    school([ASHA]);
    openPage("/school/students", { role: "principal", permissions: [] });
    await screen.findByText("Asha Verma");
    expect(headerButtons()).toEqual(["Guide", "Export", "Bulk upload", "Add student"]);
  });
});
