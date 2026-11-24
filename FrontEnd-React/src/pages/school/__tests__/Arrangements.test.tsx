import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Provider } from "react-redux";
import { RouterProvider, createMemoryRouter } from "react-router";
import { ToastProvider } from "../../../components/ui/toast-context";
import { allApiSlices } from "../../../redux/api/apiRoot";
import store from "../../../redux/store";
import { fakeApi, type Call, type Handler } from "../../../test/fakeApi";
import { todayInIndia } from "../../../utils/students";
import { addDays } from "../../../utils/calendar";
import type { ArrangementDay, ArrangementInput, ArrangementLesson, StaffLeave } from "../../../types";
import ArrangementsPage from "../Arrangements";

/**
 * Timetable > Arrangements (2026-11-22, user: "teacher absent ho to arrangement: alag tab mein kaun nahi aaya, fir kaun kaun se teacher free hain, to
 * us period mein us teacher ko assign kar paye"): the day's away teachers, their periods, the free teachers and Assign.
 */
const TODAY = todayInIndia();

const lesson = (period: number, start: string, end: string, over: Partial<ArrangementLesson> = {}): ArrangementLesson => ({
  classId: "c5",
  sectionId: null,
  label: "Class 5",
  period,
  start,
  end,
  subjectId: "s1",
  subjectName: "Mathematics",
  substitute: null,
  free: [
    { id: "t3", name: "Asha Rao", today: 0, full: false, in: true },
    { id: "t2", name: "Dev Patel", today: 2, full: false, in: false },
  ],
  ...over,
});

const DAY: ArrangementDay = {
  date: TODAY,
  today: true,
  editable: true,
  holiday: null,
  away: [
    { teacher: { id: "t1", name: "Meena Singh" }, status: "absent", lessons: [lesson(1, "08:30", "09:10"), lesson(3, "09:50", "10:30", { substitute: { id: "t2", name: "Dev Patel" } })] },
    { teacher: { id: "t4", name: "Ravi Kumar" }, status: "not_in", lessons: [] },
  ],
};

const leave = (id: string, over: Partial<StaffLeave> = {}): StaffLeave => ({
  id,
  kind: "teacher",
  personId: "t1",
  name: "Meena Singh",
  roleLabel: "Teacher",
  fromDate: addDays(TODAY, 1),
  toDate: addDays(TODAY, 2),
  days: 2,
  reason: "Sister's wedding",
  status: "pending",
  note: null,
  decidedBy: null,
  decidedAt: null,
  createdAt: "2026-11-09T10:00:00.000Z",
  canCancel: false,
  ...over,
});

/** The leave the school sees: Meena (a teacher) and Asha (the receptionist) are waiting, Dev's was approved. */
const LEAVES: StaffLeave[] = [
  leave("l1"),
  leave("l2", { kind: "staff", personId: "s1", name: "Asha Rao", roleLabel: "Receptionist", days: 1, toDate: addDays(TODAY, 1), reason: "Family function" }),
  leave("l3", { personId: "t2", name: "Dev Patel", status: "approved", decidedBy: { name: "Asha Verma", role: "school_admin" }, reason: "Fever" }),
];

function openPage(day: ArrangementDay = DAY, extra: Record<string, Handler> = {}, entry = "/school/arrangements") {
  const calls = fakeApi({
    "GET /timetable/arrangements": () => day,
    "GET /attendance/leaves": (_body, query) => {
      const items = LEAVES.filter((l) => (query.get("status") === "all" ? true : l.status === "pending")).filter((l) => !query.get("who") || l.kind === query.get("who"));
      return { items, waiting: LEAVES.filter((l) => l.status === "pending").length };
    },
    "POST /attendance/leaves/l1/decide": (body) => ({ ...LEAVES[0], status: (body as { status: StaffLeave["status"] }).status, decidedBy: { name: "Asha Verma", role: "school_admin" } }),
    // The server answers the day as it is now: the lesson with its substitute (or none).
    "PUT /timetable/arrangements": (body) => {
      const input = body as ArrangementInput;
      return {
        ...day,
        away: day.away.map((a) =>
          a.teacher.id !== input.absentTeacherId
            ? a
            : { ...a, lessons: a.lessons.map((l) => (l.period !== input.period ? l : { ...l, substitute: input.substituteTeacherId ? { id: input.substituteTeacherId, name: l.free.find((t) => t.id === input.substituteTeacherId)?.name ?? "?" } : null })) }
        ),
      };
    },
    ...extra,
  });
  const router = createMemoryRouter([{ path: "/school/arrangements", element: <ArrangementsPage /> }], { initialEntries: [entry] });
  render(
    <Provider store={store}>
      <ToastProvider>
        <RouterProvider router={router} />
      </ToastProvider>
    </Provider>
  );
  return { calls, user: userEvent.setup() };
}

