import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Provider } from "react-redux";
import { RouterProvider, createMemoryRouter } from "react-router";
import { ToastProvider } from "../../../components/ui/toast-context";
import { allApiSlices } from "../../../redux/api/apiRoot";
import store from "../../../redux/store";
import { sessionStarted, signedOut } from "../../../redux/slices/authSlice";
import { yearViewChanged } from "../../../redux/slices/yearViewSlice";
import { fakeApi, type Call, type Handler } from "../../../test/fakeApi";
import { STRUCTURE } from "../../../test/fixtures";
import type { AcademicStructure, Exam, ExamDetail, ExamPaper } from "../../../types";
import ExamsPage from "../Exams";

/**
 * Exam (2026-11-26: its own row at the top of the menu, was Test & Exam under Manage school): the tab **Exams** with the year's exams and
 * tests, found by whether they have come, each one's page, and "Schedule exam" (for the whole school, some departments or some classes);
 * the tab **Exam Time Table**, where the school decides which class writes what on which day at which time. "Today" is Friday 6 Nov 2026.
 */

const C1 = { id: "c1", name: "Class 1", order: 1 };
const C2 = { id: "c2", name: "Class 2", order: 2 };
const C9 = { id: "c9", name: "Class 9", order: 9 };
const WHOLE = { label: "Whole school", departments: [], classes: [C1, C2, C9] };

const exam = (over: Partial<Exam>): Exam => ({
  id: "e1",
  name: "Half-Yearly Exam",
  type: "half_yearly",
  typeLabel: "Half-yearly exam",
  full: true,
  startDate: "2026-09-15",
  endDate: "2026-09-26",
  schoolHours: { start: "08:00", end: "12:30" },
  scope: "school",
  audience: WHOLE,
  note: null,
  status: "over",
  paperCount: 12,
  classCount: 8,
  ...over,
});
const RUNNING = exam({
  id: "e3",
  name: "Unit Test 2",
  type: "unit_test",
  typeLabel: "Unit test",
  full: false,
  startDate: "2026-11-05",
  endDate: "2026-11-09",
  schoolHours: null,
  scope: "classes",
  audience: { label: "Class 1 and Class 2", departments: [], classes: [C1, C2] },
  status: "running",
  paperCount: 1,
  classCount: 1,
});
const MONTHLY = exam({ id: "e2", name: "Monthly Test - November", type: "monthly_test", typeLabel: "Monthly test", full: false, startDate: "2026-11-30", endDate: "2026-11-30", schoolHours: null, status: "upcoming", paperCount: 0, classCount: 0 });
const HALF = exam({});

const MATHS = { id: "s1", name: "Mathematics" };
const PAPER: ExamPaper = { id: "p1", examId: "e3", classIds: ["c1"], classes: [C1], subject: MATHS, date: "2026-11-06", startTime: "09:00", endTime: "12:00", durationMinutes: 180, maxMarks: 50, topic: null, marked: 0, holiday: null };
const RUNNING_DETAIL: ExamDetail = { ...RUNNING, audience: RUNNING.audience!, papers: [PAPER] };
const MONTHLY_DETAIL: ExamDetail = { ...MONTHLY, audience: MONTHLY.audience!, papers: [] };

const SCHOOL: AcademicStructure = {
  ...STRUCTURE,
  departments: [
    { id: "d1", name: "Primary", classCount: 2 },
    { id: "d2", name: "Secondary", classCount: 1 },
  ],
  classes: [
    { id: "c1", name: "Class 1", order: 1, departmentId: "d1", capacity: null, sections: [] },
    { id: "c2", name: "Class 2", order: 2, departmentId: "d1", capacity: null, sections: [] },
    { id: "c9", name: "Class 9", order: 9, departmentId: "d2", capacity: null, sections: [] },
  ],
};
const SUBJECTS = { items: [{ id: "s1", name: "Mathematics", code: "MAT", category: "academic", isActive: true, sections: 3 }] };

