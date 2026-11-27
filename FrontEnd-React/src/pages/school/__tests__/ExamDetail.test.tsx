import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Provider } from "react-redux";
import { RouterProvider, createMemoryRouter } from "react-router";
import { ToastProvider } from "../../../components/ui/toast-context";
import { allApiSlices } from "../../../redux/api/apiRoot";
import store from "../../../redux/store";
import { sessionStarted, signedOut } from "../../../redux/slices/authSlice";
import { yearViewChanged } from "../../../redux/slices/yearViewSlice";
import { fakeApi, type Call, type Handler } from "../../../test/fakeApi";
import type { ExamDetail, ExamPaper } from "../../../types";
import ExamDetailPage from "../ExamDetail";

/**
 * One exam's page: what it is and whom it is for, its timetable to read by class (the classes that write the same papers at the same times are
 * one card, headed by their names) or by date, the exam itself changed or deleted. Since 2026-11-27 the timetable is written on the Exam page's Exam
 * Time Table tab: Add timetable and a card's Edit timetable open it (the user: "add timetable par modal nahi, mera Exam Time Table ka tab khule").
 */

const C1 = { id: "c1", name: "Class 1", order: 1 };
const C2 = { id: "c2", name: "Class 2", order: 2 };
const C6 = { id: "c6", name: "Class 6", order: 6 };
const C9 = { id: "c9", name: "Class 9", order: 9 };
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
  scope: "school",
  audience: { label: "Whole school", departments: [], classes: [C1, C2, C6] },
  note: "Bring your own geometry box",
  status: "upcoming",
  paperCount: 3,
  classCount: 3,
  papers: [P1, P3, P2],
};

const refused = (message: string, status = 409, extra: object = {}) => () => new Response(JSON.stringify({ success: false, message, ...extra }), { status, headers: { "Content-Type": "application/json" } });