afterEach(() => {
  cleanup();
  for (const api of allApiSlices) store.dispatch(api.util.resetApiState());
  vi.unstubAllGlobals();
});

const puts = (calls: Call[]) => calls.filter((c) => c.method === "PUT" && c.path === "/timetable/arrangements").map((c) => c.body as ArrangementInput);
const row = (name: string) => screen.getByRole("listitem", { name });

describe("Arrangements: who is away today and who takes their periods", () => {
  it("opens on today: the absent teachers with their periods, a tab for the ones not checked in, and how many periods are arranged", async () => {
    const { calls } = openPage();
    const meena = await screen.findByRole("region", { name: "Meena Singh" });
    expect(calls.find((c) => c.path === "/timetable/arrangements")?.query).toBe(`?date=${TODAY}`);
    expect(within(meena).getByText("Absent")).toBeInTheDocument();
    expect(within(meena).getByText("1 of 2 periods arranged")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /Absent & on leave/ })).toHaveTextContent("1");
    expect(screen.getByRole("tab", { name: /Not checked in/ })).toHaveTextContent("1");
    expect(screen.getByRole("status", { name: "Periods arranged" })).toHaveTextContent("1 of 2 periods arranged");
    // Period 1: no one yet, a list of the free teachers; period 3: Dev Patel, with Change and Remove.
    expect(within(row("Class 5, Period 1")).getByText("08:30–09:10")).toBeInTheDocument();
    expect(within(row("Class 5, Period 1")).getByRole("button", { name: "Assign" })).toBeDisabled();
    expect(within(row("Class 5, Period 3")).getByText("Dev Patel")).toBeInTheDocument();
    expect(within(row("Class 5, Period 3")).getByRole("button", { name: "Remove" })).toBeInTheDocument();
  });

  it("Assign puts the chosen free teacher in for that period (the list says how many periods each has today)", async () => {
    const { calls, user } = openPage();
    await screen.findByRole("region", { name: "Meena Singh" });
    await user.click(within(row("Class 5, Period 1")).getByRole("button", { name: /Free teacher for Class 5, Period 1$/ }));
    expect(await screen.findByRole("option", { name: "Dev Patel · 2 periods today · not in yet" })).toBeInTheDocument();
    await user.click(screen.getByRole("option", { name: "Asha Rao · 0 periods today" }));
    await user.click(within(row("Class 5, Period 1")).getByRole("button", { name: "Assign" }));
    await waitFor(() => expect(puts(calls)).toHaveLength(1));
    expect(puts(calls)[0]).toEqual({ date: TODAY, classId: "c5", sectionId: null, period: 1, absentTeacherId: "t1", substituteTeacherId: "t3" });
    expect(await within(row("Class 5, Period 1")).findByText("Asha Rao")).toBeInTheDocument();
  });

  it("Remove takes the teacher put in away", async () => {
    const { calls, user } = openPage();
    await screen.findByRole("region", { name: "Meena Singh" });
    await user.click(within(row("Class 5, Period 3")).getByRole("button", { name: "Remove" }));
    await waitFor(() => expect(puts(calls)).toHaveLength(1));
    expect(puts(calls)[0]).toMatchObject({ period: 3, substituteTeacherId: null });
  });

  it("the Not checked in tab lists the teachers with periods who have not checked in yet", async () => {
    const { user } = openPage();
    await screen.findByRole("region", { name: "Meena Singh" });
    await user.click(screen.getByRole("tab", { name: /Not checked in/ }));
    const ravi = await screen.findByRole("region", { name: "Ravi Kumar" });
    expect(within(ravi).getByText("Not checked in")).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Meena Singh" })).not.toBeInTheDocument();
  });

  it("says why the server refused, in the period's row", async () => {
    const refuse = () => new Response(JSON.stringify({ success: false, message: "Asha Rao is not free from 08:30 to 09:10 today.", code: "TEACHER_NOT_FREE" }), { status: 409, headers: { "Content-Type": "application/json" } });
    const { user } = openPage(DAY, { "PUT /timetable/arrangements": refuse });
    await screen.findByRole("region", { name: "Meena Singh" });
    await user.click(within(row("Class 5, Period 1")).getByRole("button", { name: /Free teacher for Class 5, Period 1$/ }));
    await user.click(await screen.findByRole("option", { name: "Asha Rao · 0 periods today" }));
    await user.click(within(row("Class 5, Period 1")).getByRole("button", { name: "Assign" }));
    expect(await within(row("Class 5, Period 1")).findByRole("alert")).toHaveTextContent("Asha Rao is not free from 08:30 to 09:10 today.");
  });

  it("an earlier day is only read: who took each period, nothing to change, no Not checked in tab", async () => {
    const before = { ...DAY, date: "2026-11-02", today: false, editable: false, away: [DAY.away[0]] };
    openPage(before, {}, "/school/arrangements?date=2026-11-02");
    await screen.findByRole("region", { name: "Meena Singh" });
    expect(within(row("Class 5, Period 1")).getByText("No one was put in")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Assign" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Remove" })).not.toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: /Not checked in/ })).not.toBeInTheDocument();
  });

  it("a holiday says so; a day with nobody away says that", async () => {
    openPage({ ...DAY, holiday: "Guru Nanak Jayanti", away: [] });
    expect(await screen.findByText("No school: Guru Nanak Jayanti")).toBeInTheDocument();
    cleanup();
    for (const api of allApiSlices) store.dispatch(api.util.resetApiState());
    openPage({ ...DAY, away: [] });
    expect(await screen.findByText("No teacher is absent or on leave")).toBeInTheDocument();
  });

  it("a day to come with an approved leave can be arranged ahead: On leave, Assign, no Not checked in tab", async () => {
    const tomorrow = addDays(TODAY, 1);
    const ahead: ArrangementDay = { date: tomorrow, today: false, editable: true, holiday: null, away: [{ teacher: { id: "t2", name: "Dev Patel" }, status: "leave", lessons: [lesson(1, "08:30", "09:10")] }] };
    const { calls, user } = openPage(ahead, {}, `/school/arrangements?date=${tomorrow}`);
    const dev = await screen.findByRole("region", { name: "Dev Patel" });
    expect(within(dev).getByText("On leave")).toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: /Not checked in/ })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Next day" })).toBeEnabled();
    await user.click(within(row("Class 5, Period 1")).getByRole("button", { name: /Free teacher for Class 5, Period 1$/ }));
    await user.click(await screen.findByRole("option", { name: "Asha Rao · 0 periods today" }));
    await user.click(within(row("Class 5, Period 1")).getByRole("button", { name: "Assign" }));
    await waitFor(() => expect(puts(calls)).toHaveLength(1));
    expect(puts(calls)[0]).toEqual({ date: tomorrow, classId: "c5", sectionId: null, period: 1, absentTeacherId: "t2", substituteTeacherId: "t3" });
  });
});

