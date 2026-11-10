import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Provider } from "react-redux";
import { RouterProvider, createMemoryRouter } from "react-router";
import { ToastProvider } from "../../ui/toast-context";
import { allApiSlices } from "../../../redux/api/apiRoot";
import store from "../../../redux/store";
import { authChecked, sessionStarted, signedOut } from "../../../redux/slices/authSlice";
import { fakeApi, type Call } from "../../../test/fakeApi";
import type { SchoolDashboard as Dashboard, SchoolTrend } from "../../../types";
import { SchoolDashboard } from "../SchoolDashboard";

/**
 * The school's home page, laid out like Infinity Medisetu's (2026-11-10): a greeting and the days to look at (Today, This week, This month,
 * Custom), five figures each compared with the days just before, a line about the school's day right now, and cards. ONE request answers the
 * days picked (and one more the chart's own week or month); every number is what is in the school now (never the estimate from sign-up,
 * never a made-up sample). Tuesday 10 Nov 2026, 11:00 in India.
 */

const SIGNED_UP_WITH = 43223;

const months = ["2026-06", "2026-07", "2026-08", "2026-09", "2026-10", "2026-11"];

const TODAY = "2026-11-10";

const dashboard = (over: Partial<Dashboard> = {}): Dashboard => ({
  date: TODAY,
  academicYear: { id: "y1", name: "2026-2027" },
  classes: 3,
  students: {
    total: 120,
    byClass: [
      { classId: "c1", name: "Class 1", enrolled: 50 },
      { classId: "c2", name: "Class 2", enrolled: 70 },
    ],
    gender: { male: 70, female: 48, other: 2 },
  },
  people: { teachers: 8, staff: 3 },
  attendance: {
    working: true,
    holiday: null,
    students: { present: 90, late: 4, absent: 20, leave: 2, percent: 81, classesTaken: 2, classesTotal: 3 },
    teachers: { total: 8, present: 5, late: 1, absent: 1 },
  },
  admissions: months.map((month, i) => ({ month, count: [0, 0, 4, 9, 6, 2][i] })),
  attention: [
    { kind: "teachers_absent", count: 1 },
    { kind: "attendance_pending", count: 1 },
    { kind: "leave_pending", count: 2 },
  ],
  upcoming: [
    { title: "Sports Day", kind: "event", startDate: "2026-11-12", endDate: "2026-11-12" },
    { title: "Children's Day", kind: "holiday", startDate: "2026-11-14", endDate: "2026-11-14" },
    { title: "Half-Yearly Exam", kind: "exam", startDate: "2026-11-20", endDate: "2026-11-27" },
  ],
  period: {
    from: TODAY,
    to: TODAY,
    previous: { from: "2026-11-09", to: "2026-11-09" },
    students: { admitted: 3, admittedBefore: 1 },
    attendance: { present: 90, late: 4, absent: 20, leave: 2, percent: 81, before: { absent: 10, percent: 75 } },
    teachers: { present: 5, late: 1, absent: 1, percent: 86, before: { percent: 80 } },
    leaves: { asked: 4, askedBefore: 2 },
    absentClasses: [
      { classId: "c2", name: "Class 2", absent: 12, marks: 70 },
      { classId: "c1", name: "Class 1", absent: 8, marks: 50 },
    ],
  },
  day: { working: true, holiday: null, start: "08:30", end: "14:20" },
  ...over,
});

/** The children's attendance day by day for the chart: this week, Monday to Sunday. */
const trend = (over: Partial<SchoolTrend> = {}): SchoolTrend => ({
  period: "week",
  from: "2026-11-09",
  to: "2026-11-15",
  points: ["2026-11-09", "2026-11-10", "2026-11-11", "2026-11-12", "2026-11-13", "2026-11-14", "2026-11-15"].map((date, i) => ({ date, percent: [82, 81, null, null, null, null, null][i] })),
  percent: 81,
  before: 78,
  ...over,
});

