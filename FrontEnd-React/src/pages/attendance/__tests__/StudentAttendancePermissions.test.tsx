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

function open(role: UserRole, permissions: string[], path = "/attendance/students") {
  signInAs(role, permissions);
  fakeApi({
    "GET /academics/structure": () => STRUCTURE,
    "GET /attendance/students": () => RANGE,
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

describe("Take attendance, from the page of the school's attendance", () => {
  it("a person who may take it gets a link to the class's day (a class without sections: the class itself)", async () => {
    open("receptionist", ["attendance.view", "attendance.mark"]);
    expect(await screen.findByRole("link", { name: "Take attendance" })).toHaveAttribute("href", "/class-work/c1?tab=attendance");
  });

  it("a class with sections: the link waits for one section to be picked, then names it", async () => {
    const user = open("receptionist", ["attendance.view", "attendance.mark"], "/attendance/students?class=c5");
    await screen.findByRole("radiogroup", { name: "Section" });
    expect(screen.queryByRole("link", { name: "Take attendance" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("radio", { name: "B" }));
    expect(await screen.findByRole("link", { name: "Take attendance" })).toHaveAttribute("href", "/class-work/c5?section=c5-B&tab=attendance");
  });

  it("a person who may only see attendance has no such link", async () => {
    open("receptionist", ["attendance.view"]);
    await screen.findByRole("radiogroup", { name: "Class" });
    expect(screen.queryByRole("link", { name: "Take attendance" })).not.toBeInTheDocument();
  });

  it("the school admin always has it", async () => {
    open("school_admin", []);
    expect(await screen.findByRole("link", { name: "Take attendance" })).toBeInTheDocument();
  });
});
