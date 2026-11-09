import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Provider } from "react-redux";
import { RouterProvider, createMemoryRouter } from "react-router";
import { ToastProvider } from "../../../components/ui/toast-context";
import { allApiSlices } from "../../../redux/api/apiRoot";
import store from "../../../redux/store";
import { sessionStarted, signedOut } from "../../../redux/slices/authSlice";
import { fakeApi, type Call, type Handler } from "../../../test/fakeApi";
import type { ClassExam, ClassExams, ClassPaper, MarksSheet, MyClass, UserRole } from "../../../types";
import ClassWorkPage from "../ClassWorkPage";

/** The Exams tab of a class's work (2026-11-06): the class's exams with its own papers, and the marks of a paper that was held. */

const FIVE_A: MyClass = { classId: "c5", sectionId: "c5-A", label: "Class 5 - A", isClassTeacher: false, subjects: [{ id: "maths", name: "Mathematics" }] };
const MATHS = { id: "maths", name: "Mathematics" };
const ENGLISH = { id: "english", name: "English" };

const paper = (id: string, over: Partial<ClassPaper> = {}): ClassPaper => ({
  id,
  subject: MATHS,
  date: "2026-09-15",
  startTime: "09:00",
  endTime: "10:00",
  durationMinutes: 60,
  topic: "Fractions",
  maxMarks: 50,
  held: true,
  canWrite: true,
  marked: 0,
  children: 2,
  holiday: null,
  ...over,
});

const exam = (over: Partial<ClassExam> = {}): ClassExam => ({
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
  paperCount: 2,
  classCount: 1,
  papers: [paper("p1"), paper("p2", { subject: ENGLISH, date: "2026-09-16", startTime: "11:00", endTime: "12:00", topic: null, canWrite: false, marked: 2 }), paper("p3", { date: "2027-03-18", held: false, subject: ENGLISH, canWrite: true })],
  ...over,
});

const CLASS_EXAMS = (items: ClassExam[] = [exam()]): ClassExams => ({ label: "Class 5 - A", items, week: { from: "2026-09-14", to: "2026-09-20", days: [] } });

const SHEET: MarksSheet = {
  paperId: "p1",
  label: "Class 5 - A",
  exam: { id: "e1", name: "Half-Yearly Exam" },
  subject: MATHS,
  date: "2026-09-15",
  startTime: "09:00",
  endTime: "10:00",
  maxMarks: 50,
  topic: "Fractions",
  held: true,
  canWrite: true,
  marked: 0,
  average: null,
  students: [
    { id: "s1", name: "Asha Verma", admissionNumber: "ADM-1", rollNumber: 1, marks: null, absent: false },
    { id: "s2", name: "Kabir Rao", admissionNumber: "ADM-2", rollNumber: 2, marks: 30, absent: false },
  ],
};

function openPage(path = "/class-work/c5?section=c5-A&tab=exams", role: UserRole = "teacher", extra: Record<string, Handler> = {}) {
  store.dispatch(
    sessionStarted({
      user: { id: "u1", name: "Meena Singh", email: null, username: "meena", role, tenantId: "t1", emailVerifiedAt: null },
      tenant: { id: "t1", name: "Sunrise Public School", approvalStatus: "approved", isActive: true },
    } as never)
  );
  const calls = fakeApi({
    "GET /classroom/my-classes": () => ({ items: [FIVE_A] }),
    "GET /exams/class": () => CLASS_EXAMS(),
    "GET /exams/papers/p1/marks": () => SHEET,
    "PUT /exams/papers/p1/marks": (body) => {
      const given = (body as { marks: { studentId: string; marks: number | null; absent: boolean }[] }).marks;
      const students = SHEET.students.map((s) => {
        const m = given.find((g) => g.studentId === s.id);
        return m ? { ...s, marks: m.marks, absent: m.absent } : s;
      });
      return { ...SHEET, students, marked: students.filter((s) => s.absent || s.marks !== null).length, average: 72 };
    },
    ...extra,
  });
  const router = createMemoryRouter([{ path: "/class-work/:classId", element: <ClassWorkPage /> }], { initialEntries: [path] });
  render(
    <Provider store={store}>
      <ToastProvider>
        <RouterProvider router={router} />
      </ToastProvider>
    </Provider>
  );
  return { calls, router, user: userEvent.setup() };
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  store.dispatch(signedOut());
  for (const slice of allApiSlices) store.dispatch(slice.util.resetApiState());
});

