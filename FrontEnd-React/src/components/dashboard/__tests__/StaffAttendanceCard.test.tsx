import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Provider } from "react-redux";
import { MemoryRouter } from "react-router";
import { ToastProvider } from "../../ui/toast-context";
import { allApiSlices } from "../../../redux/api/apiRoot";
import store from "../../../redux/store";
import { fakeApi, type Call, type Handler } from "../../../test/fakeApi";
import { signInAs, signOut } from "../../../test/session";
import type { MyDay } from "../../../types";
import { MyAttendanceCard } from "../MyAttendanceCard";
import { StaffHome } from "../StaffHome";

/**
 * A staff member marks themselves present on their home (2026-11-22), like a teacher: the same card, the staff's own day and mark
 * (`/attendance/staff/me`), never the teacher's. A login that is not a staff member's shows no card.
 */

const DAY = "2026-11-05";
const base: MyDay = { date: DAY, status: "pending", checkedInTime: null, lateByMinutes: null, log: [], school: { start: "08:30", end: "14:20" }, canCheckIn: true, why: null };

function show(extra: Record<string, Handler> = {}, node = <MyAttendanceCard who="staff" />) {
  const calls = fakeApi({ "GET /attendance/staff/me": () => base, ...extra });
  render(
    <Provider store={store}>
      <ToastProvider>
        <MemoryRouter>{node}</MemoryRouter>
      </ToastProvider>
    </Provider>
  );
  return { calls, user: userEvent.setup() };
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  signOut();
  for (const slice of allApiSlices) store.dispatch(slice.util.resetApiState());
});

const asked = (calls: Call[], method: string, path: string) => calls.filter((c) => c.method === method && c.path === path);

describe("a staff member's own attendance", () => {
  it("reads the staff's own day (not the teacher's): not marked yet, the school's hours, one button", async () => {
    const { calls } = show();
    const card = await screen.findByRole("region", { name: "My attendance" });
    await waitFor(() => expect(card).toHaveTextContent("Not marked yet"));
    expect(card).toHaveTextContent("School 8:30 AM to 2:20 PM");
    expect(asked(calls, "GET", "/attendance/staff/me")).toHaveLength(1);
    expect(asked(calls, "GET", "/attendance/teachers/me")).toHaveLength(0);
  });

  it("I am present marks the staff member (their own address) and says at what time", async () => {
    const { calls, user } = show({
      "POST /attendance/staff/me/present": () => ({ ...base, status: "present", checkedInTime: "08:10", lateByMinutes: 0, canCheckIn: false, alreadyMarked: false }),
    });
    const card = await screen.findByRole("region", { name: "My attendance" });
    await user.click(await within(card).findByRole("button", { name: "I am present" }));
    expect(await screen.findByText("You are marked present")).toBeInTheDocument();
    expect(asked(calls, "POST", "/attendance/staff/me/present")).toHaveLength(1);
    expect(asked(calls, "POST", "/attendance/teachers/me/present")).toHaveLength(0);
  });

  it("a login that is not a staff member's shows no card at all", async () => {
    const { calls } = show({
      "GET /attendance/staff/me": () => new Response(JSON.stringify({ success: false, message: "This login is not a staff member's", code: "NOT_STAFF_MEMBER" }), { status: 403, headers: { "Content-Type": "application/json" } }),
    });
    await waitFor(() => expect(asked(calls, "GET", "/attendance/staff/me")).toHaveLength(1));
    await waitFor(() => expect(screen.queryByRole("region", { name: "My attendance" })).not.toBeInTheDocument());
    expect(screen.queryByText(/not a staff member/)).not.toBeInTheDocument();
  });

  it("is on the staff member's home", async () => {
    signInAs("receptionist", []);
    show({}, <StaffHome />);
    expect(await screen.findByRole("region", { name: "My attendance" })).toBeInTheDocument();
  });
});
