import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Provider } from "react-redux";
import { RouterProvider, createMemoryRouter, useLocation } from "react-router";
import { ToastProvider } from "../../../components/ui/toast-context";
import { allApiSlices } from "../../../redux/api/apiRoot";
import store from "../../../redux/store";
import { yearViewChanged } from "../../../redux/slices/yearViewSlice";
import type { Dues, InactiveStudent, StudentCapacity, StudentPage, StudentRow, StudentSettings, UserRole } from "../../../types";
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

/** Where the address is now (the tab and the filters are kept in it). */
function Where() {
  const here = useLocation();
  return <div data-testid="where">{here.pathname + here.search}</div>;
}

function openPage(entry = "/school/students", who: { role?: UserRole; permissions?: string[] } = {}) {
  // The school admin unless said: the page asks who is looking (what the school allowed them).
  signInAs(who.role ?? "school_admin", who.permissions);
  const router = createMemoryRouter(
    [
      {
        path: "/school/students",
        element: (
          <>
            <StudentsPage />
            <Where />
          </>
        ),
      },
    ],
    { initialEntries: [entry] }
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
  it("shows the active-student list without in-page status tabs or a Recycle bin", async () => {
    school([ASHA, KABIR]);
    openPage();
    await screen.findByText("Asha Verma");
    expect(screen.queryByRole("navigation", { name: "Students by status" })).not.toBeInTheDocument();
    expect(screen.queryByText(/recycle/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/selected/)).not.toBeInTheDocument();
  });

  it("scopes the summary cards to the selected class and keeps class and section choices free of counts", async () => {
    const classCapacity: StudentCapacity = {
      ...CAPACITY,
      sections: [{ ...CAPACITY.sections[0], enrolled: 6, seatsLeft: 24 }],
      classes: [
        { classId: "c1", enrolled: 2, nextRollNumber: 3 },
        { classId: "c6", enrolled: 6, nextRollNumber: 7 },
      ],
      totals: { students: 8, seats: 30, seatsLeft: 24, fullSections: 0, newAdmissions: 0, inactive: 0 },
    };
    school([ASHA, KABIR], { "GET /students/capacity": () => classCapacity });
    const user = openPage("/school/students?class=c6");
    await screen.findByText("Asha Verma");

    const summary = screen.getByRole("region", { name: "Students at a glance" });
    const valueFor = (label: string) => within(summary).getByText(label).parentElement?.querySelectorAll("p")[1].textContent;
    await waitFor(() => {
      expect(valueFor("Students")).toBe("6");
      expect(valueFor("Classes with students")).toBe("1");
      expect(valueFor("Seats left")).toBe("24");
      expect(valueFor("Full sections")).toBe("0");
    });

    const classPicker = screen.getByLabelText("Show the students of a class");
    expect(classPicker).toHaveTextContent("Class 6");
    expect(classPicker).not.toHaveTextContent("(6)");
    await user.click(classPicker);
    expect(await screen.findByRole("option", { name: "Class 6" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: /Class 6 \(/ })).not.toBeInTheDocument();
    await user.keyboard("{Escape}");

    const sectionPicker = screen.getByLabelText("Show a section of the class");
    expect(sectionPicker).toHaveTextContent("All sections");
    expect(sectionPicker).not.toHaveTextContent("(6)");
    await user.click(sectionPicker);
    expect(await screen.findByRole("option", { name: "All sections" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Section A" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: /Section A \(/ })).not.toBeInTheDocument();
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

  it("Bulk upload carries the class and section chosen in the list too, and is plain when none is chosen", async () => {
    school([ASHA]);
    openPage("/school/students?class=c6&section=c6-A");
    await screen.findByText("Asha Verma");
    expect(screen.getByRole("link", { name: "Bulk upload" })).toHaveAttribute("href", "/school/students/import?class=c6&section=c6-A");
    cleanup();
    openPage();
    await screen.findByText("Asha Verma");
    expect(screen.getByRole("link", { name: "Bulk upload" })).toHaveAttribute("href", "/school/students/import");
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

const LEFT: InactiveStudent = {
  id: "s9",
  name: "Dev Patel",
  gender: "Male",
  admissionNumber: "ADM-2025-0009",
  dateOfBirth: "2015-01-01",
  className: "Class 5",
  sectionName: "A",
  rollNumber: 4,
  parentName: "Raj Patel",
  parentMobile: "9222222222",
  reason: "Moved to another city",
  transfer: null,
  inactiveAt: "2026-10-25T10:30:00.000Z",
  inactiveBy: { name: "Meena Singh", role: "school_admin" },
};

describe("Students on ONE page with tabs (2026-11-22): Active students, New admissions, Inactive", () => {
  const counted = (over: Partial<StudentCapacity["totals"]> = {}) => ({
    "GET /students/capacity": () => ({ ...CAPACITY, totals: { ...CAPACITY.totals, students: 2, newAdmissions: 1, inactive: 3, ...over } }),
  });
  const tabs = () => screen.getByRole("tablist", { name: "Which students to show" });
  const tab = (name: RegExp) => within(tabs()).getByRole("tab", { name });
  const here = () => screen.getByTestId("where").textContent;
  const lists = (calls: ReturnType<typeof school>) => calls.filter((c) => c.method === "GET" && c.path === "/students");
  /** A second school in the same test: the page is taken away and what the first one answered is forgotten. */
  const fresh = () => {
    cleanup();
    for (const api of allApiSlices) store.dispatch(api.util.resetApiState());
  };

  it("has the tabs side by side with their counts (they come with the read the page already makes); Active students is the one open", async () => {
    const calls = school([ASHA, KABIR], counted());
    openPage();
    await screen.findByText("Asha Verma");
    expect(within(tabs()).getAllByRole("tab").map((t) => t.textContent)).toEqual(["Active students2", "New admissions1", "Inactive3"]);
    expect(tab(/Active students/)).toHaveAttribute("aria-selected", "true");
    // The counts cost no request of their own.
    expect(calls.filter((c) => c.path === "/students/capacity")).toHaveLength(1);
    expect(calls.filter((c) => c.path === "/students/inactive")).toHaveLength(0);
  });

  it("New admissions asks the server for this year's admissions only, and keeps the search, the class and the section", async () => {
    const calls = school([ASHA], counted());
    const user = openPage("/school/students?class=c6&q=asha");
    await screen.findByText("Asha Verma");
    await user.click(tab(/New admissions/));
    await waitFor(() => expect(lists(calls).some((c) => new URLSearchParams(c.query).get("admitted") === "year")).toBe(true));
    const asked = new URLSearchParams(lists(calls).at(-1)!.query);
    expect(Object.fromEntries(asked)).toMatchObject({ admitted: "year", classId: "c6", q: "asha" });
    expect(here()).toBe("/school/students?class=c6&q=asha&tab=new");
    expect(tab(/New admissions/)).toHaveAttribute("aria-selected", "true");
    // The same search box and class pickers.
    expect(screen.getByRole("textbox", { name: "Search students by name or admission number" })).toHaveValue("asha");
    expect(screen.getByLabelText("Show the students of a class")).toBeInTheDocument();
    // Going back to Active students takes the filter off again (that list was read a moment ago, so it is shown from what the page holds).
    await user.click(tab(/Active students/));
    expect(here()).toBe("/school/students?class=c6&q=asha");
    expect(tab(/Active students/)).toHaveAttribute("aria-selected", "true");
    expect(await screen.findByText("Asha Verma")).toBeInTheDocument();
  });

  it("a new tab starts again from the first page", async () => {
    school([ASHA], counted());
    const user = openPage("/school/students?page=3");
    await screen.findByText("Asha Verma");
    await user.click(tab(/New admissions/));
    expect(here()).toBe("/school/students?tab=new");
  });

  it("the tiles (students, classes, seats) belong to the Active students tab only", async () => {
    school([ASHA], counted());
    const user = openPage();
    await screen.findByText("Asha Verma");
    expect(screen.getByRole("region", { name: "Students at a glance" })).toBeInTheDocument();
    await user.click(tab(/New admissions/));
    await waitFor(() => expect(screen.queryByRole("region", { name: "Students at a glance" })).not.toBeInTheDocument());
  });

  it("the tabs sit BETWEEN the tiles and the filter row: tiles, then tabs, then the search box", async () => {
    school([ASHA], counted());
    openPage();
    await screen.findByText("Asha Verma");
    const tiles = screen.getByRole("region", { name: "Students at a glance" });
    const search = screen.getByRole("textbox", { name: "Search students by name or admission number" });
    const follows = (a: Node, b: Node) => Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
    expect(follows(tiles, tabs())).toBe(true);
    expect(follows(tabs(), search)).toBe(true);
  });

  it("Inactive shows the students who left, with their own search and Make active, and does not read the active list", async () => {
    const calls = school([ASHA], {
      ...counted(),
      "GET /students/inactive": () => ({ items: [LEFT], page: 1, limit: 20, total: 1, totalPages: 1 }),
    });
    const user = openPage();
    await screen.findByText("Asha Verma");
    const before = lists(calls).length;
    await user.click(tab(/Inactive/));
    expect(await screen.findByText("Dev Patel")).toBeInTheDocument();
    expect(here()).toBe("/school/students?tab=inactive");
    expect(screen.getByRole("textbox", { name: "Search the inactive students" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Make Dev Patel active" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Students", level: 1 })).toBeInTheDocument();
    expect(lists(calls)).toHaveLength(before);
  });

  it("opens straight on a tab from the address (a link, a reload, the old Inactive students address)", async () => {
    school([ASHA], { ...counted(), "GET /students/inactive": () => ({ items: [LEFT], page: 1, limit: 20, total: 1, totalPages: 1 }) });
    openPage("/school/students?tab=inactive");
    expect(await screen.findByText("Dev Patel")).toBeInTheDocument();
    expect(tab(/Inactive/)).toHaveAttribute("aria-selected", "true");
  });

  it("Inactive is for the people the school allowed to make students inactive; without it there is no such tab, and its address shows the active list", async () => {
    school([ASHA], counted());
    openPage("/school/students?tab=inactive", { role: "receptionist", permissions: ["students.view"] });
    expect(await screen.findByText("Asha Verma")).toBeInTheDocument();
    expect(within(tabs()).getAllByRole("tab").map((t) => t.textContent)).toEqual(["Active students2", "New admissions1"]);
    expect(tab(/Active students/)).toHaveAttribute("aria-selected", "true");
  });

  it("a school with nobody on the rolls and nobody inactive has no tabs, only the card that says so; one whose students all left still reaches them", async () => {
    school([], counted({ students: 0, newAdmissions: 0, inactive: 0 }));
    openPage();
    await screen.findByText("No students yet");
    expect(screen.queryByRole("tablist")).not.toBeInTheDocument();
    fresh();
    school([], counted({ students: 0, newAdmissions: 0, inactive: 2 }));
    openPage();
    await screen.findByText("No students yet");
    expect(tab(/Inactive/)).toBeInTheDocument();
  });

  it("New admissions with nobody in it says so in one line (not the \"Nobody matches\" of a search)", async () => {
    school([], counted({ students: 5, newAdmissions: 0 }));
    openPage("/school/students?tab=new");
    expect(await screen.findByRole("heading", { name: "No new admissions this year" })).toBeInTheDocument();
    expect(screen.queryByText("Nobody matches")).not.toBeInTheDocument();
  });

  it("the main button of the page is orange (Add student), and so is the one on the empty card", async () => {
    school([ASHA], counted());
    openPage();
    await screen.findByText("Asha Verma");
    expect(screen.getByRole("link", { name: "Add student" }).className).toContain("bg-orange");
    fresh();
    school([], counted({ students: 0, inactive: 0 }));
    openPage();
    await screen.findByText("No students yet");
    expect(screen.getByRole("link", { name: "Add your first student" }).className).toContain("bg-orange");
  });
});

const OWES: Dues = {
  year: "2026-2027",
  asOn: "2026-11-19",
  totals: { students: 2, dueNow: 5000, overdue: 3000 },
  items: [
    { studentId: "s1", name: "Asha Verma", admissionNumber: "ADM-2026-0001", classId: "c1", classLabel: "Class 1", dueNow: 3000, overdue: 3000, instalments: 3, oldestDue: "2026-04-10", lateFine: 300 },
    { studentId: "s2", name: "Kabir Rao", admissionNumber: "ADM-2026-0002", classId: "c6", classLabel: "Class 6 - A", dueNow: 2000, overdue: 0, instalments: 2, oldestDue: "2026-11-10", lateFine: 0 },
  ],
};

describe("Students: the Fee overdue tab (2026-11-22: the fee collection module is there, so the tab of the reference pictures is real)", () => {
  const counted = () => ({ "GET /students/capacity": () => ({ ...CAPACITY, totals: { ...CAPACITY.totals, students: 2, newAdmissions: 1, inactive: 3 } }) });
  const owing = (over: Record<string, Handler> = {}) => ({ ...counted(), "GET /fees/dues": () => OWES, ...over });
  const tabs = () => screen.getByRole("tablist", { name: "Which students to show" });
  const tab = (name: RegExp) => within(tabs()).getByRole("tab", { name });
  const here = () => screen.getByTestId("where").textContent;

  it("is a tab between New admissions and Inactive, with the number of students who owe (the same read as the Dues page)", async () => {
    const calls = school([ASHA, KABIR], owing());
    openPage();
    await screen.findByText("Asha Verma");
    await waitFor(() => expect(within(tabs()).getAllByRole("tab").map((t) => t.textContent)).toEqual(["Active students2", "New admissions1", "Fee overdue2", "Inactive3"]));
    expect(calls.filter((c) => c.path === "/fees/dues")).toHaveLength(1);
  });

  it("is for the people who may collect fees: without fees.collect there is no tab, and the dues are not even asked for", async () => {
    const calls = school([ASHA], owing());
    openPage("/school/students", { role: "receptionist", permissions: ["students.view", "students.status"] });
    await screen.findByText("Asha Verma");
    expect(within(tabs()).getAllByRole("tab").map((t) => t.textContent)).toEqual(["Active students2", "New admissions1", "Inactive3"]);
    expect(calls.filter((c) => c.path === "/fees/dues")).toHaveLength(0);
  });

  it("opens the students who owe: class, due now, late and the oldest due, and an orange Collect that leads to the account; the active list is not read again", async () => {
    const calls = school([ASHA], owing());
    const user = openPage();
    await screen.findByText("Asha Verma");
    const before = calls.filter((c) => c.method === "GET" && c.path === "/students").length;
    await user.click(await screen.findByRole("tab", { name: /Fee overdue/ }));
    const table = await screen.findByRole("table", { name: "Students with fees overdue" });
    const asha = within(table).getByRole("row", { name: /Asha Verma/ });
    expect(asha).toHaveTextContent("Class 1");
    expect(within(asha).getByText("₹3,000", { selector: "td.text-danger" })).toBeInTheDocument();
    expect(asha).toHaveTextContent("10 Apr 2026");
    const collect = within(table).getByRole("link", { name: "Collect from Kabir Rao" });
    expect(collect).toHaveAttribute("href", "/fees/collect?student=s2");
    expect(collect.className).toContain("bg-orange");
    expect(within(table).getByRole("link", { name: "Asha Verma" })).toHaveAttribute("href", "/school/students/s1");
    expect(here()).toBe("/school/students?tab=fees");
    expect(tab(/Fee overdue/)).toHaveAttribute("aria-selected", "true");
    expect(calls.filter((c) => c.method === "GET" && c.path === "/students")).toHaveLength(before);
    // The tiles are the Active tab's.
    expect(screen.queryByRole("region", { name: "Students at a glance" })).not.toBeInTheDocument();
  });

  it("has its own search and class pickers, and the server does the finding (the same one the Dues page uses)", async () => {
    const calls = school([ASHA], owing({ "GET /fees/dues": (_b, q) => (q.get("search") === "zzz" ? { ...OWES, items: [], totals: { students: 0, dueNow: 0, overdue: 0 } } : q.get("classId") === "c6" ? { ...OWES, items: [OWES.items[1]], totals: { students: 1, dueNow: 2000, overdue: 0 } } : OWES) }));
    const user = openPage("/school/students?tab=fees");
    await screen.findByRole("table", { name: "Students with fees overdue" });
    await user.click(screen.getByLabelText("Show the students of a class"));
    await user.click(await screen.findByRole("option", { name: "Class 6" }));
    await waitFor(() => expect(calls.some((c) => c.path === "/fees/dues" && c.query.includes("classId=c6"))).toBe(true));
    expect(await screen.findByRole("link", { name: "Collect from Kabir Rao" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Collect from Asha Verma" })).not.toBeInTheDocument();
    await user.type(screen.getByRole("textbox", { name: "Search students who owe fees" }), "zzz");
    expect(await screen.findByText("No student matches")).toBeInTheDocument();
    expect(calls.some((c) => c.path === "/fees/dues" && c.query.includes("search=zzz"))).toBe(true);
  });

  it("nobody owing says so in one line", async () => {
    school([ASHA], owing({ "GET /fees/dues": () => ({ ...OWES, items: [], totals: { students: 0, dueNow: 0, overdue: 0 } }) }));
    openPage("/school/students?tab=fees");
    expect(await screen.findByRole("heading", { name: "No fees are overdue" })).toBeInTheDocument();
  });

  it("is not there while a year that is over is open (the dues are the running year's)", async () => {
    const calls = school([ASHA], owing());
    store.dispatch(yearViewChanged("y26"));
    openPage();
    await screen.findByText("Asha Verma");
    expect(within(tabs()).queryByRole("tab", { name: /Fee overdue/ })).not.toBeInTheDocument();
    expect(calls.filter((c) => c.path === "/fees/dues")).toHaveLength(0);
    store.dispatch(yearViewChanged(null));
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

  it("each button comes with its own permission: status keeps the active-list ticks while Inactive is a sidebar destination", async () => {
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
    expect(screen.queryByRole("navigation", { name: "Students by status" })).not.toBeInTheDocument();
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