describe("Leave & arrangements: the leave of the teachers and the staff, on the same page", () => {
  const leaveCard = (name: string) => screen.getByRole("article", { name });

  it("is called Leave & arrangements: two tabs, Arrangements open, the waiting leaves counted on Leave requests", async () => {
    openPage();
    expect(await screen.findByRole("heading", { name: "Leave & arrangements" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Arrangements", selected: true })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("tab", { name: /Leave requests/ })).toHaveTextContent("2"));
  });

  it("the Leave requests tab shows each application: who, their role, the days, the reason and where it stands", async () => {
    const { calls, user } = openPage();
    await user.click(await screen.findByRole("tab", { name: /Leave requests/ }));
    const meena = await screen.findByRole("article", { name: "Meena Singh" });
    expect(within(meena).getByText("Teacher")).toBeInTheDocument();
    expect(within(meena).getByText(/2 days/)).toBeInTheDocument();
    expect(within(meena).getByText("Sister's wedding")).toBeInTheDocument();
    expect(within(meena).getByText("Waiting")).toBeInTheDocument();
    const asha = leaveCard("Asha Rao");
    expect(within(asha).getByText("Receptionist")).toBeInTheDocument();
    expect(within(asha).getByText("Family function")).toBeInTheDocument();
    // Only the waiting ones to begin with.
    expect(screen.queryByRole("article", { name: "Dev Patel" })).not.toBeInTheDocument();
    expect(calls.filter((c) => c.path === "/attendance/leaves").every((c) => c.query === "?status=pending")).toBe(true);
  });

  it("the address ?view=leave (the bell's link) opens the Leave requests tab", async () => {
    openPage(DAY, {}, "/school/arrangements?view=leave");
    expect(await screen.findByRole("article", { name: "Meena Singh" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /Leave requests/, selected: true })).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Meena Singh" })).not.toBeInTheDocument();
  });

  it("All shows the answered too, with who answered; an approved leave of a teacher to come offers Arrange periods on its first day", async () => {
    const { user } = openPage(DAY, {}, "/school/arrangements?view=leave");
    await screen.findByRole("article", { name: "Meena Singh" });
    await user.click(screen.getByRole("tab", { name: "All" }));
    const dev = await screen.findByRole("article", { name: "Dev Patel" });
    expect(within(dev).getByText("Approved")).toBeInTheDocument();
    expect(within(dev).getByText("Approved by Asha Verma")).toBeInTheDocument();
    expect(within(dev).getByRole("link", { name: "Arrange periods" })).toHaveAttribute("href", `/school/arrangements?date=${addDays(TODAY, 1)}`);
    // A waiting leave has Approve and Decline, not that link.
    expect(within(leaveCard("Meena Singh")).queryByRole("link", { name: "Arrange periods" })).not.toBeInTheDocument();
  });

  it("can be narrowed to the staff", async () => {
    const { calls, user } = openPage(DAY, {}, "/school/arrangements?view=leave");
    await screen.findByRole("article", { name: "Meena Singh" });
    await user.click(screen.getByRole("button", { name: /Who/ }));
    await user.click(await screen.findByRole("option", { name: "Staff" }));
    await waitFor(() => expect(screen.queryByRole("article", { name: "Meena Singh" })).not.toBeInTheDocument());
    expect(screen.getByRole("article", { name: "Asha Rao" })).toBeInTheDocument();
    expect(calls.some((c) => c.path === "/attendance/leaves" && c.query.includes("who=staff"))).toBe(true);
  });

  it("Approve answers in one click and says so", async () => {
    const { calls, user } = openPage(DAY, {}, "/school/arrangements?view=leave");
    await screen.findByRole("article", { name: "Meena Singh" });
    await user.click(within(leaveCard("Meena Singh")).getByRole("button", { name: "Approve" }));
    expect(await screen.findByText("Leave approved")).toBeInTheDocument();
    expect(calls.find((c) => c.method === "POST" && c.path === "/attendance/leaves/l1/decide")?.body).toEqual({ status: "approved" });
  });

  it("Decline asks for a note first, which goes to the person", async () => {
    const { calls, user } = openPage(DAY, {}, "/school/arrangements?view=leave");
    await screen.findByRole("article", { name: "Meena Singh" });
    await user.click(within(leaveCard("Meena Singh")).getByRole("button", { name: "Decline" }));
    await user.type(await screen.findByLabelText(/Note to Meena Singh/), "Exams that week");
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Decline" }));
    expect(await screen.findByText("Leave declined")).toBeInTheDocument();
    expect(calls.find((c) => c.method === "POST" && c.path === "/attendance/leaves/l1/decide")?.body).toEqual({ status: "declined", note: "Exams that week" });
  });

  it("says when no leave is waiting", async () => {
    openPage(DAY, { "GET /attendance/leaves": () => ({ items: [], waiting: 0 }) }, "/school/arrangements?view=leave");
    expect(await screen.findByText("No leave is waiting")).toBeInTheDocument();
  });
});
