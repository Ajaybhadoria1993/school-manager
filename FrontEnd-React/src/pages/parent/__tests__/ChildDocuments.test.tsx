import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Provider } from "react-redux";
import { RouterProvider, createMemoryRouter } from "react-router";
import { ToastProvider } from "../../../components/ui/toast-context";
import { allApiSlices } from "../../../redux/api/apiRoot";
import store from "../../../redux/store";
import { fakeApi, type Handler } from "../../../test/fakeApi";
import { signInAs, signOut } from "../../../test/session";
import type { AdmitCard, ChildDetail, IdCard, ReportCard } from "../../../types";
import ChildPage from "../ChildPage";

/** A parent reads and prints their child's ID card and exam report card, when the school allowed it (Permissions). */
const SCHOOL = { name: "Sunrise Public School", address: null, phone: null, email: null, board: null, affiliationNumber: null, logoUrl: "" };
const CHILD = {
  id: "s1",
  name: "Asha Verma",
  firstName: "Asha",
  lastName: "Verma",
  admissionNumber: "ADM-1",
  gender: "Female",
  dateOfBirth: "2018-05-14",
  admissionDate: "2026-04-01",
  bloodGroup: null,
  category: null,
  place: { className: "Class 5", sectionName: "A", rollNumber: 12, label: "Class 5 - A" },
  classTeacher: null,
  address: { line1: "12 MG Road", line2: null, city: "Bhopal", state: "Madhya Pradesh", pincode: "462001" },
  previousSchool: null,
  records: {},
  guardians: [],
} as unknown as ChildDetail;
const ID: IdCard = { school: SCHOOL, year: { name: "2026-2027", endDate: "2027-03-31" }, student: { id: "s1", name: "Asha Verma", admissionNumber: "ADM-1", rollNumber: 12, classLabel: "Class 5 - A", dateOfBirth: "2018-05-14", gender: "Female", bloodGroup: null, address: null, photo: null }, guardian: null };
const REPORT: ReportCard = {
  school: SCHOOL,
  year: { name: "2026-2027" },
  exam: { id: "e1", name: "Half-Yearly Exam", kind: "half_yearly", startDate: "2026-09-10", endDate: "2026-09-20" },
  student: { id: "s1", name: "Asha Verma", admissionNumber: "ADM-1", rollNumber: 12, className: "Class 5", sectionName: "A", dateOfBirth: "2018-05-14", gender: "Female", fatherName: null, motherName: null, photo: null },
  subjects: [{ subject: "Mathematics", marks: 90, outOf: 100, absent: false, percent: 90, grade: "A2", passed: true }],
  totals: { marks: 90, outOf: 100, percent: 90, grade: "A2", result: "pass" },
  attendance: { present: 0, absent: 0, late: 0, leave: 0, days: 0, percent: null },
  classTeacher: null,
  passPercent: 33,
  gradeBands: [{ min: 91, grade: "A1" }, { min: 81, grade: "A2" }, { min: 71, grade: "B1" }, { min: 61, grade: "B2" }, { min: 51, grade: "C1" }, { min: 41, grade: "C2" }, { min: 33, grade: "D" }, { min: 0, grade: "E" }],
  rank: null,
  remark: null,
  principalName: null,
  generatedOn: "2026-11-19",
};
const ADMIT: AdmitCard = {
  school: SCHOOL,
  year: { name: "2026-2027" },
  exam: { id: "e1", name: "Half-Yearly Exam", kind: "half_yearly", startDate: "2026-09-10", endDate: "2026-09-20" },
  student: { id: "s1", name: "Asha Verma", admissionNumber: "ADM-1", rollNumber: 12, classLabel: "Class 5 - A", dateOfBirth: "2018-05-14", gender: "Female", fatherName: null, photo: null },
  papers: [{ date: "2026-09-15", day: "Tuesday", subject: "Mathematics", start: "09:00", end: "10:00", durationMinutes: 60, maxMarks: 100 }],
  principalName: null,
  instructions: ["Bring this admit card to every paper."],
};
const EXAMS = { items: [{ id: "e1", name: "Half-Yearly Exam", papers: [], summary: null }, { id: "e2", name: "Unit Test 1", papers: [], summary: null }], week: { from: "2026-11-16", to: "2026-11-22", days: [] } };

