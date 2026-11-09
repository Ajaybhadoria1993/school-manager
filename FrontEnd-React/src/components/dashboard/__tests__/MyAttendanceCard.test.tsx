import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Provider } from "react-redux";
import { ToastProvider } from "../../ui/toast-context";
import { allApiSlices } from "../../../redux/api/apiRoot";
import store from "../../../redux/store";
import { fakeApi, type Call, type Handler } from "../../../test/fakeApi";
import type { MyDay } from "../../../types";
import { MyAttendanceCard } from "../MyAttendanceCard";

/**
 * A teacher marks themselves present on their home (2026-11-06): the card says what today is for them, and one button marks it. The time
 * is kept by the server; every action ends in a window that says what happened.
 */

const DAY = "2026-11-05";
const base: MyDay = { date: DAY, status: "pending", checkedInTime: null, lateByMinutes: null, log: [], school: { start: "08:30", end: "14:20" }, canCheckIn: true, why: null };
const marked = (time: string, late: number): MyDay => ({
  ...base,
  status: late > 0 ? "late" : "present",
  checkedInTime: time,
  lateByMinutes: late,
  canCheckIn: false,
  log: [{ time, at: `${DAY}T00:00:00.000Z`, action: "checked_in", by: { name: "Meena Singh", role: "teacher" }, note: null }],
});

function show(extra: Record<string, Handler> = {}) {
  const calls = fakeApi({ "GET /attendance/teachers/me": () => base, ...extra });
  render(
    <Provider store={store}>
      <ToastProvider>
        <MyAttendanceCard />
      </ToastProvider>
    </Provider>
  );
  return { calls, user: userEvent.setup() };
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  for (const slice of allApiSlices) store.dispatch(slice.util.resetApiState());
});

const reads = (calls: Call[]) => calls.filter((c) => c.method === "GET" && c.path === "/attendance/teachers/me").length;
const posts = (calls: Call[]) => calls.filter((c) => c.method === "POST" && c.path === "/attendance/teachers/me/present");
const refusal = (message: string, code: string, status = 409) => () => new Response(JSON.stringify({ success: false, message, code }), { status, headers: { "Content-Type": "application/json" } });

describe("a teacher who has not marked yet", () => {
  it("sees the day, that it is not marked, the school's hours, and one button; one read", async () => {
    const { calls } = show();
    const card = await screen.findByRole("region", { name: "My attendance" });
    await waitFor(() => expect(card).toHaveTextContent("Thu, 5 Nov"));
    expect(card).toHaveTextContent("Not marked yet");
    expect(card).toHaveTextContent("School 8:30 AM to 2:20 PM");
    expect(within(card).getByRole("button", { name: "I am present" })).toBeEnabled();
    expect(reads(calls)).toBe(1);
  });

  it("one tap marks them present: a window says the time, and the card shows Present with it", async () => {
    let state: MyDay = base;
    const { calls, user } = show({
      "GET /attendance/teachers/me": () => state,
      "POST /attendance/teachers/me/present": () => {
        state = marked("08:10", 0);
        return { ...state, alreadyMarked: false };
      },
    });
    await user.click(await screen.findByRole("button", { name: "I am present" }));
    const done = await screen.findByRole("dialog", { name: "You are marked present" });
    expect(done).toHaveTextContent("8:10 AM");
    expect(posts(calls)).toHaveLength(1);
    await user.click(within(done).getByRole("button", { name: "OK" }));
    const card = await screen.findByRole("region", { name: "My attendance" });
    await waitFor(() => expect(card).toHaveTextContent("Present"));
    expect(card).toHaveTextContent("8:10 AM");
    expect(within(card).queryByRole("button", { name: "I am present" })).not.toBeInTheDocument();
    expect(reads(calls)).toBe(2); // the one on opening and the one after the mark: nothing else
  });

  it("after school started the window and the card say how late", async () => {
    let state: MyDay = base;
    const { user } = show({
      "GET /attendance/teachers/me": () => state,
      "POST /attendance/teachers/me/present": () => {
        state = marked("09:00", 30);
        return { ...state, alreadyMarked: false };
      },
    });
    await user.click(await screen.findByRole("button", { name: "I am present" }));
    const done = await screen.findByRole("dialog", { name: "You are marked present" });
    expect(done).toHaveTextContent("9:00 AM");
    expect(done).toHaveTextContent("Late by 30 min");
    await user.click(within(done).getByRole("button", { name: "OK" }));
    await waitFor(() => expect(screen.getByRole("region", { name: "My attendance" })).toHaveTextContent("Late by 30 min"));
  });

  it("a tap on a day already marked (another tab) says so, with the first time", async () => {
    const { user } = show({ "POST /attendance/teachers/me/present": () => ({ ...marked("08:10", 0), alreadyMarked: true }) });
    await user.click(await screen.findByRole("button", { name: "I am present" }));
    const done = await screen.findByRole("dialog", { name: "You are already marked present" });
    expect(done).toHaveTextContent("8:10 AM");
  });

  it("when the server refuses (school time is over) a window says why, and nothing is marked", async () => {
    const { user } = show({ "POST /attendance/teachers/me/present": refusal("School time is over for today: you are marked absent.", "SCHOOL_TIME_OVER") });
    await user.click(await screen.findByRole("button", { name: "I am present" }));
    const failed = await screen.findByRole("dialog", { name: "Could not mark you present" });
    expect(failed).toHaveTextContent("School time is over for today");
  });

  it("the button works once while the mark is on its way: a double tap is one request", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const { calls, user } = show({
      "POST /attendance/teachers/me/present": async () => {
        await gate;
        return { ...marked("08:10", 0), alreadyMarked: false };
      },
    });
    const button = await screen.findByRole("button", { name: "I am present" });
    await user.click(button);
    await user.click(button); // a second tap while the first is still on its way
    release();
    await screen.findByRole("dialog", { name: "You are marked present" });
    expect(posts(calls)).toHaveLength(1);
  });
});

