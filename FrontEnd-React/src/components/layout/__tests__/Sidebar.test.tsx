import { afterEach, describe, expect, it } from "vitest";
import { act, cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Provider } from "react-redux";
import { MemoryRouter } from "react-router";
import store from "../../../redux/store";
import { sessionStarted, signedOut } from "../../../redux/slices/authSlice";
import { Sidebar } from "../Sidebar";

/**
 * Timetable is one expandable row in the main sidebar just below Attendance, with School timings and Class timetables nested inside it.
 */

const signIn = (role = "school_admin") =>
  store.dispatch(
    sessionStarted({
      user: { id: "u1", name: "Asha Verma", email: "asha@sunrise.example", username: null, role, tenantId: "t1", emailVerifiedAt: null },
      tenant: { id: "t1", name: "Sunrise Public School", approvalStatus: "approved", isActive: true, mediums: [] },
    } as never)
  );

function openMenu(path = "/school/classes") {
  signIn();
  render(
    <Provider store={store}>
      <MemoryRouter initialEntries={[path]}>
        <Sidebar mobileOpen={false} onClose={() => {}} />
      </MemoryRouter>
    </Provider>
  );
}

afterEach(() => {
  cleanup();
  act(() => {
    store.dispatch(signedOut());
  });
  try {
    localStorage.clear();
  } catch {
    // Nothing remembered to clear.
  }
});

const row = (name: string) => screen.getByRole("button", { name });
/** The pages nested under a row. */
const nestedOf = (name: string) => within(document.getElementById(row(name).getAttribute("aria-controls")!)!);
const timetableRow = () => row("Timetable");
const nested = () => nestedOf("Timetable");

describe("the menu: Timetable below Attendance with its two pages nested under it", () => {
  it("shows one Timetable row at the main sidebar level, closed, with its two pages nested inside", () => {
    openMenu("/school/classes");
    expect(timetableRow()).toHaveAttribute("aria-expanded", "false");
    // The two pages are only inside the Timetable row's panel.
    expect(nested().getAllByRole("link").map((a) => a.textContent)).toEqual(["School timings", "Class timetables"]);
    expect(screen.getAllByRole("link", { name: "School timings" })).toHaveLength(1);
    expect(screen.queryByRole("link", { name: "Timetable" })).not.toBeInTheDocument();
  });

  it("clicking Timetable opens its two pages, clicking it again closes them", async () => {
    const user = userEvent.setup();
    openMenu("/school/classes");
    await user.click(timetableRow());
    expect(timetableRow()).toHaveAttribute("aria-expanded", "true");
    expect(nested().getByRole("link", { name: "School timings" })).toHaveAttribute("href", "/school/timings");
    expect(nested().getByRole("link", { name: "Class timetables" })).toHaveAttribute("href", "/school/timetable");
    await user.click(timetableRow());
    expect(timetableRow()).toHaveAttribute("aria-expanded", "false");
  });

  it("is open on one of its pages, and that page is the one lit", () => {
    openMenu("/school/timings");
    expect(timetableRow()).toHaveAttribute("aria-expanded", "true");
    expect(nested().getByRole("link", { name: "School timings" })).toHaveAttribute("aria-current", "page");
    expect(nested().getByRole("link", { name: "Class timetables" })).not.toHaveAttribute("aria-current");
  });

  it("the subjects page and a teacher's week, which sit under /school/timetable, light Class timetables and keep the row open", () => {
    openMenu("/school/timetable/subjects");
    expect(timetableRow()).toHaveAttribute("aria-expanded", "true");
    expect(nested().getByRole("link", { name: "Class timetables" })).toHaveAttribute("aria-current", "page");
  });

  it("keeps class setup under the single Classes entry and Timetable outside Manage school", () => {
    openMenu("/school/classes");
    const names = screen.getAllByRole("link").map((a) => a.textContent);
    expect(names).toEqual(expect.arrayContaining(["Classes", "Promotion", "Test & Exam", "Active teachers", "Inactive teachers"]));
    expect(names).not.toContain("Manage Teacher");
    expect(names).not.toContain("Manage Students");
    expect(screen.getAllByRole("link", { name: "Classes" })).toHaveLength(1);
    expect(screen.getAllByRole("button", { name: "Students" })).toHaveLength(1);
    expect(screen.getAllByRole("button", { name: "Teachers" })).toHaveLength(1);
    expect(screen.getAllByRole("button", { name: "Timetable" })).toHaveLength(1);
    expect(screen.getByRole("link", { name: "Classes" })).toHaveAttribute("aria-current", "page");
    expect(screen.queryByRole("link", { name: "Classes & Sections" })).not.toBeInTheDocument();
  });

  it("opens the Students row into separate Active and Inactive pages, and marks the current page", async () => {
    const user = userEvent.setup();
    openMenu("/school/students/inactive");
    expect(row("Students")).toHaveAttribute("aria-expanded", "true");
    const studentPages = nestedOf("Students");
    expect(studentPages.getAllByRole("link").map((link) => [link.textContent, link.getAttribute("href")])).toEqual([
      ["Active students", "/school/students"],
      ["Inactive students", "/school/students/inactive"],
    ]);
    expect(studentPages.getByRole("link", { name: "Inactive students" })).toHaveAttribute("aria-current", "page");
    await user.click(row("Students"));
    expect(row("Students")).toHaveAttribute("aria-expanded", "false");
  });

  it("opens the Teacher row into one active directory and one inactive directory", () => {
    openMenu("/teachers/inactive");
    expect(row("Teachers")).toHaveAttribute("aria-expanded", "true");
    const teacherPages = nestedOf("Teachers");
    expect(teacherPages.getAllByRole("link").map((link) => [link.textContent, link.getAttribute("href")])).toEqual([
      ["Active teachers", "/teachers"],
      ["Inactive teachers", "/teachers/inactive"],
    ]);
    expect(teacherPages.getByRole("link", { name: "Inactive teachers" })).toHaveAttribute("aria-current", "page");
  });
});