const puts = (calls: Call[]) => calls.filter((c) => c.method === "PUT" && c.path === "/exams/papers/p1/marks");
const rowOf = (name: RegExp) => screen.getByRole("listitem", { name });

describe("the Exams tab", () => {
  it("is a tab of the class's work, for teachers and the school alike, and opens when the link says so", async () => {
    const { calls } = openPage();
    expect(await screen.findByRole("tab", { name: "Exams", selected: true })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Diary" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Tests" })).toBeInTheDocument();
    await screen.findByRole("region", { name: "Half-Yearly Exam" });
    expect(calls.find((c) => c.path === "/exams/class")?.query).toBe("?classId=c5&sectionId=c5-A");
  });

  it("the school reads any class's exams from the same tab", async () => {
    openPage("/class-work/c5?section=c5-A&tab=exams", "school_admin", { "GET /students/class-overview": () => ({ classes: [{ id: "c5", name: "Class 5", sections: [{ id: "c5-A", name: "A" }] }] }) });
    expect(await screen.findByRole("region", { name: "Half-Yearly Exam" })).toBeInTheDocument();
  });

  it("shows each exam with its status, days and the school's hours, and the class's papers in date order", async () => {
    openPage();
    const region = await screen.findByRole("region", { name: "Half-Yearly Exam" });
    expect(within(region).getByText("Running")).toBeInTheDocument();
    expect(region).toHaveTextContent("Half-yearly exam");
    expect(region).toHaveTextContent("14 Sep to 30 Sep");
    expect(region).toHaveTextContent("School 8:00 AM to 12:30 PM");
    const rows = within(region).getAllByRole("listitem");
    expect(rows.map((r) => r.getAttribute("aria-label"))).toEqual(["Mathematics, Tue, 15 Sep", "English, Wed, 16 Sep", "English, Thu, 18 Mar"]);
    expect(rows[0]).toHaveTextContent("9:00 AM to 10:00 AM");
    expect(rows[0]).toHaveTextContent("Fractions");
    expect(rows[0]).toHaveTextContent("out of 50");
  });

  it("an exam with no paper for this class says its timetable is not made yet", async () => {
    openPage(undefined, "teacher", { "GET /exams/class": () => CLASS_EXAMS([exam({ papers: [], paperCount: 0, status: "upcoming" })]) });
    const region = await screen.findByRole("region", { name: "Half-Yearly Exam" });
    expect(region).toHaveTextContent("Timetable not made yet");
    expect(within(region).queryAllByRole("listitem")).toHaveLength(0);
  });

  it("no exam at all says so", async () => {
    openPage(undefined, "teacher", { "GET /exams/class": () => CLASS_EXAMS([]) });
    expect(await screen.findByText("No exam or test yet")).toBeInTheDocument();
  });

  it("a paper on a day that became a holiday says so, so the school can move it", async () => {
    openPage(undefined, "teacher", { "GET /exams/class": () => CLASS_EXAMS([exam({ papers: [paper("p1", { holiday: "Heavy rain" })] })]) });
    expect(await screen.findByText("Holiday: Heavy rain")).toBeInTheDocument();
  });

  it("a server error says it could not load", async () => {
    openPage(undefined, "teacher", { "GET /exams/class": () => new Response(JSON.stringify({ success: false, message: "Boom" }), { status: 500, headers: { "Content-Type": "application/json" } }) });
    expect(await screen.findByText(/Could not load|Boom/)).toBeInTheDocument();
  });
});

