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
import { addDays } from "../../../utils/calendar";
import { todayInIndia } from "../../../utils/students";
import type { StaffLeave } from "../../../types";
import MyLeavePage from "../MyLeavePage";

/**
 * My leave (2026-11-24, user: "teacher login karega to waha leave daalne ka option rahe"): a teacher or a staff member applies for leave from their own
 * login and sees the school's answer; a waiting leave, or an approved one that has not begun, can be taken back.
 */
const TODAY = todayInIndia();

const leave = (id: string, over: Partial<StaffLeave> = {}): StaffLeave => ({
  id,
  kind: "teacher",
  personId: "t1",
  name: "Meena Singh",
  roleLabel: "Teacher",
  fromDate: addDays(TODAY, 3),
  toDate: addDays(TODAY, 4),
  days: 2,
  reason: "Sister's wedding",
  status: "pending",
  note: null,
  decidedBy: null,
  decidedAt: null,
  createdAt: "2026-11-09T10:00:00.000Z",
  canCancel: true,
  ...over,
});

const WAITING = leave("l1");
const DECLINED = leave("l2", { status: "declined", reason: "Trip", note: "Exams that week", decidedBy: { name: "Asha Verma", role: "school_admin" }, canCancel: false });
const APPROVED = leave("l3", { status: "approved", reason: "Fever", decidedBy: { name: "Asha Verma", role: "school_admin" }, canCancel: true });

function openPage(items: StaffLeave[] = [WAITING, DECLINED, APPROVED], extra: Record<string, Handler> = {}) {
  store.dispatch(
    sessionStarted({
      user: { id: "u1", name: "Meena Singh", email: null, username: "meena", role: "teacher", tenantId: "t1", emailVerifiedAt: null },
      tenant: { id: "t1", name: "Sunrise Public School", approvalStatus: "approved", isActive: true },
    } as never)
  );
  const calls = fakeApi({
    "GET /attendance/leaves/mine": () => ({ items }),
    "POST /attendance/leaves/mine": (body) => leave("new", { ...(body as object), toDate: (body as { toDate?: string }).toDate ?? TODAY, days: 1 }),
    "POST /attendance/leaves/mine/l1/cancel": () => ({ ...WAITING, status: "cancelled", canCancel: false }),
    ...extra,
  });
  const router = createMemoryRouter([{ path: "/my-leave", element: <MyLeavePage /> }], { initialEntries: ["/my-leave"] });
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
  store.dispatch(signedOut());
  vi.unstubAllGlobals();
});

const posts = (calls: Call[], path: string) => calls.filter((c) => c.method === "POST" && c.path === path);

describe("My leave: a teacher or a staff member asks the school for leave", () => {
  it("lists each application with its days, reason and answer; the school's note and who answered are there", async () => {
    openPage();
    expect(await screen.findByRole("heading", { name: "My leave" })).toBeInTheDocument();
    const list = await screen.findByRole("list", { name: "My leave" });
    const items = within(list).getAllByRole("listitem");
    expect(items).toHaveLength(3);
    expect(within(items[0]).getByText("Waiting")).toBeInTheDocument();
    expect(within(items[1]).getByText("Declined")).toBeInTheDocument();
    expect(within(items[1]).getByText("Declined by Asha Verma: Exams that week")).toBeInTheDocument();
    expect(within(items[2]).getByText("Approved by Asha Verma")).toBeInTheDocument();
  });

  it("says so when there is no leave yet", async () => {
    openPage([]);
    expect(await screen.findByText("No leave yet")).toBeInTheDocument();
  });

  it("Apply for leave sends the days and the reason (the last day is the first when left empty), then says it is sent", async () => {
    const { calls, user } = openPage([]);
    await user.click(await screen.findByRole("button", { name: "Apply for leave" }));
    await user.type(await screen.findByLabelText(/Reason/), "Fever");
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Send" }));
    expect(await screen.findByText("Leave sent")).toBeInTheDocument();
    expect(posts(calls, "/attendance/leaves/mine")[0].body).toEqual({ fromDate: TODAY, toDate: TODAY, reason: "Fever" });
  });

  it("asks for a reason before sending", async () => {
    const { calls, user } = openPage([]);
    await user.click(await screen.findByRole("button", { name: "Apply for leave" }));
    await user.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Send" }));
    expect(await screen.findByText("Write why you will not come")).toBeInTheDocument();
    expect(posts(calls, "/attendance/leaves/mine")).toHaveLength(0);
  });

  it("says why the server refused (days that overlap an earlier leave), in the window", async () => {
    const refuse = () =>
      new Response(JSON.stringify({ success: false, message: "You already have a leave for 12 Nov to 13 Nov.", code: "LEAVE_OVERLAP" }), { status: 409, headers: { "Content-Type": "application/json" } });
    const { user } = openPage([], { "POST /attendance/leaves/mine": refuse });
    await user.click(await screen.findByRole("button", { name: "Apply for leave" }));
    await user.type(await screen.findByLabelText(/Reason/), "Fever");
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Send" }));
    expect(await screen.findByText("You already have a leave for 12 Nov to 13 Nov.")).toBeInTheDocument();
  });

  it("only a leave that can be taken back has the button (waiting, or approved and not begun); it asks first", async () => {
    const { calls, user } = openPage();
    const list = await screen.findByRole("list", { name: "My leave" });
    const items = within(list).getAllByRole("listitem");
    expect(within(items[1]).queryByRole("button", { name: "Take back" })).not.toBeInTheDocument();
    expect(within(items[2]).getByRole("button", { name: "Take back" })).toBeInTheDocument();
    await user.click(within(items[0]).getByRole("button", { name: "Take back" }));
    expect(posts(calls, "/attendance/leaves/mine/l1/cancel")).toHaveLength(0);
    await user.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Take back" }));
    expect(await screen.findByText("Leave taken back")).toBeInTheDocument();
    await waitFor(() => expect(posts(calls, "/attendance/leaves/mine/l1/cancel")).toHaveLength(1));
  });
});