describe("the menu: Attendance with its three pages nested under it", () => {
  it("is one row at the first level, closed; clicking it opens Student, Teacher and Staff, and clicking again closes them", async () => {
    const user = userEvent.setup();
    openMenu("/dashboard");
    expect(row("Attendance")).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("link", { name: "Attendance" })).not.toBeInTheDocument();
    await user.click(row("Attendance"));
    expect(row("Attendance")).toHaveAttribute("aria-expanded", "true");
    expect(nestedOf("Attendance").getAllByRole("link").map((a) => [a.textContent, a.getAttribute("href")])).toEqual([
      ["Student", "/attendance/students"],
      ["Teacher", "/attendance/teachers"],
      ["Staff", "/attendance/staff"],
    ]);
    await user.click(row("Attendance"));
    expect(row("Attendance")).toHaveAttribute("aria-expanded", "false");
  });

  it("is open on one of its pages, and only that page is lit (not the Teacher entry of the menu with the same word)", () => {
    openMenu("/attendance/teachers");
    expect(row("Attendance")).toHaveAttribute("aria-expanded", "true");
    expect(nestedOf("Attendance").getByRole("link", { name: "Teacher" })).toHaveAttribute("aria-current", "page");
    expect(screen.getAllByRole("link").filter((a) => a.getAttribute("aria-current") === "page")).toHaveLength(1);
  });

  it("the Teachers submenu and Staff stay beside Attendance, with the active teacher page selected", () => {
    openMenu("/teachers");
    expect(row("Attendance")).toHaveAttribute("aria-expanded", "false");
    expect(row("Teachers")).toHaveAttribute("aria-expanded", "true");
    const teacher = nestedOf("Teachers").getByRole("link", { name: "Active teachers" });
    expect(teacher).toHaveAttribute("aria-current", "page");
    expect(screen.getAllByRole("link", { name: "Staff" }).map((a) => a.getAttribute("href"))).toEqual(["/attendance/staff", "/staff"]);
  });
});
