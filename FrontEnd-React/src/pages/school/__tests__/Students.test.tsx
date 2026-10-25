import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Provider } from "react-redux";
import { RouterProvider, createMemoryRouter } from "react-router";
import { ToastProvider } from "../../../components/ui/toast-context";
import { allApiSlices } from "../../../redux/api/apiRoot";
import store from "../../../redux/store";
import type { StudentPage, StudentRow, StudentSettings } from "../../../types";
import { fakeApi, type Handler } from "../../../test/fakeApi";
import { CAPACITY, SETTINGS, STRUCTURE } from "../../../test/fixtures";
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

function openPage() {
  const router = createMemoryRouter([{ path: "/school/students", element: <StudentsPage /> }], { initialEntries: ["/school/students"] });
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

describe("Students, a school that has students", () => {
  it("shows the list, not the empty state, under the same header", async () => {
    school([ASHA]);
    openPage();
    expect(await screen.findByText("Asha Verma")).toBeInTheDocument();
    expect(screen.queryByText("No students yet")).not.toBeInTheDocument();
    expect(headerButtons()).toEqual(["Guide", "Export", "Bulk upload", "Add student"]);
    expect(screen.getByRole("link", { name: "Bulk upload" })).toHaveAttribute("href", "/school/students/import");
  });
});
