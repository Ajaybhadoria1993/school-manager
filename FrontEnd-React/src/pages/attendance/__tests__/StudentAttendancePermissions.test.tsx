import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Provider } from "react-redux";
import { RouterProvider, createMemoryRouter } from "react-router";
import { ToastProvider } from "../../../components/ui/toast-context";
import { allApiSlices } from "../../../redux/api/apiRoot";
import store from "../../../redux/store";
import { fakeApi } from "../../../test/fakeApi";
import { STRUCTURE } from "../../../test/schoolClass";
import { signInAs, signOut } from "../../../test/session";
import { todayInIndia } from "../../../utils/students";
import type { UserRole } from "../../../types";
import StudentAttendancePage from "../StudentAttendance";

/** Attendance > Student gives the way to take a class's day only to the people the school allowed to take it (Permissions). */

const today = todayInIndia();
const RANGE = {
  classId: "c1",
  sectionId: null,
  label: "Class 1",
  from: today.slice(0, 8) + "01",
  to: today,
  days: [],
  students: [],
  summary: { students: 0, present: 0, absent: 0, late: 0, leave: 0, percent: null },
};

function open(role: UserRole, permissions: string[], path = "/attendance/students", sheet: object = RANGE) {
  signInAs(role, permissions);
  fakeApi({
    "GET /academics/structure": () => STRUCTURE,
    "GET /attendance/students": () => sheet,
    "GET /attendance/students/today": () => ({ date: today, working: true, holiday: null, pending: [] }),
  });
  const router = createMemoryRouter([{ path: "/attendance/students", element: <StudentAttendancePage /> }], { initialEntries: [path] });
  render(
    <Provider store={store}>
      <ToastProvider>
        <RouterProvider router={router} />
      </ToastProvider>
    </Provider>
  );
  return userEvent.setup();
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  signOut();
  for (const slice of allApiSlices) store.dispatch(slice.util.resetApiState());
});

describe("The school only looks at the students' attendance (2026-11-17)", () => {
  // A week that is over: Monday 9 Nov with nobody marked.
  const PAST_WEEK = {
    ...RANGE,
    from: "2026-11-09",
    to: "2026-11-14",
    days: [{ date: "2026-11-09", weekday: 1, holiday: null, taken: false }],
    students: [{ id: "s1", name: "Asha Verma", admissionNumber: "ADM-1", rollNumber: 1, section: null, records: [], tally: { present: 0, absent: 0, late: 0, leave: 0, days: 0, percent: null } }],
    summary: { students: 1, present: 0, absent: 0, late: 0, leave: 0, percent: null },
  };
  const WEEK = "/attendance/students?from=2026-11-09&to=2026-11-14";

  it("nobody gets a Take attendance button here: not the school admin, not a receptionist, not a person allowed to see attendance", async () => {
    for (const [role, permissions] of [["school_admin", []], ["receptionist", ["attendance.view"]], ["receptionist", ["attendance.view", "attendance.mark"]]] as const) {
      open(role, [...permissions]);
      await screen.findByRole("radiogroup", { name: "Class" });
      expect(screen.queryByRole("link", { name: "Take attendance" })).not.toBeInTheDocument();
      cleanup();
      for (const slice of allApiSlices) store.dispatch(slice.util.resetApiState());
    }
  });

  it("Not taken is read by everyone who may see attendance, and no cell can be clicked: not by the school admin, not by a staff member given attendance.mark", async () => {
    for (const [role, permissions] of [["school_admin", []], ["receptionist", ["attendance.view", "attendance.mark"]]] as const) {
      open(role, [...permissions], WEEK, PAST_WEEK);
      expect((await screen.findAllByText("Not taken")).length).toBeGreaterThan(0);
      expect(screen.queryByRole("button", { name: /not taken/ })).not.toBeInTheDocument();
      cleanup();
      for (const slice of allApiSlices) store.dispatch(slice.util.resetApiState());
    }
  });
});
