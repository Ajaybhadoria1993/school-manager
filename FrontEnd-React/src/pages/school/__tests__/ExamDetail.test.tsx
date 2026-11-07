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
import { STRUCTURE } from "../../../test/fixtures";
import type { AcademicStructure, ExamDetail, ExamPaper } from "../../../types";
import ExamDetailPage from "../ExamDetail";

/**
 * One exam's page (Test & Exam): its timetable by class (the classes that write the same papers at the same times are one card) or by
 * date, a timetable added for some classes at once, one paper changed or taken away, the exam itself changed or deleted.
 */

const C1 = { id: "c1", name: "Class 1", order: 1 };
const C2 = { id: "c2", name: "Class 2", order: 2 };
const C6 = { id: "c6", name: "Class 6", order: 6 };
const MATHS = { id: "s1", name: "Mathematics" };
const ENGLISH = { id: "s2", name: "English" };

const P1: ExamPaper = { id: "p1", examId: "e1", classIds: ["c1", "c2"], classes: [C1, C2], subject: MATHS, date: "2026-09-15", startTime: "09:00", endTime: "12:00", durationMinutes: 180, maxMarks: 80, topic: "Fractions and decimals", marked: 0, holiday: null };
const P2: ExamPaper = { id: "p2", examId: "e1", classIds: ["c1", "c2"], classes: [C1, C2], subject: ENGLISH, date: "2026-09-17", startTime: "09:00", endTime: "10:30", durationMinutes: 90, maxMarks: null, topic: null, marked: 0, holiday: null };
const P3: ExamPaper = { id: "p3", examId: "e1", classIds: ["c6"], classes: [C6], subject: MATHS, date: "2026-09-16", startTime: "10:00", endTime: "12:00", durationMinutes: 120, maxMarks: null, topic: null, marked: 0, holiday: null };

const EXAM: ExamDetail = {
  id: "e1",
  name: "Half-Yearly Exam",
  type: "half_yearly",
  typeLabel: "Half-yearly exam",
  full: true,
  startDate: "2026-09-15",
  endDate: "2026-09-26",
  schoolHours: { start: "08:00", end: "12:30" },
  note: "Bring your own geometry box",
  status: "upcoming",
  paperCount: 3,
  classCount: 3,
  papers: [P1, P3, P2],
};

const SCHOOL: AcademicStructure = {
  ...STRUCTURE,
  classes: [
    { id: "c1", name: "Class 1", order: 1, departmentId: null, capacity: null, sections: [] },
    { id: "c2", name: "Class 2", order: 2, departmentId: null, capacity: null, sections: [] },
    { id: "c6", name: "Class 6", order: 6, departmentId: null, capacity: null, sections: [] },
  ],
};
const SUBJECTS = {
  items: [
    { id: "s1", name: "Mathematics", code: "MAT", category: "academic", isActive: true, sections: 3 },
    { id: "s2", name: "English", code: "ENG", category: "academic", isActive: true, sections: 3 },
    { id: "s3", name: "Hindi", code: "HIN", category: "academic", isActive: true, sections: 3 },
  ],
};

const refused = (message: string, status = 409, extra: object = {}) => () => new Response(JSON.stringify({ success: false, message, ...extra }), { status, headers: { "Content-Type": "application/json" } });

function openPage(detail: ExamDetail = EXAM, extra: Record<string, Handler> = {}) {
  store.dispatch(sessionStarted({ user: { id: "u1", name: "Anuj", email: "a@school.example", username: null, role: "school_admin", tenantId: "t1", emailVerifiedAt: null }, tenant: null }));
  const calls = fakeApi({
    "GET /exams/e1": () => detail,
    "GET /academics/structure": () => SCHOOL,
    "GET /subjects": () => SUBJECTS,
    "POST /exams/e1/papers": (body) => ({ items: (body as { papers: unknown[] }).papers.map((_, i) => ({ ...P1, id: `n${i}` })) }),
    "PATCH /exams/e1/papers/p1": (body) => ({ ...P1, ...(body as object) }),
    "DELETE /exams/e1/papers/p2": () => ({ id: "p2" }),
    "PATCH /exams/e1": (body) => ({ ...EXAM, ...(body as object) }),
    "DELETE /exams/e1": () => ({ id: "e1" }),
    ...extra,
  });
  const router = createMemoryRouter([{ path: "/school/exams/:id", element: <ExamDetailPage /> }, { path: "/school/exams", element: <p>The exams</p> }], { initialEntries: ["/school/exams/e1"] });
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
  store.dispatch(signedOut());
  for (const api of allApiSlices) store.dispatch(api.util.resetApiState());
  vi.unstubAllGlobals();
});