describe("what each paper offers", () => {
  it("a paper that was held and is the teacher's: Enter marks (Change marks once some are in); a paper still to come: Coming, no marks button", async () => {
    openPage();
    await screen.findByRole("region", { name: "Half-Yearly Exam" });
    expect(within(rowOf(/Mathematics, Tue, 15 Sep/)).getByRole("button", { name: "Enter marks of Mathematics" })).toBeInTheDocument();
    const coming = rowOf(/English, Thu, 18 Mar/);
    expect(within(coming).getByText("Coming")).toBeInTheDocument();
    expect(within(coming).queryByRole("button")).not.toBeInTheDocument();
  });

  it("a paper the teacher does not write is read only: a View marks button when marks are in, 2 of 2 said", async () => {
    openPage();
    await screen.findByRole("region", { name: "Half-Yearly Exam" });
    const row = rowOf(/English, Wed, 16 Sep/);
    expect(row).toHaveTextContent("Marks of 2 of 2");
    expect(within(row).getByRole("button", { name: "View marks of English" })).toBeInTheDocument();
    expect(within(row).queryByRole("button", { name: /Enter marks|Change marks/ })).not.toBeInTheDocument();
  });

  it("a held paper with no out-of says the school must set the marks first, and has no marks button", async () => {
    openPage(undefined, "teacher", { "GET /exams/class": () => CLASS_EXAMS([exam({ papers: [paper("p1", { maxMarks: null })] })]) });
    await screen.findByRole("region", { name: "Half-Yearly Exam" });
    const row = rowOf(/Mathematics, Tue, 15 Sep/);
    expect(row).toHaveTextContent("Marks not set");
    expect(within(row).queryByRole("button")).not.toBeInTheDocument();
  });

  it("a paper whose marks are in says Change marks and how many children have theirs", async () => {
    openPage(undefined, "teacher", { "GET /exams/class": () => CLASS_EXAMS([exam({ papers: [paper("p1", { marked: 1 })] })]) });
    await screen.findByRole("region", { name: "Half-Yearly Exam" });
    const row = rowOf(/Mathematics, Tue, 15 Sep/);
    expect(row).toHaveTextContent("Marks of 1 of 2");
    expect(within(row).getByRole("button", { name: "Change marks of Mathematics" })).toBeInTheDocument();
  });
});

