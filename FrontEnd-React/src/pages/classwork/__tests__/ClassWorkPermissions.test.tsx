import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { Provider } from "react-redux";
import { RouterProvider, createMemoryRouter } from "react-router";
import { ToastProvider } from "../../../components/ui/toast-context";
import { allApiSlices } from "../../../redux/api/apiRoot";
import store from "../../../redux/store";
import { fakeApi } from "../../../test/fakeApi";
import { signInAs, signOut } from "../../../test/session";
import { todayInIndia } from "../../../utils/students";
import type { UserRole } from "../../../types";
import ClassWorkPage from "../ClassWorkPage";

/** A class's work follows what the school allowed (Permissions): the school's staff work on any class, a teacher on their own. */

const SHEET = {
  classId: "c5",
  sectionId: "c5-A",
  label: "Class 5 - A",
  date: todayInIndia(),
  holiday: null,
  // A day the class teacher has taken: the school sees the marks only of such a day (2026-11-23), not the server's Present of a day nobody took.
  saved: true,
  markedBy: { name: "Meena Singh", role: "teacher" },
  counts: { present: 2, absent: 0, late: 0, leave: 0 },
  students: [
    { id: "s1", name: "Asha Verma", admissionNumber: "ADM-1", rollNumber: 1, status: "present", reason: null },
    { id: "s2", name: "Kabir Rao", admissionNumber: "ADM-2", rollNumber: 2, status: "present", reason: null },
  ],
};

function openPage(role: UserRole, permissions: string[]) {
  signInAs(role, permissions);
  const calls = fakeApi({
    "GET /students/class-overview": () => ({ academicYear: { id: "y1", name: "2026-2027" }, classes: [{ id: "c5", name: "Class 5", sections: [{ id: "c5-A", name: "A" }] }] }),
    "GET /classroom/attendance": () => SHEET,
    "GET /classroom/my-classes": () => ({ items: [] }),
  });
  const router = createMemoryRouter([{ path: "/class-work/:classId", element: <ClassWorkPage /> }], { initialEntries: ["/class-work/c5?section=c5-A"] });
  render(
    <Provider store={store}>
      <ToastProvider>
        <RouterProvider router={router} />
      </ToastProvider>
    </Provider>
  );
  return calls;
}
const tabs = () => screen.getAllByRole("tab").map((t) => t.textContent);

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  signOut();
  for (const slice of allApiSlices) store.dispatch(slice.util.resetApiState());
});

describe("a class's attendance for the school's staff", () => {
  it("a receptionist allowed to see attendance gets the class's day with the marks, and nothing to change: no Save, the marks are fixed", async () => {
    const calls = openPage("receptionist", ["attendance.view"]);
    expect(await screen.findByRole("heading", { name: "Class 5 - A", level: 1 })).toBeInTheDocument();
    expect(tabs()).toEqual(["Attendance"]);
    const list = await screen.findByRole("list", { name: "Attendance" });
    const present = within(within(list).getByRole("listitem", { name: "Asha Verma" })).getByRole("radio", { name: "Present" });
    expect(present).toBeChecked();
    expect(present).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Save attendance" })).not.toBeInTheDocument();
    // They work on any class: no list of their own classes is asked for.
    expect(calls.some((c) => c.path === "/classroom/my-classes")).toBe(false);
  });

  it("a person who only looks has the summary of the day but no Mark all present, no Reset and no Save", async () => {
    openPage("receptionist", ["attendance.view"]);
    await screen.findByRole("list", { name: "Attendance" });
    const summary = within(screen.getByRole("region", { name: "Summary of the day" }));
    expect(summary.getByRole("heading", { name: "Today's summary" })).toBeInTheDocument();
    expect(summary.getByText("Present").parentElement).toHaveTextContent("Present2");
    expect(screen.queryByRole("button", { name: "Mark all present" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Reset" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Save attendance" })).not.toBeInTheDocument();
  });

  it("even with attendance.mark ticked a staff member only looks: the marks are fixed and there is no Save (only the class teacher takes it)", async () => {
    openPage("receptionist", ["attendance.view", "attendance.mark"]);
    const list = await screen.findByRole("list", { name: "Attendance" });
    expect(within(within(list).getByRole("listitem", { name: "Kabir Rao" })).getByRole("radio", { name: "Absent" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Save attendance" })).not.toBeInTheDocument();
    // No register to mark in either: that is the class teacher's.
    expect(screen.queryByText("Not taken")).not.toBeInTheDocument();
  });

  it("allowed nothing of a class's work: the page says so instead of an empty page", async () => {
    openPage("receptionist", ["calendar.view"]);
    expect(await screen.findByText(/not allowed to open the work of a class/)).toBeInTheDocument();
    expect(screen.queryByRole("tab")).not.toBeInTheDocument();
  });

  it("the school admin has every tab whatever list the session carries, and in Attendance only looks at the day", async () => {
    openPage("school_admin", []);
    await screen.findByRole("heading", { name: "Class 5 - A", level: 1 });
    expect(tabs()).toEqual(["Attendance", "Diary", "Tests", "Exams"]);
    const list = await screen.findByRole("list", { name: "Attendance" });
    expect(within(within(list).getByRole("listitem", { name: "Kabir Rao" })).getByRole("radio", { name: "Absent" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Save attendance" })).not.toBeInTheDocument();
  });
});