function openPage(items: Exam[] = [RUNNING, MONTHLY, HALF], extra: Record<string, Handler> = {}, at = "/school/exams") {
  store.dispatch(sessionStarted({ user: { id: "u1", name: "Anuj", email: "a@school.example", username: null, role: "school_admin", tenantId: "t1", emailVerifiedAt: null }, tenant: null }));
  const calls = fakeApi({
    "GET /exams": () => ({ items }),
    "GET /exams/e3": () => RUNNING_DETAIL,
    "GET /exams/e2": () => MONTHLY_DETAIL,
    "GET /academics/structure": () => SCHOOL,
    "GET /subjects": () => SUBJECTS,
    "POST /exams": (body) => exam({ id: "e9", paperCount: 0, classCount: 0, status: "upcoming", ...(body as object), typeLabel: "Half-yearly exam" } as Partial<Exam>),
    "POST /exams/e3/papers": () => ({ items: [PAPER] }),
    ...extra,
  });
  const router = createMemoryRouter([{ path: "/school/exams", element: <ExamsPage /> }, { path: "/school/exams/:id", element: <p>The page of an exam</p> }], { initialEntries: [at] });
  render(
    <Provider store={store}>
      <ToastProvider>
        <RouterProvider router={router} />
      </ToastProvider>
    </Provider>
  );
  return { calls, router, user: userEvent.setup() };
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-06T06:00:00.000Z"));
});