type User = ReturnType<typeof userEvent.setup>;
const writes = (calls: Call[]) => calls.filter((c) => c.method !== "GET");
const reads = (calls: Call[], path: string) => calls.filter((c) => c.method === "GET" && c.path === path);
const pickIn = async (user: User, id: string, option: string) => {
  await user.click(document.getElementById(id)!);
  await user.click(await screen.findByRole("option", { name: option }));
};

describe("the exam and its timetable", () => {
  it("says what the exam is: its kind, whether it has come, its days, the school hours, the note, and how many papers and classes", async () => {
    openPage();
    expect(await screen.findByRole("heading", { name: "Half-Yearly Exam", level: 1 })).toBeInTheDocument();
    const summary = screen.getByRole("region", { name: "About the exam" });
    expect(summary).toHaveTextContent("Half-yearly exam");
    expect(summary).toHaveTextContent("Upcoming");
    expect(summary).toHaveTextContent("15 Sep to 26 Sep 2026");
    expect(summary).toHaveTextContent("School 8:00 AM to 12:30 PM");
    expect(summary).toHaveTextContent("Bring your own geometry box");
    expect(summary).toHaveTextContent("3 papers");
    expect(summary).toHaveTextContent("3 classes");
  });

  it("by class: the classes with the same dates and times are one card, the others have a card of their own", async () => {
    const { calls } = openPage();
    const one = await screen.findByRole("region", { name: "Class 1, Class 2" });
    const maths = within(one).getByRole("row", { name: /Mathematics/ });
    expect(maths).toHaveTextContent("Tue, 15 Sep");
    expect(maths).toHaveTextContent("9:00 AM to 12:00 PM");
    expect(maths).toHaveTextContent("3 h");
    expect(maths).toHaveTextContent("Fractions and decimals");
    expect(maths).toHaveTextContent("80");
    const english = within(one).getByRole("row", { name: /English/ });
    expect(english).toHaveTextContent("Thu, 17 Sep");
    expect(english).toHaveTextContent("1 h 30 min");
    expect(within(screen.getByRole("region", { name: "Class 6" })).getByRole("row", { name: /Mathematics/ })).toHaveTextContent("Wed, 16 Sep");
    // The page asks for the exam once, and not for the classes or subjects, which only the dialogs need.
    expect(calls.filter((c) => c.method === "GET").map((c) => c.path)).toEqual(["/exams/e1"]);
  });

  it("by date: each day with its papers in time order, the school hours, and the classes of each paper", async () => {
    const { user } = openPage();
    await screen.findByRole("region", { name: "Class 1, Class 2" });
    await user.click(screen.getByRole("radio", { name: "By date" }));
    const days = screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent);
    expect(days).toEqual(["Tue, 15 Sep 2026", "Wed, 16 Sep 2026", "Thu, 17 Sep 2026"]);
    const wed = screen.getByRole("region", { name: "Wed, 16 Sep 2026" });
    expect(wed).toHaveTextContent("School 8:00 AM to 12:30 PM");
    expect(wed).toHaveTextContent("Mathematics");
    expect(wed).toHaveTextContent("Class 6");
    expect(screen.getByRole("region", { name: "Tue, 15 Sep 2026" })).toHaveTextContent("Class 1");
    expect(screen.getByRole("region", { name: "Tue, 15 Sep 2026" })).toHaveTextContent("Class 2");
  });

  it("an exam with no papers says so and offers the timetable", async () => {
    openPage({ ...EXAM, papers: [], paperCount: 0, classCount: 0 });
    expect(await screen.findByText("No timetable yet")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Add timetable" }).length).toBeGreaterThan(0);
  });

  it("says why when the exam is not there", async () => {
    openPage(EXAM, { "GET /exams/e1": refused("This exam is not on the school's list any more", 404, { code: "EXAM_NOT_FOUND" }) });
    expect(await screen.findByText("This exam is not on the school's list any more")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to Test & Exam" })).toHaveAttribute("href", "/school/exams");
  });
});

describe("adding a timetable for some classes at once", () => {
  async function openDialog(user: User) {
    await user.click(await screen.findByRole("button", { name: "Add timetable" }));
    return screen.findByRole("dialog", { name: "Add timetable" });
  }

  it("the classes are ticked, each row is a subject on a day at a time for so many minutes (the next row follows the one before), and Save adds them all", async () => {
    const { calls, user } = openPage();
    const dialog = await openDialog(user);
    await user.click(await within(dialog).findByRole("checkbox", { name: "Class 1" }));
    await user.click(within(dialog).getByRole("checkbox", { name: "Class 2" }));

    await pickIn(user, "paper-0-subject", "Mathematics");
    expect(within(dialog).getByLabelText("Starts", { selector: "#paper-0-start" })).toHaveValue("08:00");
    expect(within(dialog).getByLabelText("Minutes", { selector: "#paper-0-minutes" })).toHaveValue(180);
    await user.type(within(dialog).getByLabelText("Topic", { selector: "#paper-0-topic" }), "Fractions");

    await user.click(within(dialog).getByRole("button", { name: "Add paper" }));
    await pickIn(user, "paper-1-subject", "English");
    expect(within(dialog).getByLabelText("Starts", { selector: "#paper-1-start" })).toHaveValue("08:00");
    await user.type(within(dialog).getByLabelText("Marks", { selector: "#paper-1-marks" }), "50");

    await user.click(within(dialog).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(writes(calls)).toHaveLength(1));
    expect(writes(calls)[0]).toMatchObject({
      method: "POST",
      path: "/exams/e1/papers",
      body: {
        classIds: ["c1", "c2"],
        papers: [
          { subjectId: "s1", date: "2026-09-15", startTime: "08:00", durationMinutes: 180, maxMarks: null, topic: "Fractions" },
          { subjectId: "s2", date: "2026-09-16", startTime: "08:00", durationMinutes: 180, maxMarks: 50, topic: null },
        ],
      },
    });
    const done = await screen.findByRole("dialog", { name: "Timetable added" });
    expect(done).toHaveTextContent("2 papers are in the timetable of Class 1 and Class 2.");
    expect(reads(calls, "/academics/structure")).toHaveLength(1);
  });

  it("All classes ticks every class (the whole school), and Clear takes the ticks off", async () => {
    const { calls, user } = openPage();
    const dialog = await openDialog(user);
    await user.click(await within(dialog).findByRole("button", { name: "All classes" }));
    for (const name of ["Class 1", "Class 2", "Class 6"]) expect(within(dialog).getByRole("checkbox", { name: name })).toBeChecked();
    await user.click(within(dialog).getByRole("button", { name: "Clear" }));
    for (const name of ["Class 1", "Class 2", "Class 6"]) expect(within(dialog).getByRole("checkbox", { name: name })).not.toBeChecked();
    expect(writes(calls)).toHaveLength(0);
  });

  it("asks for the classes and the subject, and sends nothing without them", async () => {
    const { calls, user } = openPage();
    const dialog = await openDialog(user);
    await within(dialog).findByRole("checkbox", { name: "Class 1" });
    await user.click(within(dialog).getByRole("button", { name: "Save" }));
    expect(await within(dialog).findByText("Choose at least one class")).toBeInTheDocument();
    expect(within(dialog).getByText("Choose the subject")).toBeInTheDocument();
    expect(writes(calls)).toHaveLength(0);
  });

  it("puts what the server said about a row under that row, and a clash at the top, and stays open", async () => {
    const { user } = openPage(EXAM, {
      "POST /exams/e1/papers": refused("Invalid request data", 400, { code: "VALIDATION_ERROR", details: [{ path: "papers.0.date", message: "Choose a day from 15 Sep to 26 Sep, the days of this exam" }] }),
    });
    const dialog = await openDialog(user);
    await user.click(await within(dialog).findByRole("checkbox", { name: "Class 1" }));
    await pickIn(user, "paper-0-subject", "Mathematics");
    await user.click(within(dialog).getByRole("button", { name: "Save" }));
    expect(await within(dialog).findByText("Choose a day from 15 Sep to 26 Sep, the days of this exam")).toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "Add timetable" })).toBeInTheDocument();
  });

  it("shows the clash in words", async () => {
    const { user } = openPage(EXAM, { "POST /exams/e1/papers": refused("Class 1 already has Mathematics from 9:00 AM to 12:00 PM on 15 Sep (Half-Yearly Exam)", 409, { code: "PAPER_CLASH" }) });
    const dialog = await openDialog(user);
    await user.click(await within(dialog).findByRole("checkbox", { name: "Class 1" }));
    await pickIn(user, "paper-0-subject", "Mathematics");
    await user.click(within(dialog).getByRole("button", { name: "Save" }));
    expect(await within(dialog).findByText("Class 1 already has Mathematics from 9:00 AM to 12:00 PM on 15 Sep (Half-Yearly Exam)")).toBeInTheDocument();
  });
});