const NEW_SCHOOL: Dashboard = dashboard({
  classes: 22,
  students: { total: 0, byClass: [], gender: { male: 0, female: 0, other: 0 } },
  people: { teachers: 0, staff: 0 },
  attendance: { working: true, holiday: null, students: { present: 0, late: 0, absent: 0, leave: 0, percent: null, classesTaken: 0, classesTotal: 0 }, teachers: { total: 0, present: 0, late: 0, absent: 0 } },
  admissions: months.map((month) => ({ month, count: 0 })),
  attention: [],
  upcoming: [],
  period: {
    from: TODAY,
    to: TODAY,
    previous: { from: "2026-11-09", to: "2026-11-09" },
    students: { admitted: 0, admittedBefore: 0 },
    attendance: { present: 0, late: 0, absent: 0, leave: 0, percent: null, before: { absent: 0, percent: null } },
    teachers: { present: 0, late: 0, absent: 0, percent: null, before: { percent: null } },
    leaves: { asked: 0, askedBefore: 0 },
    absentClasses: [],
  },
});

function openDashboard(answer: Dashboard | Response | (() => Promise<unknown>) | ((query: URLSearchParams) => unknown) = dashboard(), role = "school_admin", chart: SchoolTrend | ((query: URLSearchParams) => unknown) = trend()) {
  store.dispatch(
    sessionStarted({
      user: { id: "u1", name: "Anuj", email: "a@school.example", username: null, role, roleLabel: null, tenantId: "t1", emailVerifiedAt: null },
      tenant: { id: "t1", name: "Ganesha Public School", approvalStatus: "approved", isActive: true },
    } as never)
  );
  store.dispatch(authChecked());
  const calls = fakeApi({
    "GET /dashboard/school": typeof answer === "function" ? (_body, query) => (answer as (q: URLSearchParams) => unknown)(query) : () => answer,
    "GET /dashboard/school/trend": typeof chart === "function" ? (_body, query) => chart(query) : () => chart,
    "GET /academics/academic-years/current": () => ({ year: { id: "y1", name: "2026-2027", startDate: "2026-04-01", endDate: "2027-03-31", status: "active", activatedAt: null }, needsSetUp: false }),
  });
  const router = createMemoryRouter([{ path: "/dashboard", element: <SchoolDashboard /> }], { initialEntries: ["/dashboard"] });
  render(
    <Provider store={store}>
      <ToastProvider>
        <RouterProvider router={router} />
      </ToastProvider>
    </Provider>
  );
  return calls;
}

// A figure of the top row: its own group, named by what it counts.
const tile = (name: string) => screen.getByRole("group", { name });
// The figures come with the numbers, so a test waits for one before it looks at it.
const tileWhenThere = (name: string) => screen.findByRole("group", { name });
const days = (calls: Call[]) => asked(calls, "/dashboard/school").map((c) => new URLSearchParams(c.query).get("from") + " to " + new URLSearchParams(c.query).get("to"));
// A card appears when the numbers have come.
const card = (name: string) => screen.findByRole("region", { name });
const asked = (calls: Call[], path: string) => calls.filter((c) => c.path === path);

beforeEach(() => {
  // 11:00 in India on Tuesday 10 Nov 2026. Only the clock and the page's once-a-minute tick are faked: requests and waiting run as they are.
  vi.useFakeTimers({ toFake: ["Date", "setInterval", "clearInterval"] });
  vi.setSystemTime(new Date("2026-11-10T05:30:00Z"));
});

afterEach(() => {
  vi.useRealTimers();
  cleanup();
  for (const api of allApiSlices) store.dispatch(api.util.resetApiState());
  store.dispatch(signedOut());
  vi.unstubAllGlobals();
});