describe("the other days a teacher can have", () => {
  it("already present: the time, no button", async () => {
    show({ "GET /attendance/teachers/me": () => marked("08:10", 0) });
    const card = await screen.findByRole("region", { name: "My attendance" });
    await waitFor(() => expect(card).toHaveTextContent("Present"));
    expect(card).toHaveTextContent("8:10 AM");
    expect(card).toHaveTextContent("On time");
    expect(within(card).queryByRole("button", { name: "I am present" })).not.toBeInTheDocument();
  });

  it("late: the time and how late", async () => {
    show({ "GET /attendance/teachers/me": () => marked("09:15", 45) });
    const card = await screen.findByRole("region", { name: "My attendance" });
    await waitFor(() => expect(card).toHaveTextContent("Late"));
    expect(card).toHaveTextContent("9:15 AM");
    expect(card).toHaveTextContent("Late by 45 min");
  });

  it("a holiday, a day off, and a school day that has ended without a mark: each says so, with no button", async () => {
    show({ "GET /attendance/teachers/me": () => ({ ...base, status: "holiday", canCheckIn: false, why: "Holiday: Diwali" }) });
    expect(await screen.findByText("Holiday: Diwali")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "I am present" })).not.toBeInTheDocument();
    cleanup();
    for (const slice of allApiSlices) store.dispatch(slice.util.resetApiState());

    show({ "GET /attendance/teachers/me": () => ({ ...base, status: "off", canCheckIn: false, why: "Not a working day" }) });
    expect(await screen.findByText("Not a working day")).toBeInTheDocument();
    cleanup();
    for (const slice of allApiSlices) store.dispatch(slice.util.resetApiState());

    show({ "GET /attendance/teachers/me": () => ({ ...base, status: "absent", canCheckIn: false, why: "School time is over" }) });
    const card = await screen.findByRole("region", { name: "My attendance" });
    await waitFor(() => expect(card).toHaveTextContent("Absent"));
    expect(card).toHaveTextContent("School time is over");
    expect(within(card).queryByRole("button", { name: "I am present" })).not.toBeInTheDocument();
  });

  it("says what the server said when the day cannot be read; a login that is not a teacher's has no card", async () => {
    show({ "GET /attendance/teachers/me": refusal("This login is not a teacher's", "FORBIDDEN", 403) });
    expect(await screen.findByText("This login is not a teacher's")).toBeInTheDocument();
  });
});

describe("my own days (2026-11-06)", () => {
  const MONTH = {
    month: "2026-11",
    from: "2026-11-01",
    to: DAY,
    days: [],
    row: {
      id: "t1",
      name: "Meena Singh",
      employeeCode: null,
      designation: null,
      records: [
        { date: "2026-11-02", status: "present", checkedInTime: "08:00", lateByMinutes: 0, log: [{ time: "08:00", at: "2026-11-02T02:30:00.000Z", action: "checked_in", by: { name: "Meena Singh", role: "teacher" }, note: null }], note: null, source: "self" },
        { date: "2026-11-03", status: "late", checkedInTime: "09:30", lateByMinutes: 60, log: [], note: null, source: "self" },
        { date: "2026-11-04", status: "absent", checkedInTime: null, lateByMinutes: null, log: [], note: null, source: null },
      ],
      tally: { present: 1, late: 1, absent: 1, leave: 0, days: 3, percent: 67 },
    },
  };

  it("a button opens my month: each day that counts with what it was and the time; the month is asked for only then", async () => {
    const { calls, user } = show({ "GET /attendance/teachers/me/month": () => MONTH });
    await screen.findByRole("button", { name: "I am present" });
    expect(calls.filter((c) => c.path === "/attendance/teachers/me/month")).toHaveLength(0);
    await user.click(screen.getByRole("button", { name: "My days" }));
    const dialog = await screen.findByRole("dialog", { name: "My attendance" });
    expect(dialog).toHaveTextContent("1 present · 1 late · 1 absent");
    const items = within(await within(dialog).findByRole("list", { name: "Days" })).getAllByRole("listitem");
    expect(items[0]).toHaveTextContent("2 Nov");
    expect(items[0]).toHaveTextContent("8:00 AM");
    expect(items[0]).toHaveTextContent("Marked present at 8:00 AM by Meena Singh");
    expect(items[1]).toHaveTextContent("Late");
    expect(items[1]).toHaveTextContent("Late by 1 h");
    expect(items[2]).toHaveTextContent("Absent");
    expect(within(dialog).queryByRole("button", { name: /^Change/ })).not.toBeInTheDocument();
    expect(calls.filter((c) => c.path === "/attendance/teachers/me/month")).toHaveLength(1);
  });

  it("says what the server said when the month cannot be read", async () => {
    const { user } = show({ "GET /attendance/teachers/me/month": refusal("Choose a month", "VALIDATION_ERROR", 400) });
    await user.click(await screen.findByRole("button", { name: "My days" }));
    expect(await screen.findByText("Choose a month")).toBeInTheDocument();
  });

  it("a day the school put on Leave says why they cannot mark, with the note", async () => {
    show({ "GET /attendance/teachers/me": () => ({ ...base, status: "leave", canCheckIn: false, why: "On leave: Fever" }) });
    const card = await screen.findByRole("region", { name: "My attendance" });
    await waitFor(() => expect(card).toHaveTextContent("Leave"));
    expect(card).toHaveTextContent("On leave: Fever");
    expect(within(card).queryByRole("button", { name: "I am present" })).not.toBeInTheDocument();
  });
});