afterEach(() => {
  cleanup();
  store.dispatch(signedOut());
  for (const api of allApiSlices) store.dispatch(api.util.resetApiState());
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

type User = ReturnType<typeof userEvent.setup>;
const writes = (calls: Call[]) => calls.filter((c) => c.method !== "GET");
const reads = (calls: Call[]) => calls.filter((c) => c.method === "GET").map((c) => c.path);

describe("the Exam page and its two tabs (2026-11-26)", () => {
  it("is called Exam and opens on the Exams tab (with how many there are, like the Students tabs); Exam Time Table is the other tab, kept in the address", async () => {
    const { router, user } = openPage();
    expect(await screen.findByRole("heading", { name: "Exam", level: 1 })).toBeInTheDocument();
    const tabs = screen.getByRole("tablist", { name: "Exam" });
    // 2026-11-27: Students (roll numbers) and Rooms too.
    await waitFor(() => expect(within(tabs).getAllByRole("tab").map((t) => t.textContent)).toEqual(["Exams3", "Exam Time Table", "Students", "Rooms"]));
    expect(within(tabs).getByRole("tab", { name: /Exams/ })).toHaveAttribute("aria-selected", "true");
    await user.click(within(tabs).getByRole("tab", { name: "Exam Time Table" }));
    expect(router.state.location.search).toBe("?tab=timetable");
    expect(within(tabs).getByRole("tab", { name: "Exam Time Table" })).toHaveAttribute("aria-selected", "true");
  });
});

describe("the year's exams", () => {
  it("lists each exam with what it is, whom it is for, its days, whether it has come, how many papers and classes, and the school hours an older exam kept", async () => {
    openPage();
    const cards = await screen.findAllByRole("link", { name: /Exam|Test/ });
    expect(cards.map((c) => within(c).getByRole("heading").textContent)).toEqual(["Unit Test 2", "Monthly Test - November", "Half-Yearly Exam"]);

    const half = screen.getByRole("link", { name: /Half-Yearly Exam/ });
    expect(half).toHaveTextContent("Half-yearly exam");
    expect(half).toHaveTextContent("Whole school");
    expect(half).toHaveTextContent("15 Sep to 26 Sep 2026");
    expect(half).toHaveTextContent("Over");
    expect(half).toHaveTextContent("12 papers");
    expect(half).toHaveTextContent("8 classes");
    expect(half).toHaveTextContent("School 8:00 AM to 12:30 PM");
    expect(half).toHaveAttribute("href", "/school/exams/e1");

    const unit = screen.getByRole("link", { name: /Unit Test 2/ });
    expect(unit).toHaveTextContent("Running");
    expect(unit).toHaveTextContent("Class 1 and Class 2");
    expect(unit).toHaveTextContent("1 class");
    expect(unit).not.toHaveTextContent("School ");
    const monthly = screen.getByRole("link", { name: /Monthly Test - November/ });
    expect(monthly).toHaveTextContent("Upcoming");
    expect(monthly).toHaveTextContent("No timetable yet");
    expect(monthly).toHaveTextContent("30 Nov 2026");
  });

  it("filters by whether they have come, from the one list already read", async () => {
    const { calls, user } = openPage();
    await screen.findByRole("link", { name: /Half-Yearly Exam/ });
    const filter = screen.getByRole("radiogroup", { name: "Show" });
    await user.click(within(filter).getByRole("radio", { name: "Upcoming" }));
    expect(screen.getAllByRole("link").map((l) => l.textContent).join(" ")).toContain("Monthly Test - November");
    expect(screen.queryByRole("link", { name: /Half-Yearly Exam/ })).not.toBeInTheDocument();
    await user.click(within(filter).getByRole("radio", { name: "Over" }));
    expect(screen.getByRole("link", { name: /Half-Yearly Exam/ })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Monthly Test/ })).not.toBeInTheDocument();
    await user.click(within(filter).getByRole("radio", { name: "Running" }));
    expect(screen.getByRole("link", { name: /Unit Test 2/ })).toBeInTheDocument();
    await user.click(within(filter).getByRole("radio", { name: "All" }));
    expect(screen.getAllByRole("link", { name: /Exam|Test/ })).toHaveLength(3);
    expect(reads(calls)).toEqual(["/exams"]);
  });

  it("says so when there are none, and offers to schedule the first", async () => {
    openPage([]);
    expect(await screen.findByText("No exams or tests yet")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Schedule exam" }).length).toBeGreaterThan(0);
  });

  it("says why when the list could not be read", async () => {
    openPage([], { "GET /exams": () => new Response(JSON.stringify({ success: false, message: "The list is busy" }), { status: 400, headers: { "Content-Type": "application/json" } }) });
    expect(await screen.findByText("The list is busy")).toBeInTheDocument();
  });
});

describe("scheduling an exam", () => {
  async function openDialog(user: User) {
    await user.click(await screen.findByRole("button", { name: "Schedule exam" }));
    return screen.findByRole("dialog", { name: "Schedule exam" });
  }

  it("a kind is one click and offers its usual name; it is for the whole school unless chosen; the time is set in the Exam Time Table, not here; saving opens the new exam's page", async () => {
    const { calls, router, user } = openPage();
    const dialog = await openDialog(user);
    await user.click(within(dialog).getByRole("radio", { name: "Half-yearly exam" }));
    expect(within(dialog).getByLabelText(/^Name/)).toHaveValue("Half-Yearly Exam");
    expect(within(dialog).getByRole("radio", { name: "Whole school" })).toBeChecked();
    expect(within(dialog).queryByLabelText("School starts")).not.toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Today" }));
    await user.click(within(dialog).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(writes(calls)).toHaveLength(1));
    expect(writes(calls)[0]).toMatchObject({
      method: "POST",
      path: "/exams",
      body: { name: "Half-Yearly Exam", type: "half_yearly", startDate: "2026-11-06", endDate: "2026-11-06", scope: "school", departmentIds: [], classIds: [], schoolStart: null, schoolEnd: null, note: null },
    });
    await waitFor(() => expect(router.state.location.pathname).toBe("/school/exams/e9"));
    // The school's classes and departments are read only for a choice of departments or classes.
    expect(reads(calls)).not.toContain("/academics/structure");
  });

  it("for some departments: the departments are chosen, and sent", async () => {
    const { calls, user } = openPage();
    const dialog = await openDialog(user);
    await user.click(within(dialog).getByRole("radio", { name: "Half-yearly exam" }));
    await user.click(within(dialog).getByRole("button", { name: "Today" }));
    await user.click(within(dialog).getByRole("radio", { name: "Departments" }));
    await user.click(within(dialog).getByRole("button", { name: "Save" }));
    expect(await within(dialog).findByText("Choose the departments")).toBeInTheDocument();
    expect(writes(calls)).toHaveLength(0);
    await user.click(within(dialog).getByRole("button", { name: /Select departments/ }));
    await user.click(await screen.findByRole("option", { name: "Primary" }));
    await user.keyboard("{Escape}");
    await user.click(within(dialog).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(writes(calls)).toHaveLength(1));
    expect(writes(calls)[0].body).toMatchObject({ scope: "departments", departmentIds: ["d1"], classIds: [] });
  });

  it("for some classes: the classes are chosen, and sent", async () => {
    const { calls, user } = openPage();
    const dialog = await openDialog(user);
    await user.click(within(dialog).getByRole("radio", { name: "Class test" }));
    await user.click(within(dialog).getByRole("button", { name: "Tomorrow" }));
    await user.click(within(dialog).getByRole("radio", { name: "Classes" }));
    await user.click(within(dialog).getByRole("button", { name: /Select classes/ }));
    await user.click(await screen.findByRole("option", { name: "Class 9" }));
    await user.keyboard("{Escape}");
    await user.click(within(dialog).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(writes(calls)).toHaveLength(1));
    expect(writes(calls)[0].body).toMatchObject({ type: "class_test", startDate: "2026-11-07", scope: "classes", departmentIds: [], classIds: ["c9"] });
  });

  it("changing the kind changes the offered name but not one the school typed", async () => {
    const { user } = openPage();
    const dialog = await openDialog(user);
    await user.click(within(dialog).getByRole("radio", { name: "Monthly test" }));
    expect(within(dialog).getByLabelText(/^Name/)).toHaveValue("Monthly Test");
    const name = within(dialog).getByLabelText(/^Name/);
    await user.clear(name);
    await user.type(name, "Monthly Test - December");
    await user.click(within(dialog).getByRole("radio", { name: "Class test" }));
    expect(name).toHaveValue("Monthly Test - December");
  });

  it("asks for what is missing and sends nothing: the kind, a name and the first day", async () => {
    const { calls, user } = openPage();
    const dialog = await openDialog(user);
    await user.click(within(dialog).getByRole("button", { name: "Save" }));
    expect(await within(dialog).findByText("Choose what it is")).toBeInTheDocument();
    await user.click(within(dialog).getByRole("radio", { name: "Annual exam" }));
    await user.clear(within(dialog).getByLabelText(/^Name/));
    await user.click(within(dialog).getByRole("button", { name: "Save" }));
    expect(await within(dialog).findByText("Enter the exam name")).toBeInTheDocument();
    expect(within(dialog).getByText("Choose the first day")).toBeInTheDocument();
    expect(writes(calls)).toHaveLength(0);
  });

  it("says in words what the server refused, and stays open", async () => {
    const { user } = openPage(undefined, {
      "POST /exams": () => new Response(JSON.stringify({ success: false, message: "There is already an exam called Half-Yearly Exam this year", code: "EXAM_EXISTS" }), { status: 409, headers: { "Content-Type": "application/json" } }),
    });
    const dialog = await openDialog(user);
    await user.click(within(dialog).getByRole("radio", { name: "Class test" }));
    await user.click(within(dialog).getByRole("button", { name: "Today" }));
    await user.click(within(dialog).getByRole("button", { name: "Save" }));
    expect(await within(dialog).findByText("There is already an exam called Half-Yearly Exam this year")).toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "Schedule exam" })).toBeInTheDocument();
  });
});