describe("changing the exam and its papers", () => {
  it("changes a paper from its pencil: its classes, subject, day, time, minutes, marks and topic are there, and Save changes it", async () => {
    const { calls, user } = openPage();
    const one = await screen.findByRole("region", { name: "Class 1, Class 2" });
    await user.click(within(within(one).getByRole("row", { name: /Mathematics/ })).getByRole("button", { name: "Change Mathematics" }));
    const dialog = await screen.findByRole("dialog", { name: "Change Mathematics" });
    expect(await within(dialog).findByRole("checkbox", { name: "Class 1" })).toBeChecked();
    expect(within(dialog).getByRole("checkbox", { name: "Class 2" })).toBeChecked();
    expect(within(dialog).getByRole("checkbox", { name: "Class 6" })).not.toBeChecked();
    expect(within(dialog).getByLabelText("Topic", { selector: "#paper-0-topic" })).toHaveValue("Fractions and decimals");
    const topic = within(dialog).getByLabelText("Topic", { selector: "#paper-0-topic" });
    await user.clear(topic);
    await user.type(topic, "Chapter 1 to 4");
    await user.click(within(dialog).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(writes(calls)).toHaveLength(1));
    expect(writes(calls)[0]).toMatchObject({
      method: "PATCH",
      path: "/exams/e1/papers/p1",
      body: { classIds: ["c1", "c2"], subjectId: "s1", date: "2026-09-15", startTime: "09:00", durationMinutes: 180, maxMarks: 80, topic: "Chapter 1 to 4" },
    });
    expect(await screen.findByRole("dialog", { name: "Saved" })).toBeInTheDocument();
  });

  it("takes a paper away after asking", async () => {
    const { calls, user } = openPage();
    const one = await screen.findByRole("region", { name: "Class 1, Class 2" });
    await user.click(within(within(one).getByRole("row", { name: /English/ })).getByRole("button", { name: "Take English away" }));
    const ask = await screen.findByRole("dialog", { name: "Take English away?" });
    await user.click(within(ask).getByRole("button", { name: "Take away" }));
    await waitFor(() => expect(writes(calls)).toHaveLength(1));
    expect(writes(calls)[0]).toMatchObject({ method: "DELETE", path: "/exams/e1/papers/p2" });
    expect(await screen.findByRole("dialog", { name: "Taken away" })).toHaveTextContent("English");
  });

  it("a paper on a day that became a holiday says so, in both views, so the school moves it (2026-11-06)", async () => {
    const holiday = { ...EXAM, papers: [{ ...P1, holiday: "Heavy rain" }, P3, P2] };
    const { user } = openPage(holiday);
    const one = await screen.findByRole("region", { name: "Class 1, Class 2" });
    expect(within(within(one).getByRole("row", { name: /Mathematics/ })).getByText("Holiday: Heavy rain")).toBeInTheDocument();
    expect(within(within(one).getByRole("row", { name: /English/ })).queryByText(/^Holiday:/)).not.toBeInTheDocument();
    await user.click(screen.getByRole("radio", { name: "By date" }));
    const day = await screen.findByRole("region", { name: "Tue, 15 Sep 2026" });
    expect(within(day).getByText("Holiday: Heavy rain")).toBeInTheDocument();
  });

  it("a paper whose marks are in says how many children have theirs; taking it away says the marks go with it", async () => {
    const marked = { ...EXAM, papers: [{ ...P1, marked: 38 }, P3, { ...P2, marked: 1 }] };
    const { calls, user } = openPage(marked);
    const one = await screen.findByRole("region", { name: "Class 1, Class 2" });
    expect(within(one).getByRole("row", { name: /Mathematics/ })).toHaveTextContent("Marks of 38 children");
    expect(within(one).getByRole("row", { name: /English/ })).toHaveTextContent("Marks of 1 child");
    await user.click(within(within(one).getByRole("row", { name: /English/ })).getByRole("button", { name: "Take English away" }));
    const ask = await screen.findByRole("dialog", { name: "Take English away?" });
    expect(ask).toHaveTextContent("The marks of 1 child go with it.");
    await user.click(within(ask).getByRole("button", { name: "Take away" }));
    await waitFor(() => expect(writes(calls)).toHaveLength(1));
  });

  it("a paper with no marks says nothing of marks, and its confirmation does not mention them", async () => {
    const { user } = openPage();
    const one = await screen.findByRole("region", { name: "Class 1, Class 2" });
    expect(within(one).getByRole("row", { name: /Mathematics/ })).not.toHaveTextContent("Marks of");
    await user.click(within(within(one).getByRole("row", { name: /English/ })).getByRole("button", { name: "Take English away" }));
    expect(await screen.findByRole("dialog", { name: "Take English away?" })).not.toHaveTextContent("marks");
  });

  it("the exam's own marks rule shows in the paper's change window: the server's refusal (marks entered) is read", async () => {
    const { user } = openPage(EXAM, {
      "PATCH /exams/e1/papers/p1": refused("Marks up to 45 are entered: the paper cannot be out of less than 45", 409, { code: "MARKS_ABOVE_MAX" }),
    });
    const one = await screen.findByRole("region", { name: "Class 1, Class 2" });
    await user.click(within(within(one).getByRole("row", { name: /Mathematics/ })).getByRole("button", { name: "Change Mathematics" }));
    const dialog = await screen.findByRole("dialog", { name: "Change Mathematics" });
    await user.click(within(dialog).getByRole("button", { name: "Save" }));
    expect(await within(dialog).findByText("Marks up to 45 are entered: the paper cannot be out of less than 45")).toBeInTheDocument();
  });

  it("changes the exam itself from the pencil at the top", async () => {
    const { calls, user } = openPage();
    await user.click(await screen.findByRole("button", { name: "Change exam" }));
    const dialog = await screen.findByRole("dialog", { name: "Change Half-Yearly Exam" });
    expect(within(dialog).getByRole("radio", { name: "Half-yearly exam" })).toBeChecked();
    const name = within(dialog).getByLabelText(/^Name/);
    await user.clear(name);
    await user.type(name, "Half-Yearly 2026");
    await user.click(within(dialog).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(writes(calls)).toHaveLength(1));
    expect(writes(calls)[0]).toMatchObject({ method: "PATCH", path: "/exams/e1", body: { name: "Half-Yearly 2026", type: "half_yearly", startDate: "2026-09-15", endDate: "2026-09-26", schoolStart: "08:00", schoolEnd: "12:30" } });
    expect(await screen.findByRole("dialog", { name: "Saved" })).toBeInTheDocument();
  });

  it("deletes the exam after saying how many papers go with it, and goes back to the list", async () => {
    const { calls, router, user } = openPage();
    await user.click(await screen.findByRole("button", { name: "Delete exam" }));
    const ask = await screen.findByRole("dialog", { name: "Delete Half-Yearly Exam?" });
    expect(ask).toHaveTextContent("Its 3 papers go with it.");
    await user.click(within(ask).getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(writes(calls)).toHaveLength(1));
    expect(writes(calls)[0]).toMatchObject({ method: "DELETE", path: "/exams/e1" });
    await waitFor(() => expect(router.state.location.pathname).toBe("/school/exams"));
  });
});
