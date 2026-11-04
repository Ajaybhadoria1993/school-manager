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
import type { Leave } from "../../../types";
import LeavesPage from "../LeavesPage";

/** The leave requests (docs/parent-teacher-flow.md, phase 2): a class teacher's classes', or every one for the school; one click answers. */

const FEVER: Leave = {
  id: "l1",
  student: { id: "s1", name: "Asha Verma", admissionNumber: "ADM-2026-0001" },
  label: "Class 5 - A",
  fromDate: "2026-11-12",
  toDate: "2026-11-13",
  days: 2,
  reason: "Fever",
  appliedBy: "Ravi Verma (Father)",
  status: "pending",
  note: null,
  decidedBy: null,
  decidedAt: null,
  createdAt: "2026-11-04T08:00:00.000Z",
};
const OLD: Leave = { ...FEVER, id: "l2", reason: "Wedding", status: "approved", decidedBy: { name: "Meena Singh", role: "teacher" }, decidedAt: "2026-11-01T08:00:00.000Z" };

function openPage(extra: Record<string, Handler> = {}) {
  store.dispatch(
    sessionStarted({
      user: { id: "u1", name: "Meena Singh", email: null, username: "meena", role: "teacher", tenantId: "t1", emailVerifiedAt: null },
      tenant: { id: "t1", name: "Sunrise Public School", approvalStatus: "approved", isActive: true },
    } as never)
  );
  const calls = fakeApi({
    "GET /classroom/leaves": (_body, query) => ({ items: query.get("status") === "pending" ? [FEVER] : [FEVER, OLD] }),
    "POST /classroom/leaves/l1/decide": (body) => ({ ...FEVER, ...(body as object), decidedBy: { name: "Meena Singh", role: "teacher" } }),
    ...extra,
  });
  const router = createMemoryRouter([{ path: "/leaves", element: <LeavesPage /> }], { initialEntries: ["/leaves"] });
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

const writes = (calls: Call[]) => calls.filter((c) => c.method !== "GET");

describe("the leave requests", () => {
  it("shows the waiting ones first: the child, the class, the days, the reason and who sent it", async () => {
    const { calls } = openPage();
    expect(await screen.findByRole("heading", { name: "Leave requests", level: 1 })).toBeInTheDocument();
    const card = await screen.findByRole("article", { name: "Asha Verma" });
    expect(card).toHaveTextContent("Class 5 - A");
    expect(card).toHaveTextContent("12 Nov to 13 Nov · 2 days");
    expect(card).toHaveTextContent("Fever");
    expect(card).toHaveTextContent("Ravi Verma (Father)");
    expect(calls.find((c) => c.path === "/classroom/leaves")?.query).toBe("?status=pending");
  });

  it("Approve answers it in one click, and a window says so", async () => {
    const { calls, user } = openPage();
    await user.click(within(await screen.findByRole("article", { name: "Asha Verma" })).getByRole("button", { name: "Approve" }));
    await waitFor(() => expect(writes(calls)).toHaveLength(1));
    expect(writes(calls)[0]).toMatchObject({ method: "POST", path: "/classroom/leaves/l1/decide", body: { status: "approved" } });
    expect(await screen.findByRole("dialog", { name: "Leave approved" })).toHaveTextContent("Asha Verma");
  });

  it("Decline asks for a note (it may stay empty), then answers it, and a window says so", async () => {
    const { calls, user } = openPage();
    await user.click(within(await screen.findByRole("article", { name: "Asha Verma" })).getByRole("button", { name: "Decline" }));
    const ask = await screen.findByRole("dialog", { name: "Decline the leave of Asha Verma?" });
    await user.type(within(ask).getByLabelText(/^Note to the parent/), "Exams that day");
    await user.click(within(ask).getByRole("button", { name: "Decline" }));
    await waitFor(() => expect(writes(calls)).toHaveLength(1));
    expect(writes(calls)[0].body).toEqual({ status: "declined", note: "Exams that day" });
    expect(await screen.findByRole("dialog", { name: "Leave declined" })).toBeInTheDocument();
  });

  it("All shows the answered ones too, with who answered", async () => {
    const { user } = openPage();
    await screen.findByRole("article", { name: "Asha Verma" });
    await user.click(screen.getByRole("tab", { name: "All" }));
    await waitFor(() => expect(screen.getAllByRole("article")).toHaveLength(2));
    expect(screen.getByText("Wedding").closest("article")).toHaveTextContent("Approved by Meena Singh");
  });

  it("says so when no leave waits", async () => {
    openPage({ "GET /classroom/leaves": () => ({ items: [] }) });
    expect(await screen.findByText("No leave is waiting")).toBeInTheDocument();
  });
});
