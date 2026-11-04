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
import type { CalendarEvent, UserRole } from "../../../types";
import CalendarPage from "../CalendarPage";

/** The school's calendar (docs/parent-teacher-flow.md, phase 1): holidays and events; the school adds them, everyone sees them. */

const DIWALI: CalendarEvent = { id: "e1", title: "Diwali", kind: "holiday", startDate: "2026-11-08", endDate: "2026-11-10", note: "School closed" };
const FUNCTION: CalendarEvent = { id: "e2", title: "Annual function", kind: "event", startDate: "2026-12-20", endDate: "2026-12-20", note: null };

function openPage(role: UserRole = "school_admin", extra: Record<string, Handler> = {}) {
  store.dispatch(
    sessionStarted({
      user: { id: "u1", name: "Asha Verma", email: "admin@sunrise.example", username: null, role, tenantId: "t1", emailVerifiedAt: null },
      tenant: { id: "t1", name: "Sunrise Public School", approvalStatus: "approved", isActive: true },
    } as never)
  );
  const calls = fakeApi({
    "GET /classroom/calendar": () => ({ items: [DIWALI, FUNCTION] }),
    "POST /classroom/calendar": (body) => ({ id: "e9", note: null, ...(body as object), endDate: (body as { endDate?: string; startDate: string }).endDate ?? (body as { startDate: string }).startDate }),
    "PATCH /classroom/calendar/e1": (body) => ({ ...DIWALI, ...(body as object) }),
    "DELETE /classroom/calendar/e1": () => ({ id: "e1" }),
    ...extra,
  });
  const router = createMemoryRouter([{ path: "/calendar", element: <CalendarPage /> }], { initialEntries: ["/calendar"] });
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

describe("the school's calendar", () => {
  it("lists the holidays and events month by month, each saying its days and what it is", async () => {
    openPage();
    expect(await screen.findByRole("heading", { name: "Calendar", level: 1 })).toBeInTheDocument();
    const nov = await screen.findByRole("region", { name: "November 2026" });
    expect(within(nov).getByText("Diwali")).toBeInTheDocument();
    expect(nov).toHaveTextContent("8 Nov to 10 Nov");
    expect(nov).toHaveTextContent("Holiday");
    expect(nov).toHaveTextContent("School closed");
    expect(screen.getByRole("region", { name: "December 2026" })).toHaveTextContent("Annual function");
  });

  it("the school adds one in a window, and a window says it is done", async () => {
    const { calls, user } = openPage();
    await user.click(await screen.findByRole("button", { name: "Add holiday or event" }));
    const dialog = await screen.findByRole("dialog", { name: "Add holiday or event" });
    await user.type(within(dialog).getByLabelText(/^Name/), "Sports day");
    await user.click(within(dialog).getByRole("radio", { name: "Event" }));
    await user.click(within(dialog).getByRole("button", { name: "Tomorrow" }));
    await user.click(within(dialog).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(writes(calls)).toHaveLength(1));
    expect(writes(calls)[0]).toMatchObject({ method: "POST", path: "/classroom/calendar", body: { title: "Sports day", kind: "event" } });
    const done = await screen.findByRole("dialog", { name: "Added to the calendar" });
    expect(done).toHaveTextContent("Sports day");
    await user.click(within(done).getByRole("button", { name: "OK" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("asks for a name before saving, and sends nothing without one", async () => {
    const { calls, user } = openPage();
    await user.click(await screen.findByRole("button", { name: "Add holiday or event" }));
    const dialog = await screen.findByRole("dialog", { name: "Add holiday or event" });
    await user.click(within(dialog).getByRole("button", { name: "Save" }));
    expect(await within(dialog).findByText("Enter the name")).toBeInTheDocument();
    expect(writes(calls)).toHaveLength(0);
  });

  it("changes one from its pencil and takes one away after asking, each with a window that says so", async () => {
    const { calls, user } = openPage();
    await user.click(await screen.findByRole("button", { name: "Change Diwali" }));
    const dialog = await screen.findByRole("dialog", { name: "Change Diwali" });
    const name = within(dialog).getByLabelText(/^Name/);
    await user.clear(name);
    await user.type(name, "Diwali break");
    await user.click(within(dialog).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(writes(calls)).toHaveLength(1));
    expect(writes(calls)[0]).toMatchObject({ method: "PATCH", path: "/classroom/calendar/e1", body: { title: "Diwali break" } });
    await user.click(within(await screen.findByRole("dialog", { name: "Saved" })).getByRole("button", { name: "OK" }));

    await user.click(screen.getByRole("button", { name: "Remove Diwali" }));
    const ask = await screen.findByRole("dialog", { name: "Remove Diwali?" });
    await user.click(within(ask).getByRole("button", { name: "Remove" }));
    await waitFor(() => expect(writes(calls)).toHaveLength(2));
    expect(writes(calls)[1]).toMatchObject({ method: "DELETE", path: "/classroom/calendar/e1" });
    expect(await screen.findByRole("dialog", { name: "Taken off the calendar" })).toBeInTheDocument();
  });

  it("teachers and parents see it, without the buttons that change it", async () => {
    for (const role of ["teacher", "parent"] as const) {
      openPage(role);
      expect(await screen.findByText("Diwali")).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Add holiday or event" })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Change Diwali" })).not.toBeInTheDocument();
      cleanup();
      for (const api of allApiSlices) store.dispatch(api.util.resetApiState());
    }
  });

  it("says so when nothing is on the calendar yet", async () => {
    openPage("parent", { "GET /classroom/calendar": () => ({ items: [] }) });
    expect(await screen.findByText("Nothing on the calendar yet")).toBeInTheDocument();
  });
});