describe("entering marks", () => {
  it("opens the sheet of that paper (one read), each child with their marks and an Absent tick, out of the paper's marks", async () => {
    const { calls, user } = openPage();
    await screen.findByRole("region", { name: "Half-Yearly Exam" });
    await user.click(screen.getByRole("button", { name: "Enter marks of Mathematics" }));
    const dialog = await screen.findByRole("dialog", { name: /Marks of Mathematics/ });
    expect(dialog).toHaveTextContent("Half-Yearly Exam");
    expect(dialog).toHaveTextContent("Out of 50");
    expect(within(dialog).getByLabelText("Marks of Asha Verma")).toHaveValue("");
    expect(within(dialog).getByLabelText("Marks of Kabir Rao")).toHaveValue("30");
    expect(calls.filter((c) => c.path === "/exams/papers/p1/marks")).toHaveLength(1);
    expect(calls.find((c) => c.path === "/exams/papers/p1/marks")?.query).toBe("?classId=c5&sectionId=c5-A");
  });

  it("Save sends every child's marks (blank = none yet, Absent ticked = absent), then a window says it is saved with the class average", async () => {
    const { calls, user } = openPage();
    await screen.findByRole("region", { name: "Half-Yearly Exam" });
    await user.click(screen.getByRole("button", { name: "Enter marks of Mathematics" }));
    const dialog = await screen.findByRole("dialog", { name: /Marks of Mathematics/ });
    await waitFor(() => expect(within(dialog).getByLabelText("Marks of Kabir Rao")).toHaveValue("30"));
    await user.type(within(dialog).getByLabelText("Marks of Asha Verma"), "42.5");
    await user.click(within(dialog).getByLabelText("Kabir Rao was absent"));
    await user.click(within(dialog).getByRole("button", { name: "Save marks" }));
    await waitFor(() => expect(puts(calls)).toHaveLength(1));
    expect(puts(calls)[0].body).toEqual({
      classId: "c5",
      sectionId: "c5-A",
      marks: [
        { studentId: "s1", marks: 42.5, absent: false },
        { studentId: "s2", marks: null, absent: true },
      ],
    });
    const done = await screen.findByRole("dialog", { name: "Marks saved" });
    expect(done).toHaveTextContent("Mathematics");
    expect(done).toHaveTextContent("average is 72%");
  });

  it("marks above the paper's out-of are refused on the sheet, and nothing is sent", async () => {
    const { calls, user } = openPage();
    await screen.findByRole("region", { name: "Half-Yearly Exam" });
    await user.click(screen.getByRole("button", { name: "Enter marks of Mathematics" }));
    const dialog = await screen.findByRole("dialog", { name: /Marks of Mathematics/ });
    await waitFor(() => expect(within(dialog).getByLabelText("Marks of Kabir Rao")).toHaveValue("30"));
    await user.type(within(dialog).getByLabelText("Marks of Asha Verma"), "51");
    expect(within(dialog).getByText("Marks are out of 50")).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Save marks" }));
    expect(puts(calls)).toHaveLength(0);
  });

  it("the server's refusal is shown in the window and the sheet stays open", async () => {
    const { user } = openPage(undefined, "teacher", {
      "PUT /exams/papers/p1/marks": () => new Response(JSON.stringify({ success: false, message: "The marks are entered once the paper is held.", code: "PAPER_NOT_HELD" }), { status: 409, headers: { "Content-Type": "application/json" } }),
    });
    await screen.findByRole("region", { name: "Half-Yearly Exam" });
    await user.click(screen.getByRole("button", { name: "Enter marks of Mathematics" }));
    const dialog = await screen.findByRole("dialog", { name: /Marks of Mathematics/ });
    await waitFor(() => expect(within(dialog).getByLabelText("Marks of Kabir Rao")).toHaveValue("30"));
    await user.click(within(dialog).getByRole("button", { name: "Save marks" }));
    expect(await within(dialog).findByText("The marks are entered once the paper is held.")).toBeInTheDocument();
  });

  it("opening the sheet again after a save shows the marks just saved (the sheet is read again, not served old)", async () => {
    let current = SHEET;
    const { calls, user } = openPage(undefined, "teacher", {
      "GET /exams/papers/p1/marks": () => current,
      "PUT /exams/papers/p1/marks": (body) => {
        const given = (body as { marks: { studentId: string; marks: number | null; absent: boolean }[] }).marks;
        current = { ...SHEET, marked: 2, students: SHEET.students.map((st) => ({ ...st, marks: given.find((g) => g.studentId === st.id)?.marks ?? null })) };
        return current;
      },
    });
    await screen.findByRole("region", { name: "Half-Yearly Exam" });
    await user.click(screen.getByRole("button", { name: "Enter marks of Mathematics" }));
    let dialog = await screen.findByRole("dialog", { name: /Marks of Mathematics/ });
    await waitFor(() => expect(within(dialog).getByLabelText("Marks of Kabir Rao")).toHaveValue("30"));
    await user.type(within(dialog).getByLabelText("Marks of Asha Verma"), "41");
    await user.click(within(dialog).getByRole("button", { name: "Save marks" }));
    await user.click(await within(await screen.findByRole("dialog", { name: "Marks saved" })).findByRole("button", { name: "OK" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Marks saved" })).not.toBeInTheDocument());

    await user.click(await screen.findByRole("button", { name: /marks of Mathematics/ }));
    dialog = await screen.findByRole("dialog", { name: /Marks of Mathematics/ });
    await waitFor(() => expect(within(dialog).getByLabelText("Marks of Asha Verma")).toHaveValue("41"));
    expect(calls.filter((c) => c.method === "GET" && c.path === "/exams/papers/p1/marks")).toHaveLength(2);
  });

  it("a read-only sheet shows the marks and has no Save", async () => {
    const { user } = openPage(undefined, "teacher", { "GET /exams/papers/p2/marks": () => ({ ...SHEET, paperId: "p2", subject: ENGLISH, canWrite: false }) });
    await screen.findByRole("region", { name: "Half-Yearly Exam" });
    await user.click(screen.getByRole("button", { name: "View marks of English" }));
    const dialog = await screen.findByRole("dialog", { name: /Marks of English/ });
    await waitFor(() => expect(within(dialog).getByLabelText("Marks of Kabir Rao")).toHaveValue("30"));
    expect(within(dialog).getByLabelText("Marks of Kabir Rao")).toBeDisabled();
    expect(within(dialog).queryByRole("button", { name: "Save marks" })).not.toBeInTheDocument();
  });
});
