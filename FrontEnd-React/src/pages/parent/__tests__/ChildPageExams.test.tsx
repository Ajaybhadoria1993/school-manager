import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { Provider } from "react-redux";
import { RouterProvider, createMemoryRouter } from "react-router";
import { ToastProvider } from "../../../components/ui/toast-context";
import { allApiSlices } from "../../../redux/api/apiRoot";
import store from "../../../redux/store";
import { sessionStarted, signedOut } from "../../../redux/slices/authSlice";
import { fakeApi, type Handler } from "../../../test/fakeApi";
import { GRID } from "../../../test/timetableFixtures";
import type { ChildDetail, ChildExams, ChildTimetable } from "../../../types";
import ChildPage from "../ChildPage";

/** The child's page carries the exams, and the child's timetable gives way on the week's exam days (2026-11-06). */

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

const WEEK: ChildTimetable = {
  label: "Class 5 - A",
  status: "published",
  publishedAt: "2026-09-01T00:00:00.000Z",
  days: GRID.days,
  cells: [{ day: 3, period: 1, lessons: [{ subjectId: "english", teacherId: null, room: null }] }],
  allotments: GRID.allotments.map((a) => ({ subjectId: a.subjectId, subjectName: a.subjectName, subjectCode: a.subjectCode, periodsPerWeek: a.periodsPerWeek, teacherId: a.teacherId })),
  teachers: [],
};

const MATHS = { id: "maths", name: "Mathematics" };
const EXAMS: ChildExams = {
  items: [
    {
      id: "e1",
      name: "Half-Yearly Exam",
      type: "half_yearly",
      typeLabel: "Half-yearly exam",
      full: true,
      startDate: "2026-09-14",
      endDate: "2026-09-30",
      schoolHours: { start: "08:00", end: "12:30" },
      note: null,
      status: "running",
      paperCount: 1,
      classCount: 1,
      papers: [{ id: "p1", subject: MATHS, date: "2026-09-16", startTime: "09:00", endTime: "10:00", durationMinutes: 60, topic: null, maxMarks: 50, result: null }],
      summary: null,
    },
  ],
  week: {
    from: "2026-09-14",
    to: "2026-09-20",
    days: [
      {
        date: "2026-09-16",
        day: 3,
        replacesLessons: true,
        schoolHours: { start: "08:00", end: "12:30" },
        exams: [{ id: "e1", name: "Half-Yearly Exam", typeLabel: "Half-yearly exam", full: true }],
        papers: [{ id: "p1", subject: MATHS, date: "2026-09-16", startTime: "09:00", endTime: "10:00", durationMinutes: 60, topic: null, maxMarks: 50 }],
      },
    ],
  },
};

function openPage(extra: Record<string, Handler> = {}) {
  const calls = fakeApi({
    "GET /parent/children/s1": () => ASHA,
    "GET /parent/children/s1/timetable": () => WEEK,
    "GET /parent/children/s1/exams": () => EXAMS,
    "GET /parent/children/s1/attendance": () => ({ month: "2026-11", days: [], monthTally: { present: 0, absent: 0, late: 0, leave: 0, days: 0, percent: null }, year: { present: 0, absent: 0, late: 0, leave: 0, days: 0, percent: null } }),
    "GET /parent/children/s1/leaves": () => ({ items: [] }),
    "GET /parent/children/s1/diary": () => ({ date: "2026-11-04", entries: [] }),
    "GET /parent/children/s1/tests": () => ({ upcoming: [], results: [], average: null }),
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
  return calls;
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
  vi.unstubAllGlobals();
  store.dispatch(signedOut());
  for (const slice of allApiSlices) store.dispatch(slice.util.resetApiState());
});

describe("the exams on the child's page", () => {
  it("has an Exams section with the child's exams, between the tests and the attendance", async () => {
    openPage();
    const exams = await screen.findByRole("region", { name: "Exams" });
    expect(within(exams).getByRole("article", { name: "Half-Yearly Exam" })).toBeInTheDocument();
    const order = screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent);
    expect(order.indexOf("Exams")).toBeGreaterThan(order.indexOf("Tests and marks"));
    expect(order.indexOf("Exams")).toBeLessThan(order.indexOf("Attendance"));
  });

  it("asks for the exams once (the section and the timetable share the read)", async () => {
    const calls = openPage();
    await screen.findByRole("article", { name: "Half-Yearly Exam" });
    await screen.findByRole("table", { name: "Weekly timetable of Class 5 - A" });
    expect(calls.filter((c) => c.path === "/parent/children/s1/exams")).toHaveLength(1);
  });

  it("the timetable shows the exam in place of that day's lessons", async () => {
    openPage();
    const table = await screen.findByRole("table", { name: "Weekly timetable of Class 5 - A" });
    const cell = await within(table).findByRole("cell", { name: "Half-Yearly Exam" });
    expect(cell).toHaveTextContent("No regular lessons");
    expect(cell).toHaveTextContent("School 8:00 AM to 12:30 PM");
    expect(within(table).queryByText("English")).not.toBeInTheDocument(); // Wednesday's lesson is off
  });

  it("with no published timetable the exams still show", async () => {
    openPage({ "GET /parent/children/s1/timetable": () => null });
    expect(await screen.findByRole("article", { name: "Half-Yearly Exam" })).toBeInTheDocument();
    expect(await screen.findByText("The timetable is not published yet")).toBeInTheDocument();
  });

  it("if the exams cannot be read, the timetable still shows as it is", async () => {
    openPage({ "GET /parent/children/s1/exams": () => new Response(JSON.stringify({ success: false, message: "Boom" }), { status: 500, headers: { "Content-Type": "application/json" } }) });
    const table = await screen.findByRole("table", { name: "Weekly timetable of Class 5 - A" });
    expect(within(table).getByText("English")).toBeInTheDocument();
  });
});