describe("the Exam Time Table tab (2026-11-27: a class at the top, then its days in a table, a click puts the subject)", () => {
  const table = (name = "Class 1") => screen.findByRole("table", { name: `Timetable of ${name}` });
  const rowOf = (t: HTMLElement, day: string) => within(t).getByRole("row", { name: new RegExp(day) });
  const timeTable = "/school/exams?tab=timetable";

  it("opens on the exam that is on, with its classes at the top (the first chosen) and every day of the exam as a row: the date, the subject, the time and the marks", async () => {
    const { calls } = openPage(undefined, {}, timeTable);
    const t = await table();
    const classes = screen.getByRole("radiogroup", { name: "Class" });
    expect(within(classes).getAllByRole("radio").map((r) => r.closest("label")?.textContent)).toEqual(["Class 1", "Class 2"]);
    expect(within(classes).getByRole("radio", { name: "Class 1" })).toBeChecked();
    expect(screen.getByText("1 of 2 classes have a timetable")).toBeInTheDocument();
    // Thursday 5 to Monday 9 November: five days, the Sunday said so.
    expect(within(t).getAllByRole("row").slice(1).map((r) => within(r).getAllByRole("cell")[0].textContent)).toEqual(["Thu, 5 Nov", "Fri, 6 Nov", "Sat, 7 Nov", "Sun, 8 NovSunday", "Mon, 9 Nov"]);
    const fri = rowOf(t, "Fri, 6 Nov");
    expect(fri).toHaveTextContent("Mathematics");
    expect(fri).toHaveTextContent("9:00 AM to 12:00 PM");
    expect(fri).toHaveTextContent("50");
    expect(within(rowOf(t, "Thu, 5 Nov")).getByRole("button", { name: "Add subject on Thu, 5 Nov" })).toBeInTheDocument();
    // The subjects are read only when a day is clicked.
    expect(reads(calls)).toEqual(["/exams", "/exams/e3"]);
  });

  it("a click on a day of the class chosen puts a subject there, at the time of the class's other papers (a class with none: 9:00 for a test's 40 minutes)", async () => {
    const { calls, router, user } = openPage(undefined, {}, timeTable);
    await table();
    await user.click(screen.getByRole("radio", { name: "Class 2" }));
    expect(router.state.location.search).toContain("class=c2");
    const t = await table("Class 2");
    await user.click(within(rowOf(t, "Thu, 5 Nov")).getByRole("button", { name: "Add subject on Thu, 5 Nov" }));
    const editing = rowOf(t, "Thu, 5 Nov");
    expect(within(editing).getByLabelText("Starts")).toHaveValue("09:00");
    expect(within(editing).getByLabelText("Ends")).toHaveValue("09:40");
    await user.click(within(editing).getByRole("button", { name: /Pick a subject/ }));
    await user.click(await screen.findByRole("option", { name: "Mathematics" }));
    fireEvent.change(within(editing).getByLabelText("Ends"), { target: { value: "10:00" } });
    await user.type(within(editing).getByLabelText("Marks"), "25");
    await user.click(within(editing).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(writes(calls)).toHaveLength(1));
    expect(writes(calls)[0]).toMatchObject({
      method: "POST",
      path: "/exams/e3/papers",
      body: { classIds: ["c2"], papers: [{ subjectId: "s1", date: "2026-11-05", startTime: "09:00", durationMinutes: 60, maxMarks: 25, topic: null }] },
    });
    expect(await screen.findByText("Mathematics is on Thu, 5 Nov for Class 2.")).toBeInTheDocument();
  });

  it("a paper is changed from its row: its subject, time and marks are there", async () => {
    const { calls, user } = openPage(undefined, { "PATCH /exams/e3/papers/p1": (body) => ({ ...PAPER, ...(body as object) }) }, timeTable);
    const t = await table();
    await user.click(within(rowOf(t, "Fri, 6 Nov")).getByRole("button", { name: "Change Mathematics" }));
    const editing = rowOf(t, "Fri, 6 Nov");
    expect(within(editing).getByLabelText("Starts")).toHaveValue("09:00");
    expect(within(editing).getByLabelText("Ends")).toHaveValue("12:00");
    expect(within(editing).getByLabelText("Marks")).toHaveValue(50);
    fireEvent.change(within(editing).getByLabelText("Ends"), { target: { value: "11:30" } });
    await user.click(within(editing).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(writes(calls)).toHaveLength(1));
    expect(writes(calls)[0]).toMatchObject({ method: "PATCH", path: "/exams/e3/papers/p1", body: { subjectId: "s1", date: "2026-11-06", startTime: "09:00", durationMinutes: 150, maxMarks: 50, topic: null } });
    expect(writes(calls)[0].body).not.toHaveProperty("classIds");
  });

  it("taken off the class: a paper of this class alone goes; one the class shares with others only loses this class", async () => {
    const shared = { ...PAPER, classIds: ["c1", "c2"], classes: [C1, C2] };
    const { calls, user } = openPage(
      undefined,
      {
        "GET /exams/e3": () => ({ ...RUNNING_DETAIL, papers: [shared] }),
        "PATCH /exams/e3/papers/p1": (body) => ({ ...shared, ...(body as object) }),
      },
      timeTable
    );
    const t = await table();
    expect(rowOf(t, "Fri, 6 Nov")).toHaveTextContent("Also Class 2");
    await user.click(within(rowOf(t, "Fri, 6 Nov")).getByRole("button", { name: "Take Mathematics off Class 1" }));
    const ask = await screen.findByRole("dialog", { name: "Take Mathematics off Class 1?" });
    await user.click(within(ask).getByRole("button", { name: "Take off" }));
    await waitFor(() => expect(writes(calls)).toHaveLength(1));
    expect(writes(calls)[0]).toMatchObject({ method: "PATCH", path: "/exams/e3/papers/p1", body: { classIds: ["c2"] } });
  });

  it("a paper of the class alone is deleted", async () => {
    const { calls, user } = openPage(undefined, { "DELETE /exams/e3/papers/p1": () => ({ id: "p1" }) }, timeTable);
    const t = await table();
    await user.click(within(rowOf(t, "Fri, 6 Nov")).getByRole("button", { name: "Take Mathematics off Class 1" }));
    await user.click(within(await screen.findByRole("dialog", { name: "Take Mathematics off Class 1?" })).getByRole("button", { name: "Take off" }));
    await waitFor(() => expect(writes(calls)).toHaveLength(1));
    expect(writes(calls)[0]).toMatchObject({ method: "DELETE", path: "/exams/e3/papers/p1" });
  });

  it("asks for the subject and an end after the start; what the server refuses is said under the row, which stays open", async () => {
    const { calls, user } = openPage(
      undefined,
      { "POST /exams/e3/papers": () => new Response(JSON.stringify({ success: false, message: "Class 1 already has English from 9:00 AM to 12:00 PM on 5 Nov (Unit Test 1)", code: "PAPER_CLASH" }), { status: 409, headers: { "Content-Type": "application/json" } }) },
      timeTable
    );
    const t = await table();
    await user.click(within(rowOf(t, "Thu, 5 Nov")).getByRole("button", { name: "Add subject on Thu, 5 Nov" }));
    const editing = rowOf(t, "Thu, 5 Nov");
    fireEvent.change(within(editing).getByLabelText("Ends"), { target: { value: "08:00" } });
    await user.click(within(editing).getByRole("button", { name: "Save" }));
    expect(await within(t).findByText("Choose the subject")).toBeInTheDocument();
    expect(within(t).getByText("The paper must end after it starts")).toBeInTheDocument();
    expect(writes(calls)).toHaveLength(0);
    await user.click(within(editing).getByRole("button", { name: /Pick a subject/ }));
    await user.click(await screen.findByRole("option", { name: "Mathematics" }));
    fireEvent.change(within(editing).getByLabelText("Ends"), { target: { value: "12:00" } });
    await user.click(within(editing).getByRole("button", { name: "Save" }));
    expect(await within(t).findByText("Class 1 already has English from 9:00 AM to 12:00 PM on 5 Nov (Unit Test 1)")).toBeInTheDocument();
    expect(within(rowOf(t, "Thu, 5 Nov")).getByRole("button", { name: "Save" })).toBeInTheDocument();
  });

  it("another exam is chosen from the list, and kept in the address", async () => {
    const { router, user } = openPage(undefined, {}, timeTable);
    await table();
    await user.click(document.getElementById("timetable-exam")!);
    await user.click(await screen.findByRole("option", { name: /Monthly Test - November/ }));
    const t = await screen.findByRole("table", { name: "Timetable of Class 1" });
    expect(within(t).getByRole("row", { name: /Mon, 30 Nov/ })).toBeInTheDocument();
    expect(router.state.location.search).toContain("exam=e2");
  });

  it("Same for several classes puts one timetable for many classes at once, offering only the exam's classes", async () => {
    const { calls, user } = openPage(undefined, {}, timeTable);
    await table();
    await user.click(screen.getByRole("button", { name: "Same for several classes" }));
    const dialog = await screen.findByRole("dialog", { name: "Add timetable" });
    expect(within(dialog).getAllByRole("checkbox").map((c) => c.closest("label")?.textContent)).toEqual(["Class 1", "Class 2"]);
    await user.click(within(dialog).getByRole("checkbox", { name: "Class 2" }));
    await user.click(document.getElementById("paper-0-subject")!);
    await user.click(await screen.findByRole("option", { name: "Mathematics" }));
    fireEvent.change(within(dialog).getByLabelText("Starts", { selector: "#paper-0-start" }), { target: { value: "09:00" } });
    fireEvent.change(within(dialog).getByLabelText("Ends", { selector: "#paper-0-end" }), { target: { value: "12:00" } });
    await user.click(within(dialog).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(writes(calls)).toHaveLength(1));
    expect(writes(calls)[0]).toMatchObject({ path: "/exams/e3/papers", body: { classIds: ["c2"], papers: [{ subjectId: "s1", startTime: "09:00", durationMinutes: 180 }] } });
    // The exam already says its classes: the school's whole layout is not read for this.
    expect(reads(calls)).not.toContain("/academics/structure");
  });

  it("says so when there is no exam yet", async () => {
    openPage([], {}, "/school/exams?tab=timetable");
    expect(await screen.findByText("Schedule an exam first: its timetable is made here")).toBeInTheDocument();
  });
});

describe("a year that is over is open (read only)", () => {
  it("lists the year's exams, with no Schedule exam (the server would refuse it)", async () => {
    store.dispatch(yearViewChanged("y26"));
    openPage();
    expect(await screen.findByText("Half-Yearly Exam")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Schedule exam" })).not.toBeInTheDocument();
  });

  it("an empty year says so and offers nothing to add", async () => {
    store.dispatch(yearViewChanged("y26"));
    openPage([]);
    expect(await screen.findByText("No exams or tests yet")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Schedule exam" })).not.toBeInTheDocument();
  });
});
