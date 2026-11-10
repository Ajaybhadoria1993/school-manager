import { afterEach, describe, expect, it } from "vitest";
import { act, cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Provider } from "react-redux";
import { MemoryRouter } from "react-router";
import store from "../../../redux/store";
import { sessionStarted, signedOut } from "../../../redux/slices/authSlice";
import { Sidebar } from "../Sidebar";

/**
 * The navy menu. Under Manage school, Timetable is ONE row (2026-11-10, user: "Timetable option rahe, click karun to nested 2 option
 * dikhe: School timings, Class timetables"): it opens its two pages underneath, nested one step further in.
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

describe("the menu: Timetable with its two pages nested under it", () => {
  it("shows one Timetable row under Manage school, closed, and no School timings or Class timetables of its own at the first level", () => {
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

  it("leaves the other pages of Manage school where they were, beside the Timetable row", () => {
    openMenu("/school/classes");
    const names = screen.getAllByRole("link").map((a) => a.textContent);
    expect(names).toEqual(expect.arrayContaining(["Classes & Sections", "Promotion", "Test & Exam", "Manage Students", "Manage Teacher"]));
    expect(names.indexOf("School timings")).toBeGreaterThan(names.indexOf("Promotion"));
    expect(names.indexOf("Class timetables")).toBeLessThan(names.indexOf("Test & Exam"));
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

  it("the Teacher and Staff entries of the menu stay where they were, beside the Attendance row, and leave it closed", () => {
    openMenu("/teachers");
    expect(row("Attendance")).toHaveAttribute("aria-expanded", "false");
    const teacher = screen.getAllByRole("link", { name: "Teacher" }).find((a) => a.getAttribute("href") === "/teachers")!;
    expect(teacher).toHaveAttribute("aria-current", "page");
    expect(screen.getAllByRole("link", { name: "Staff" }).map((a) => a.getAttribute("href"))).toEqual(["/attendance/staff", "/staff"]);
  });
});