describe("the top of the page", () => {
  it("greets the person like Medisetu does, names the school, and says which session it is", async () => {
    openDashboard();
    expect(await screen.findByRole("heading", { level: 1, name: /Hello Anuj/ })).toBeInTheDocument();
    expect(screen.getByText("Here's what's happening at Ganesha Public School today.")).toBeInTheDocument();
    expect(await screen.findByText("2026-2027")).toBeInTheDocument();
  });

  it("has no blue band and no shortcuts any more: the figures start right under the greeting", async () => {
    openDashboard();
    await within(await tileWhenThere("Students")).findByText("120");
    expect(screen.queryByRole("link", { name: "Add a student" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Send a notice" })).not.toBeInTheDocument();
    expect(screen.queryByText("Approved and live")).not.toBeInTheDocument();
  });

  it("offers Today, This Week, This Month and Custom, and opens on Today", async () => {
    openDashboard();
    const filter = await screen.findByRole("group", { name: "Days" });
    expect(within(filter).getByRole("button", { name: "Today, 10 Nov" })).toHaveAttribute("aria-pressed", "true");
    for (const name of ["This Week", "This Month", "Custom"]) expect(within(filter).getByRole("button", { name })).toHaveAttribute("aria-pressed", "false");
  });
});

describe("the days to look at", () => {
  it("opens on today and asks for today only: ONE request", async () => {
    const calls = openDashboard();
    await within(await tileWhenThere("Students")).findByText("120");
    expect(days(calls)).toEqual([`${TODAY} to ${TODAY}`]);
  });

  it("This Week asks Monday to Sunday and says so under the greeting; This Month asks the whole month", async () => {
    const calls = openDashboard();
    await within(await tileWhenThere("Students")).findByText("120");
    fireEvent.click(screen.getByRole("button", { name: "This Week" }));
    await waitFor(() => expect(days(calls).at(-1)).toBe("2026-11-09 to 2026-11-15"));
    expect(await screen.findByText("School performance · 9 Nov – 15 Nov")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "This Month" }));
    await waitFor(() => expect(days(calls).at(-1)).toBe("2026-11-01 to 2026-11-30"));
    expect(await screen.findByText("School performance · 1 Nov – 30 Nov")).toBeInTheDocument();
  });

  it("the arrows step a day at a time: Yesterday, then back to Today", async () => {
    const calls = openDashboard();
    await within(await tileWhenThere("Students")).findByText("120");
    fireEvent.click(screen.getByRole("button", { name: "Previous day" }));
    await waitFor(() => expect(days(calls).at(-1)).toBe("2026-11-09 to 2026-11-09"));
    expect(await screen.findByRole("button", { name: "Yesterday, 9 Nov" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Next day" }));
    await waitFor(() => expect(days(calls).at(-1)).toBe(`${TODAY} to ${TODAY}`));
    expect(await screen.findByRole("button", { name: "Today, 10 Nov" })).toBeInTheDocument();
  });

  /** Types a day into a date box of the Custom window: day, month and year, the cursor moving on by itself. */
  const typeDay = async (user: ReturnType<typeof userEvent.setup>, name: string, ddmmyyyy: string) => {
    const box = within(await screen.findByRole("dialog", { name: "Choose the days" })).getByRole("group", { name });
    await user.click(within(box).getAllByRole("spinbutton")[0]);
    await user.keyboard(ddmmyyyy);
  };

  it("Custom takes any days: the page asks for them when they are applied, and the tab says them", async () => {
    const user = userEvent.setup();
    const calls = openDashboard();
    await within(await tileWhenThere("Students")).findByText("120");
    await user.click(screen.getByRole("button", { name: "Custom" }));
    await typeDay(user, "From", "01102026");
    await typeDay(user, "To", "31102026");
    await user.click(within(screen.getByRole("dialog", { name: "Choose the days" })).getByRole("button", { name: "Apply" }));
    await waitFor(() => expect(days(calls).at(-1)).toBe("2026-10-01 to 2026-10-31"));
    expect(await screen.findByRole("button", { name: "1 Oct – 31 Oct" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByRole("dialog", { name: "Choose the days" })).not.toBeInTheDocument();
  });

  it("Cancel on Custom leaves everything as it was and asks for nothing new", async () => {
    const user = userEvent.setup();
    const calls = openDashboard();
    await within(await tileWhenThere("Students")).findByText("120");
    await user.click(screen.getByRole("button", { name: "This Week" }));
    await waitFor(() => expect(days(calls)).toHaveLength(2));
    await user.click(screen.getByRole("button", { name: "Custom" }));
    await user.click(within(await screen.findByRole("dialog", { name: "Choose the days" })).getByRole("button", { name: "Cancel" }));
    expect(screen.getByRole("button", { name: "This Week" })).toHaveAttribute("aria-pressed", "true");
    expect(days(calls)).toHaveLength(2);
  });

  it("Apply waits for two whole days in order", async () => {
    const user = userEvent.setup();
    openDashboard();
    await within(await tileWhenThere("Students")).findByText("120");
    await user.click(screen.getByRole("button", { name: "Custom" }));
    await typeDay(user, "From", "31102026");
    await typeDay(user, "To", "01102026");
    expect(within(screen.getByRole("dialog", { name: "Choose the days" })).getByRole("button", { name: "Apply" })).toBeDisabled();
  });
});

describe("the five figures", () => {
  it("shows the students that are in the school, not the estimate from sign-up, and how many were admitted against the days before", async () => {
    openDashboard();
    const students = await tileWhenThere("Students");
    expect(await within(students).findByText("120")).toBeInTheDocument();
    expect(screen.queryByText(SIGNED_UP_WITH.toLocaleString("en-IN"))).not.toBeInTheDocument();
    expect(within(students).getByText("↑ 3 admitted")).toBeInTheDocument();
    expect(within(students).getByText("vs 1 yesterday")).toBeInTheDocument();
  });

  it("shows teachers and staff together, and says how many of each", async () => {
    openDashboard();
    expect(await within(await tileWhenThere("Teachers and Staff")).findByText("11")).toBeInTheDocument();
    expect(within(tile("Teachers and Staff")).getByText("8 teachers · 3 staff")).toBeInTheDocument();
  });

  it("one teacher and no staff is written in the singular", async () => {
    openDashboard(dashboard({ people: { teachers: 1, staff: 0 } }));
    await within(await tileWhenThere("Teachers and Staff")).findByText("1");
    expect(within(tile("Teachers and Staff")).getByText("1 teacher · 0 staff")).toBeInTheDocument();
  });

  it("the children's attendance is the share that came in the days, up by points on the days before", async () => {
    openDashboard();
    const attendance = await tileWhenThere("Attendance");
    expect(await within(attendance).findByText("81%")).toBeInTheDocument();
    expect(within(attendance).getByText("↑ +6%")).toBeInTheDocument();
    expect(within(attendance).getByText("vs yesterday")).toBeInTheDocument();
  });

  it("absent is how many marks, and MORE absent is the bad direction (red)", async () => {
    openDashboard();
    const absent = await tileWhenThere("Absent");
    expect(await within(absent).findByText("20")).toBeInTheDocument();
    const change = within(absent).getByText("↑ +100%");
    expect(change.className).toContain("text-danger");
  });

  it("leave requests are how many fall on the days, against the days before", async () => {
    openDashboard();
    const leaves = await tileWhenThere("Leave Requests");
    expect(await within(leaves).findByText("4")).toBeInTheDocument();
    expect(within(leaves).getByText("↑ +100%")).toBeInTheDocument();
  });

  it("each comparison says what it is against: the tab decides the words", async () => {
    openDashboard();
    await within(await tileWhenThere("Students")).findByText("120");
    fireEvent.click(screen.getByRole("button", { name: "This Week" }));
    expect(await within(await tileWhenThere("Attendance")).findByText("vs last week")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "This Month" }));
    expect(await within(await tileWhenThere("Attendance")).findByText("vs last month")).toBeInTheDocument();
  });

  it("says a dash, not 0%, when nothing was marked, and shows no change it cannot know", async () => {
    openDashboard(NEW_SCHOOL);
    const attendance = await tileWhenThere("Attendance");
    expect(await within(attendance).findByText("–")).toBeInTheDocument();
    expect(within(attendance).queryByText("0%")).not.toBeInTheDocument();
    expect(within(attendance).queryByText(/vs yesterday/)).not.toBeInTheDocument();
    expect(within(tile("Students")).getByText("0")).toBeInTheDocument();
  });

  it("a figure with nothing before it says New", async () => {
    openDashboard(dashboard({ period: { ...dashboard().period, leaves: { asked: 3, askedBefore: 0 } } }));
    expect(await within(await tileWhenThere("Leave Requests")).findByText("New")).toBeInTheDocument();
  });

  it("leads to the pages for the people who run the school; an accountant's figures are plain", async () => {
    openDashboard();
    await within(await tileWhenThere("Students")).findByText("120");
    expect(tile("Students").closest("a")).toHaveAttribute("href", "/school/students");
    expect(tile("Teachers and Staff").closest("a")).toHaveAttribute("href", "/teachers");
    expect(tile("Attendance").closest("a")).toHaveAttribute("href", "/attendance/students");
    expect(tile("Leave Requests").closest("a")).toHaveAttribute("href", "/leaves");
    cleanup();
    openDashboard(dashboard(), "accountant");
    await within(await tileWhenThere("Students")).findByText("120");
    expect(tile("Students").closest("a")).toBeNull();
    expect(tile("Leave Requests").closest("a")).toHaveAttribute("href", "/leaves");
  });
});

describe("one request, and nothing made up", () => {
  it("asks for the numbers once, the chart once, and for nothing the old page read (the student seats, the classes, the school's profile)", async () => {
    const calls = openDashboard();
    await within(await tileWhenThere("Students")).findByText("120");
    await screen.findByRole("region", { name: "Attendance Overview" });
    expect(asked(calls, "/dashboard/school")).toHaveLength(1);
    await waitFor(() => expect(asked(calls, "/dashboard/school/trend")).toHaveLength(1));
    for (const path of ["/students/capacity", "/academics/structure", "/onboarding"]) expect(asked(calls, path)).toHaveLength(0);
  });

  it("shows no sample charts, no 'Coming soon' tiles and no roadmap", async () => {
    openDashboard();
    await within(await tileWhenThere("Students")).findByText("120");
    expect(screen.queryByText(/coming soon/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/sample/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/roadmap/i)).not.toBeInTheDocument();
  });

  it("shows no 0 while the numbers are still coming", async () => {
    openDashboard(() => new Promise(() => {}));
    expect(await screen.findByText("Loading the dashboard")).toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "Students" })).not.toBeInTheDocument();
  });

  it("says when it could not be read, and tries again on Retry", async () => {
    let tries = 0;
    openDashboard(() => {
      tries += 1;
      return tries === 1 ? Promise.resolve(new Response(JSON.stringify({ success: false, message: "Server error" }), { status: 500, headers: { "Content-Type": "application/json" } })) : Promise.resolve(dashboard());
    });
    expect(await screen.findByText("Could not load the dashboard")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await within(await tileWhenThere("Students")).findByText("120")).toBeInTheDocument();
    expect(tries).toBe(2);
  });

  it("keeps the last figures on screen while other days are being read", async () => {
    let tries = 0;
    openDashboard(() => {
      tries += 1;
      return tries === 1 ? dashboard() : new Promise(() => {});
    });
    await within(await tileWhenThere("Students")).findByText("120");
    fireEvent.click(screen.getByRole("button", { name: "This Week" }));
    expect(screen.queryByText("Loading the dashboard")).not.toBeInTheDocument();
    expect(within(tile("Students")).getByText("120")).toBeInTheDocument();
  });
});

describe("the school right now (the line under the figures)", () => {
  const strip = () => screen.findByRole("region", { name: "School right now" });

  it("says Open now with how long school has left, how much of the day has gone, and what is happening today", async () => {
    openDashboard();
    const now = await strip();
    expect(within(now).getByText("Open now")).toBeInTheDocument();
    expect(within(now).getByText("08:30 – 14:20")).toBeInTheDocument();
    expect(within(now).getByText("3h 20m left")).toBeInTheDocument();
    expect(within(now).getByRole("progressbar", { name: "School day" })).toHaveAttribute("aria-valuenow", "43");
    const items = within(now).getAllByRole("term").map((t) => [t.textContent, t.nextElementSibling?.textContent]);
    expect(items).toEqual([
      ["Attendance taken", "2 of 3 classes"],
      ["Teachers in school", "6 of 8"],
      ["Children absent today", "20"],
      ["Leaves waiting", "2"],
    ]);
  });

  it("is only about today: it is not there for any other days", async () => {
    openDashboard();
    await strip();
    fireEvent.click(screen.getByRole("button", { name: "This Week" }));
    await waitFor(() => expect(screen.queryByRole("region", { name: "School right now" })).not.toBeInTheDocument());
  });

  it("on a holiday says Holiday and why, with no hours and no bar", async () => {
    openDashboard(dashboard({ attendance: { ...dashboard().attendance, working: false, holiday: "Diwali" }, day: { working: false, holiday: "Diwali", start: null, end: null } }));
    const now = await strip();
    expect(within(now).getByText("Holiday")).toBeInTheDocument();
    expect(within(now).getByText("Diwali")).toBeInTheDocument();
    expect(within(now).queryByRole("progressbar")).not.toBeInTheDocument();
  });

  it("a day without school says so", async () => {
    openDashboard(dashboard({ attendance: { ...dashboard().attendance, working: false }, day: { working: false, holiday: null, start: null, end: null } }));
    expect(within(await strip()).getByText("No school today")).toBeInTheDocument();
  });

  it("after school: Closed now, and when it closed; before it: Not open yet", async () => {
    vi.setSystemTime(new Date("2026-11-10T10:30:00Z")); // 16:00 in India
    openDashboard();
    expect(within(await strip()).getByText("Closed at 14:20")).toBeInTheDocument();
    cleanup();
    vi.setSystemTime(new Date("2026-11-10T01:30:00Z")); // 07:00 in India
    openDashboard();
    expect(within(await strip()).getByText("Opens 08:30")).toBeInTheDocument();
  });

  it("moves on by itself, a minute at a time", async () => {
    openDashboard();
    expect(within(await strip()).getByText("3h 20m left")).toBeInTheDocument();
    act(() => {
      // Moving the timers on a minute moves the clock a minute too: start one minute short of 11:10.
      vi.setSystemTime(new Date("2026-11-10T05:39:00Z"));
      vi.advanceTimersByTime(60_000);
    });
    expect(within(screen.getByRole("region", { name: "School right now" })).getByText("3h 10m left")).toBeInTheDocument();
  });
});

describe("Attendance Overview (the chart)", () => {
  it("has the share for the week, against the week before, and a point for each day it has marks; a day with none has no point", async () => {
    openDashboard();
    const chart = await card("Attendance Overview");
    // The big number first; the same share is also in the table for a screen reader.
    expect((await within(chart).findAllByText("81%"))[0].className).toContain("text-metric-headline");
    expect(within(chart).getByText("↑ +3%")).toBeInTheDocument();
    expect(within(chart).getByText("vs last week")).toBeInTheDocument();
    const table = within(chart).getByRole("table", { name: "Attendance by day" });
    expect(within(table).getAllByRole("row")).toHaveLength(8);
    expect(within(table).getByRole("row", { name: /Mon.*82%/ })).toBeInTheDocument();
    expect(within(table).getByRole("row", { name: /Wed.*No marks/ })).toBeInTheDocument();
  });

  it("is the week to start with; choosing This Month asks the server for the month, once more", async () => {
    const user = userEvent.setup();
    const calls = openDashboard(dashboard(), "school_admin", (query) => trend({ period: query.get("period") as "week" | "month", from: "2026-11-01", to: "2026-11-30", percent: 77, before: 80, points: [{ date: "2026-11-10", percent: 77 }] }));
    const chart = await card("Attendance Overview");
    await within(chart).findAllByText("77%");
    expect(asked(calls, "/dashboard/school/trend").map((c) => c.query)).toEqual(["?period=week"]);
    await user.click(within(chart).getByRole("button", { name: /Attendance chart period/ }));
    await user.click(await screen.findByRole("option", { name: "This Month" }));
    await waitFor(() => expect(asked(calls, "/dashboard/school/trend").map((c) => c.query)).toEqual(["?period=week", "?period=month"]));
  });

  it("is its own choice: the days above do not change it", async () => {
    const calls = openDashboard();
    await card("Attendance Overview");
    await waitFor(() => expect(asked(calls, "/dashboard/school/trend")).toHaveLength(1));
    fireEvent.click(screen.getByRole("button", { name: "This Month" }));
    await waitFor(() => expect(days(calls).at(-1)).toBe("2026-11-01 to 2026-11-30"));
    expect(asked(calls, "/dashboard/school/trend")).toHaveLength(1);
  });

  it("says nothing was marked in the period, with no empty chart", async () => {
    openDashboard(NEW_SCHOOL, "school_admin", trend({ points: trend().points.map((p) => ({ ...p, percent: null })), percent: null, before: null }));
    const chart = await card("Attendance Overview");
    expect(await within(chart).findByText("No attendance marked yet")).toBeInTheDocument();
    expect(within(chart).queryByRole("table")).not.toBeInTheDocument();
  });
});

describe("Attendance Status (the donut)", () => {
  it("shows the children by present, late, absent and leave in the days picked, each with its number and share", async () => {
    openDashboard();
    const chart = await card("Attendance Status");
    for (const [label, count, pct] of [["Present", "90", "78%"], ["Late", "4", "3%"], ["Absent", "20", "17%"], ["Leave", "2", "2%"]]) {
      const row = (await within(chart).findByText(label)).closest("li")!;
      expect(within(row).getByText(count)).toBeInTheDocument();
      expect(within(row).getByText(pct)).toBeInTheDocument();
    }
    expect(within(chart).getByText("116")).toBeInTheDocument();
    expect(within(chart).getByRole("link", { name: /View/ })).toHaveAttribute("href", "/attendance/students");
  });

  it("says how the teachers did against the days before", async () => {
    openDashboard();
    const chart = await card("Attendance Status");
    expect(await within(chart).findByText("Teachers in school")).toBeInTheDocument();
    expect(within(chart).getByText("86%")).toBeInTheDocument();
    expect(within(chart).getByText("↑ +6%")).toBeInTheDocument();
  });

  it("says nothing was marked in the days, and draws no donut", async () => {
    openDashboard(NEW_SCHOOL);
    const chart = await card("Attendance Status");
    expect(await within(chart).findByText("No attendance marked in this period")).toBeInTheDocument();
    expect(within(chart).queryByRole("img")).not.toBeInTheDocument();
  });
});

describe("Classes with most absences", () => {
  it("has a bar for each class that had absences, the most first, with the number beside it", async () => {
    openDashboard();
    const list = await card("Classes with most absences");
    const table = await within(list).findByRole("table", { name: "Absences by class" });
    expect(within(table).getAllByRole("row").map((r) => r.textContent)).toEqual(expect.arrayContaining([expect.stringMatching(/Class 2.*12/), expect.stringMatching(/Class 1.*8/)]));
  });

  it("says no class had an absence in the days, not an empty chart", async () => {
    openDashboard(NEW_SCHOOL);
    expect(await within(await card("Classes with most absences")).findByText("No absences in this period")).toBeInTheDocument();
  });
});

describe("what needs attention", () => {
  it("counts the things waiting in the top row, and lists each in words with where to go", async () => {
    openDashboard();
    const list = (await card("Needs your attention"));
    expect(await within(list).findByText("3")).toBeInTheDocument();
    expect(within(list).getByRole("link", { name: /1 teacher is absent today/ })).toHaveAttribute("href", "/attendance/teachers");
    expect(within(list).getByRole("link", { name: /1 class has not taken today's attendance/ })).toHaveAttribute("href", "/attendance/students");
    expect(within(list).getByRole("link", { name: /2 leave requests are waiting for an answer/ })).toHaveAttribute("href", "/leaves");
  });

  it("lists the most urgent first, as the server sent them", async () => {
    openDashboard();
    const list = (await card("Needs your attention"));
    await within(list).findByText(/absent today/);
    const rows = within(list).getAllByRole("listitem").map((li) => li.textContent ?? "");
    expect(rows[0]).toMatch(/absent today/);
    expect(rows[2]).toMatch(/leave requests/);
  });

  it("says all is clear when nothing is waiting", async () => {
    openDashboard(dashboard({ attention: [] }));
    expect(await within((await card("Needs your attention"))).findByText("Nothing needs your attention right now")).toBeInTheDocument();
  });

  it("a school with no students and no teachers is asked to add them first", async () => {
    openDashboard(NEW_SCHOOL);
    const list = (await card("Needs your attention"));
    expect(await within(list).findByRole("link", { name: /Add your first student/ })).toHaveAttribute("href", "/school/students/new");
    expect(within(list).getByRole("link", { name: /Add your teachers/ })).toHaveAttribute("href", "/teachers");
    expect(within(list).queryByText("Nothing needs your attention right now")).not.toBeInTheDocument();
  });

  it("an accountant sees what is waiting, but only the leaves lead anywhere", async () => {
    openDashboard(dashboard(), "accountant");
    const list = (await card("Needs your attention"));
    expect(await within(list).findByRole("link", { name: /2 leave requests/ })).toHaveAttribute("href", "/leaves");
    expect(within(list).queryByRole("link", { name: /absent today/ })).not.toBeInTheDocument();
    expect(within(list).getByText("1 teacher is absent today")).toBeInTheDocument();
  });
});

describe("students by class", () => {
  it("has a bar for each class that has students, with the number beside it", async () => {
    openDashboard();
    const chart = (await card("Students by class"));
    // The name of the class is beside its bar, and again in the table for a screen reader.
    expect(await within(chart).findAllByText("Class 2")).toHaveLength(2);
    const table = within(chart).getByRole("table", { name: "Students by class" });
    expect(within(table).getByRole("row", { name: /Class 1.*50/ })).toBeInTheDocument();
    expect(within(table).getByRole("row", { name: /Class 2.*70/ })).toBeInTheDocument();
  });

  it("tells each bar's share in its tooltip, and how many classes the school has", async () => {
    openDashboard();
    const chart = (await card("Students by class"));
    expect(await within(chart).findByText("Class 2: 70 students (58%)")).toBeInTheDocument();
    expect(within(chart).getByText("3 classes")).toBeInTheDocument();
  });

  it("splits the students into boys, girls and others", async () => {
    openDashboard();
    const chart = (await card("Students by class"));
    expect(await within(chart).findByText("Boys 70")).toBeInTheDocument();
    expect(within(chart).getByText("Girls 48")).toBeInTheDocument();
    expect(within(chart).getByText("Other 2")).toBeInTheDocument();
  });

  it("leaves 'Other' out when there is none", async () => {
    openDashboard(dashboard({ students: { ...dashboard().students, gender: { male: 70, female: 50, other: 0 } } }));
    await within((await card("Students by class"))).findByText("Boys 70");
    expect(within((await card("Students by class"))).queryByText(/^Other/)).not.toBeInTheDocument();
  });

  it("a school without students says there is nothing to draw yet, not an empty chart", async () => {
    openDashboard(NEW_SCHOOL);
    expect(await within((await card("Students by class"))).findByText("No students added yet")).toBeInTheDocument();
    expect(within((await card("Students by class"))).getByText("22 classes")).toBeInTheDocument();
    expect(within((await card("Students by class"))).queryByRole("table")).not.toBeInTheDocument();
  });
});

describe("admissions", () => {
  it("has a column for each of the last six months, with its number in the tooltip", async () => {
    openDashboard();
    const chart = (await card("Admissions"));
    expect(await within(chart).findByText("September 2026: 9 admissions")).toBeInTheDocument();
    expect(within(chart).getByText("November 2026: 2 admissions")).toBeInTheDocument();
    const table = within(chart).getByRole("table", { name: "Admissions by month" });
    expect(within(table).getAllByRole("row")).toHaveLength(7);
  });

  it("one admission is written in the singular", async () => {
    openDashboard(dashboard({ admissions: months.map((month, i) => ({ month, count: i === 5 ? 1 : 0 })) }));
    expect(await within((await card("Admissions"))).findByText("November 2026: 1 admission")).toBeInTheDocument();
  });

  it("says so when nobody was admitted in six months, with no empty chart", async () => {
    openDashboard(NEW_SCHOOL);
    expect(await within((await card("Admissions"))).findByText("No admissions in the last 6 months")).toBeInTheDocument();
    expect(within((await card("Admissions"))).queryByRole("table")).not.toBeInTheDocument();
  });
});

describe("coming up", () => {
  it("lists the next days with their dates and what each is", async () => {
    openDashboard();
    const list = (await card("Coming up"));
    expect(await within(list).findByText("Sports Day")).toBeInTheDocument();
    expect(within(list).getByText("12 Nov")).toBeInTheDocument();
    expect(within(list).getByText("20 to 27 Nov")).toBeInTheDocument();
    expect(within(list).getByText("Event")).toBeInTheDocument();
    expect(within(list).getByText("Holiday")).toBeInTheDocument();
    expect(within(list).getByText("Exam")).toBeInTheDocument();
    expect(within(list).getByRole("link", { name: /Open calendar/ })).toHaveAttribute("href", "/calendar");
  });

  it("says when there is nothing in the next days", async () => {
    openDashboard(NEW_SCHOOL);
    expect(await within((await card("Coming up"))).findByText("Nothing is planned in the next 30 days")).toBeInTheDocument();
  });
});