function openPage(detail: ExamDetail = EXAM, extra: Record<string, Handler> = {}) {
  store.dispatch(sessionStarted({ user: { id: "u1", name: "Anuj", email: "a@school.example", username: null, role: "school_admin", tenantId: "t1", emailVerifiedAt: null }, tenant: null }));
  const calls = fakeApi({
    "GET /exams/e1": () => detail,
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

const writes = (calls: Call[]) => calls.filter((c) => c.method !== "GET");

describe("the exam and its timetable", () => {
  it("says what the exam is: its kind, whom it is for, whether it has come, its days, the school hours, the note, and how many papers and classes", async () => {
    openPage();
    expect(await screen.findByRole("heading", { name: "Half-Yearly Exam", level: 1 })).toBeInTheDocument();
    const summary = screen.getByRole("region", { name: "About the exam" });
    expect(summary).toHaveTextContent("Half-yearly exam");
    expect(summary).toHaveTextContent("Whole school");
    expect(summary).toHaveTextContent("Upcoming");
    expect(summary).toHaveTextContent("15 Sep to 26 Sep 2026");
    expect(summary).toHaveTextContent("School 8:00 AM to 12:30 PM");
    expect(summary).toHaveTextContent("Bring your own geometry box");
    expect(summary).toHaveTextContent("3 papers");
    expect(summary).toHaveTextContent("3 classes");
  });

  it("by class: each card is headed by its classes' names with how many papers (the classes with the same dates and times are one card); its rows are the day, subject, time, marks and topic", async () => {
    const { calls } = openPage();
    const one = await screen.findByRole("region", { name: "Class 1, Class 2" });
    expect(within(one).getByRole("heading", { level: 3, name: "Class 1, Class 2" })).toBeInTheDocument();
    expect(one).toHaveTextContent("2 papers");
    const maths = within(one).getByRole("row", { name: /Mathematics/ });
    expect(within(maths).getAllByRole("cell").map((c) => c.textContent)).toEqual(["Tue, 15 Sep", "Mathematics", "9:00 AM to 12:00 PM 3 h", "80", "Fractions and decimals"]);
    const english = within(one).getByRole("row", { name: /English/ });
    expect(english).toHaveTextContent("Thu, 17 Sep");
    expect(english).toHaveTextContent("1 h 30 min");
    expect(within(screen.getByRole("region", { name: "Class 6" })).getByRole("row", { name: /Mathematics/ })).toHaveTextContent("Wed, 16 Sep");
    // Read here; written on the Exam Time Table tab: no pencil or bin on a paper.
    expect(within(one).queryByRole("button", { name: /Change|away/ })).not.toBeInTheDocument();
    // The page asks for the exam once.
    expect(calls.filter((c) => c.method === "GET").map((c) => c.path)).toEqual(["/exams/e1"]);
  });

  it("a card's Edit timetable opens the Exam Time Table tab on its class", async () => {
    openPage();
    const one = await screen.findByRole("region", { name: "Class 1, Class 2" });
    expect(within(one).getByRole("link", { name: "Edit timetable" })).toHaveAttribute("href", "/school/exams?tab=timetable&exam=e1&class=c1");
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

  it("says which classes of the exam have a timetable (a bar) and which do not yet", async () => {
    openPage({ ...EXAM, audience: { label: "Whole school", departments: [], classes: [C1, C2, C6, C9] } });
    const made = await screen.findByRole("region", { name: "Classes of the exam" });
    expect(made).toHaveTextContent("3 of 4 classes have a timetable");
    expect(made).toHaveTextContent("Not yet: Class 9");
    expect(within(made).getByRole("progressbar", { name: "Classes with a timetable" })).toHaveAttribute("aria-valuenow", "75");
  });

  it("Add timetable opens the Exam Time Table tab (no window), on the first class without a timetable", async () => {
    const { router, user } = openPage({ ...EXAM, audience: { label: "Whole school", departments: [], classes: [C1, C2, C6, C9] } });
    await user.click(await screen.findByRole("button", { name: "Add timetable" }));
    await waitFor(() => expect(`${router.state.location.pathname}${router.state.location.search}`).toBe("/school/exams?tab=timetable&exam=e1&class=c9"));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("an exam with no papers says so and offers the timetable", async () => {
    openPage({ ...EXAM, papers: [], paperCount: 0, classCount: 0 });
    expect(await screen.findByText("No timetable yet")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add timetable" })).toBeInTheDocument();
  });

  it("says why when the exam is not there", async () => {
    openPage(EXAM, { "GET /exams/e1": refused("This exam is not on the school's list any more", 404, { code: "EXAM_NOT_FOUND" }) });
    expect(await screen.findByText("This exam is not on the school's list any more")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to Exam" })).toHaveAttribute("href", "/school/exams");
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

  it("a paper whose marks are in says how many children have theirs", async () => {
    openPage({ ...EXAM, papers: [{ ...P1, marked: 38 }, P3, { ...P2, marked: 1 }] });
    const one = await screen.findByRole("region", { name: "Class 1, Class 2" });
    expect(within(one).getByRole("row", { name: /Mathematics/ })).toHaveTextContent("Marks of 38 children");
    expect(within(one).getByRole("row", { name: /English/ })).toHaveTextContent("Marks of 1 child");
  });
});

describe("changing the exam", () => {
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
    // Whom it is for comes back as it was; the time is each paper's now (2026-11-26), so an older exam's own school hours are let go.
    expect(writes(calls)[0]).toMatchObject({
      method: "PATCH",
      path: "/exams/e1",
      body: { name: "Half-Yearly 2026", type: "half_yearly", startDate: "2026-09-15", endDate: "2026-09-26", scope: "school", departmentIds: [], classIds: [], schoolStart: null, schoolEnd: null },
    });
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

describe("a year that is over is open (read only)", () => {
  it("shows the exam and its papers, with nothing to add, change or take away", async () => {
    store.dispatch(yearViewChanged("y26"));
    openPage();
    expect(await screen.findByRole("heading", { name: EXAM.name })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add timetable" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Edit timetable" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Change exam" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Delete exam" })).not.toBeInTheDocument();
  });
});
