import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { Provider } from "react-redux";
import { RouterProvider, createMemoryRouter } from "react-router";
import { ToastProvider } from "../../../components/ui/toast-context";
import { allApiSlices } from "../../../redux/api/apiRoot";
import store from "../../../redux/store";
import { fakeApi } from "../../../test/fakeApi";
import { signInAs, signOut } from "../../../test/session";
import type { ChildDetail } from "../../../types";
import ChildPage from "../ChildPage";

/** What the school allowed the parents (Permissions): each part of the child's day is shown, and asked for, only when it is allowed. */

const ASHA: ChildDetail = {
  id: "s1",
  name: "Asha Verma",
  firstName: "Asha",
  lastName: "Verma",
  admissionNumber: "ADM-2026-0001",
  gender: "Female",
  dateOfBirth: "2018-05-14",
  admissionDate: "2026-04-01",
  bloodGroup: null,
  category: null,
  place: { className: "Class 5", sectionName: "A", rollNumber: 12, label: "Class 5 - A" },
  classTeacher: { name: "Meena Singh" },
  address: { line1: "12 MG Road", line2: null, city: "Bhopal", state: "Madhya Pradesh", pincode: "462001" },
  previousSchool: null,
  records: {},
  guardians: [],
};
const MONTH = { month: "2026-11", days: [], monthTally: { present: 0, absent: 0, late: 0, leave: 0, days: 0, percent: null }, year: { present: 0, absent: 0, late: 0, leave: 0, days: 0, percent: null } };

function openPage(permissions: string[]) {
  signInAs("parent", permissions);
  const calls = fakeApi({
    "GET /parent/children/s1": () => ASHA,
    "GET /parent/children/s1/timetable": () => ({ label: "Class 5 - A", status: "published", publishedAt: null, days: [], cells: [], allotments: [], teachers: [] }),
    "GET /parent/children/s1/exams": () => ({ items: [], week: { from: "2026-09-14", to: "2026-09-20", days: [] } }),
    "GET /parent/children/s1/attendance": () => MONTH,
    "GET /parent/children/s1/leaves": () => ({ items: [] }),
    "GET /parent/children/s1/diary": () => ({ date: "2026-11-04", entries: [] }),
    "GET /parent/children/s1/tests": () => ({ upcoming: [], results: [], average: null }),
  });
  const router = createMemoryRouter([{ path: "/my-children/:id", element: <ChildPage /> }], { initialEntries: ["/my-children/s1"] });
  render(
    <Provider store={store}>
      <ToastProvider>
        <RouterProvider router={router} />
      </ToastProvider>
    </Provider>
  );
  return calls;
}
const sections = () => screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent);

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  signOut();
  for (const slice of allApiSlices) store.dispatch(slice.util.resetApiState());
});

describe("the child's page follows what the school allowed the parents", () => {
  it("with everything allowed it has every part of the day", async () => {
    openPage(["calendar.view", "child.attendance", "child.timetable", "child.exams", "child.diary", "child.leave"]);
    await screen.findByRole("heading", { name: "Asha Verma", level: 1 });
    expect(sections()).toEqual(expect.arrayContaining(["Exams", "Timetable", "Class", "About"]));
    expect(await screen.findByRole("region", { name: "Exams" })).toBeInTheDocument();
  });

  it("with only the attendance allowed it shows no diary, tests, exams, leave or timetable, and asks the server for none of them", async () => {
    const calls = openPage(["child.attendance"]);
    await screen.findByRole("heading", { name: "Asha Verma", level: 1 });
    expect(screen.queryByRole("region", { name: "Exams" })).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Timetable" })).not.toBeInTheDocument();
    expect(sections()).not.toContain("Timetable");
    // The child's own record (class, about, parents) stays: it is who the child is.
    expect(sections()).toContain("Class");
    await vi.waitFor(() => expect(calls.some((c) => c.path === "/parent/children/s1/attendance")).toBe(true));
    for (const gone of ["timetable", "exams", "leaves", "diary", "tests"]) {
      expect(calls.some((c) => c.path === `/parent/children/s1/${gone}`), gone).toBe(false);
    }
  });

  it("with nothing allowed it is just the child's record", async () => {
    const calls = openPage([]);
    await screen.findByRole("heading", { name: "Asha Verma", level: 1 });
    expect(calls.map((c) => c.path).filter((p) => p !== "/parent/children/s1")).toEqual([]);
  });
});
