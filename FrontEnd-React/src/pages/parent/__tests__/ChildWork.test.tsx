import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Provider } from "react-redux";
import { RouterProvider, createMemoryRouter } from "react-router";
import { ToastProvider } from "../../../components/ui/toast-context";
import { allApiSlices } from "../../../redux/api/apiRoot";
import store from "../../../redux/store";
import { sessionStarted, signedOut } from "../../../redux/slices/authSlice";
import { fakeApi, type Handler } from "../../../test/fakeApi";
import type { ChildDetail, ChildDiary, ChildTests } from "../../../types";
import ChildPage from "../ChildPage";

/** The child's diary (homework, what was taught) and tests (coming ones, marks and the average), for their parent (phases 4 and 5). */

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
const DIARY: ChildDiary = { date: "2026-11-04", entries: [{ subjectName: "Mathematics", taught: "Fractions: adding", homework: "Page 42", writtenBy: "Meena Singh" }] };
const TESTS: ChildTests = {
  upcoming: [{ id: "t2", subjectName: "English", date: "2026-11-10", topic: "Poems", maxMarks: 25 }],
  results: [
    { id: "t1", subjectName: "Mathematics", date: "2026-11-02", topic: "Fractions", maxMarks: 20, marks: 15, absent: false, percent: 75 },
    { id: "t0", subjectName: "Science", date: "2026-10-28", topic: "Plants", maxMarks: 10, marks: null, absent: true, percent: null },
  ],
  average: 75,
};

function openPage(extra: Record<string, Handler> = {}) {
  const calls = fakeApi({
    "GET /parent/children/s1": () => ASHA,
    "GET /parent/children/s1/timetable": () => null,
    "GET /parent/children/s1/attendance": () => ({ month: "2026-11", days: [], monthTally: { present: 0, absent: 0, late: 0, leave: 0, days: 0, percent: null }, year: { present: 0, absent: 0, late: 0, leave: 0, days: 0, percent: null } }),
    "GET /parent/children/s1/leaves": () => ({ items: [] }),
    "GET /parent/children/s1/diary": () => DIARY,
    "GET /parent/children/s1/tests": () => TESTS,
    ...extra,
  });
  const router = createMemoryRouter([{ path: "/my-children/:id", element: <ChildPage /> }], { initialEntries: ["/my-children/s1"] });
  render(
    <Provider store={store}>
      <ToastProvider>
        <RouterProvider router={router} />
      </ToastProvider>
    </Provider>
  );
  return { calls, user: userEvent.setup() };
}

beforeEach(() => {
  store.dispatch(
    sessionStarted({
      user: { id: "u9", name: "Ravi Verma", email: null, username: "ravi", role: "parent", tenantId: "t1", emailVerifiedAt: null },
      tenant: { id: "t1", name: "Sunrise Public School", approvalStatus: "approved", isActive: true },
    } as never)
  );
});

afterEach(() => {
  cleanup();
  for (const api of allApiSlices) store.dispatch(api.util.resetApiState());
  store.dispatch(signedOut());
  vi.unstubAllGlobals();
});

describe("the child's page", () => {
  it("puts the child's day first (diary, tests, attendance, leave, timetable) and their details after", async () => {
    openPage();
    const order = ["Diary", "Tests and marks", "Attendance", "Leave", "Timetable", "Class", "About"];
    const regions = await Promise.all(order.map((name) => screen.findByRole("region", { name })));
    for (let i = 1; i < regions.length; i++) {
      expect(regions[i - 1].compareDocumentPosition(regions[i]) & Node.DOCUMENT_POSITION_FOLLOWING, `${order[i - 1]} before ${order[i]}`).toBeTruthy();
    }
  });
});

describe("the child's diary", () => {
  it("shows today's homework and what was taught, subject by subject", async () => {
    openPage();
    const diary = await screen.findByRole("region", { name: "Diary" });
    await waitFor(() => expect(diary).toHaveTextContent("Mathematics"));
    expect(diary).toHaveTextContent("Fractions: adding");
    expect(diary).toHaveTextContent("Page 42");
  });

  it("goes to the day before in one click", async () => {
    const { calls, user } = openPage();
    const diary = await screen.findByRole("region", { name: "Diary" });
    await waitFor(() => expect(diary).toHaveTextContent("Mathematics"));
    await user.click(within(diary).getByRole("button", { name: "Day before" }));
    await waitFor(() => expect(calls.some((c) => c.path === "/parent/children/s1/diary" && c.query === "?date=2026-11-03")).toBe(true));
  });
});

describe("the child's tests and performance", () => {
  it("shows the coming tests, each result with marks and percentage (absent said so), and the average", async () => {
    openPage();
    const tests = await screen.findByRole("region", { name: "Tests and marks" });
    await waitFor(() => expect(tests).toHaveTextContent("Average 75%"));
    expect(within(tests).getByRole("list", { name: "Coming tests" })).toHaveTextContent("English: Poems");
    const results = within(tests).getByRole("table", { name: "Results" });
    expect(within(results).getByRole("row", { name: /Mathematics/ })).toHaveTextContent("15 / 20");
    expect(within(results).getByRole("row", { name: /Mathematics/ })).toHaveTextContent("75%");
    expect(within(results).getByRole("row", { name: /Science/ })).toHaveTextContent("Absent");
  });
});