let print: ReturnType<typeof vi.fn>;
beforeEach(() => {
  print = vi.fn();
  window.print = print as unknown as typeof window.print;
});
afterEach(() => {
  cleanup();
  signOut();
  vi.unstubAllGlobals();
  for (const slice of allApiSlices) store.dispatch(slice.util.resetApiState());
});

function openPage(permissions: string[], extra: Record<string, Handler> = {}) {
  signInAs("parent", permissions);
  const calls = fakeApi({
    "GET /parent/children/s1": () => CHILD,
    "GET /parent/children/s1/exams": () => EXAMS,
    "GET /parent/children/s1/id-card": () => ID,
    "GET /parent/children/s1/admit-card": () => ADMIT,
    "GET /parent/children/s1/report-card": (_b, q) => ({ ...REPORT, exam: { ...REPORT.exam, id: q.get("examId") ?? "" } }),
    ...extra,
  });
  const router = createMemoryRouter([{ path: "/my-children/:id", element: <ChildPage /> }], { initialEntries: ["/my-children/s1"] });
  render(
    <Provider store={store}>
      <ToastProvider>
        <RouterProvider router={router} />
      </ToastProvider>
    </Provider>,
  );
  return { calls, user: userEvent.setup() };
}
const section = () => screen.findByRole("region", { name: "Documents" });

describe("the child's documents", () => {
  it("opens the ID card to read, and prints it", async () => {
    const { user } = openPage(["child.documents"]);
    await user.click(within(await section()).getByRole("button", { name: "ID card" }));
    const dialog = await screen.findByRole("dialog", { name: "ID card" });
    expect(await within(dialog).findByRole("group", { name: "ID card of Asha Verma" })).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Print" }));
    await waitFor(() => expect(print).toHaveBeenCalledTimes(1));
  });

  it("opens the report card of the latest exam, and another exam when chosen", async () => {
    const { calls, user } = openPage(["child.documents"]);
    await user.click(within(await section()).getByRole("button", { name: "Report card" }));
    const dialog = await screen.findByRole("dialog", { name: "Report card" });
    expect(await within(dialog).findByRole("article", { name: "Report card of Asha Verma" })).toBeInTheDocument();
    expect(calls.filter((c) => c.path === "/parent/children/s1/report-card").map((c) => c.query)).toEqual(["?examId=e1"]);
    await user.click(within(dialog).getByRole("button", { name: /Exam/ }));
    await user.click(await screen.findByRole("option", { name: "Unit Test 1" }));
    await waitFor(() => expect(calls.some((c) => c.query === "?examId=e2")).toBe(true));
  });

  it("opens the admit card of the latest exam, with the class's papers and their times", async () => {
    const { calls, user } = openPage(["child.documents"]);
    await user.click(within(await section()).getByRole("button", { name: "Admit card" }));
    const dialog = await screen.findByRole("dialog", { name: "Admit card" });
    const card = await within(dialog).findByRole("article", { name: "Admit card of Asha Verma" });
    expect(within(card).getByText("9:00 am to 10:00 am")).toBeInTheDocument();
    expect(calls.filter((c) => c.path === "/parent/children/s1/admit-card").map((c) => c.query)).toEqual(["?examId=e1"]);
  });

  it("says when there is no exam yet", async () => {
    const { user } = openPage(["child.documents"], { "GET /parent/children/s1/exams": () => ({ ...EXAMS, items: [] }) });
    await user.click(within(await section()).getByRole("button", { name: "Report card" }));
    expect(await screen.findByText("There is no exam yet, so there is no report card.")).toBeInTheDocument();
  });

  it("says why when the school's server refuses", async () => {
    const { user } = openPage(["child.documents"], { "GET /parent/children/s1/id-card": () => new Response(JSON.stringify({ success: false, message: "Student not found" }), { status: 404, headers: { "Content-Type": "application/json" } }) });
    await user.click(within(await section()).getByRole("button", { name: "ID card" }));
    expect(await screen.findByText("Student not found")).toBeInTheDocument();
  });

  it("is not shown, and not asked for, when the school has not allowed it", async () => {
    const { calls } = openPage(["child.attendance"]);
    await screen.findByRole("heading", { name: "Asha Verma", level: 1 });
    expect(screen.queryByRole("region", { name: "Documents" })).not.toBeInTheDocument();
    expect(calls.some((c) => c.path.endsWith("/id-card") || c.path.endsWith("/report-card"))).toBe(false);
  });
});
