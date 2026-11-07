import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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

/**
 * The school's calendar (docs/parent-teacher-flow.md, phase 1): a month as a grid of days (or the whole year), the holidays and events on
 * it as bars; the school clicks a day to add one or to change what is on it, everyone else only reads. "Today" is Thursday 5 Nov 2026.
 */

const DIWALI: CalendarEvent = { id: "e1", title: "Diwali", kind: "holiday", startDate: "2026-11-08", endDate: "2026-11-10", note: "School closed", source: "school" };
const FUNCTION: CalendarEvent = { id: "e2", title: "Annual function", kind: "event", startDate: "2026-12-20", endDate: "2026-12-20", note: null, source: "school" };
// The standard holidays every calendar starts with: a festival the school may take off, a national day that stays.
const GURU: CalendarEvent = { id: "2026-11-24-guru-nanak-jayanti", title: "Guru Nanak Jayanti", kind: "holiday", startDate: "2026-11-24", endDate: "2026-11-24", note: null, source: "festival" };
const GANDHI: CalendarEvent = { id: "2026-10-02-gandhi-jayanti", title: "Gandhi Jayanti", kind: "holiday", startDate: "2026-10-02", endDate: "2026-10-02", note: null, source: "national" };

function openPage(role: UserRole = "school_admin", extra: Record<string, Handler> = {}) {
  store.dispatch(
    sessionStarted({
      user: { id: "u1", name: "Asha Verma", email: "admin@sunrise.example", username: null, role, tenantId: "t1", emailVerifiedAt: null },
      tenant: { id: "t1", name: "Sunrise Public School", approvalStatus: "approved", isActive: true },
    } as never)
  );
  const calls = fakeApi({
    "GET /classroom/calendar": () => ({ items: [DIWALI, FUNCTION], hidden: [] }),
    "POST /classroom/calendar": (body) => ({ id: "e9", note: null, source: "school", ...(body as object), endDate: (body as { endDate?: string; startDate: string }).endDate ?? (body as { startDate: string }).startDate }),
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

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-05T06:00:00.000Z"));
});

afterEach(() => {
  cleanup();
  for (const api of allApiSlices) store.dispatch(api.util.resetApiState());
  store.dispatch(signedOut());
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

const writes = (calls: Call[]) => calls.filter((c) => c.method !== "GET");
const reads = (calls: Call[]) => calls.filter((c) => c.method === "GET");
const day = (text: RegExp) => screen.findByRole("button", { name: text });

describe("the month", () => {
  it("is a grid of its days, Sunday first, with today marked and the holiday as one bar over its days", async () => {
    openPage();
    expect(await screen.findByRole("heading", { name: "Calendar", level: 1 })).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: "November 2026", level: 2 })).toBeInTheDocument();
    const week = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    for (const name of week) expect(screen.getByText(name)).toBeInTheDocument();

    expect(await day(/^5 November 2026/)).toHaveAttribute("aria-current", "date");
    expect(screen.getByRole("button", { name: /^6 November 2026/ })).not.toHaveAttribute("aria-current");

    const first = screen.getByRole("button", { name: /^8 November 2026/ });
    expect(first).toHaveAccessibleName(/Diwali/);
    expect(within(first).getByText("Diwali")).toBeInTheDocument();
    // The name is written once, on the day it starts; the next days only carry the bar.
    expect(within(screen.getByRole("button", { name: /^9 November 2026/ })).queryByText("Diwali")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^9 November 2026/ })).toHaveAccessibleName(/Diwali/);
    expect(screen.getByRole("button", { name: /^11 November 2026/ })).toHaveAccessibleName("11 November 2026");
  });

  it("reads the whole year once, so moving between its months asks for nothing; the next year is read when it is reached", async () => {
    const { calls, user } = openPage();
    await screen.findByRole("heading", { name: "November 2026", level: 2 });
    expect(reads(calls)).toHaveLength(1);
    expect(reads(calls)[0].query).toBe("?from=2025-12-25&to=2027-01-07");

    await user.click(screen.getByRole("button", { name: "Next month" }));
    expect(await screen.findByRole("heading", { name: "December 2026", level: 2 })).toBeInTheDocument();
    expect(within(screen.getByRole("button", { name: /^20 December 2026/ })).getByText("Annual function")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Previous month" }));
    await user.click(screen.getByRole("button", { name: "Previous month" }));
    expect(await screen.findByRole("heading", { name: "October 2026", level: 2 })).toBeInTheDocument();
    expect(reads(calls)).toHaveLength(1);

    await user.click(screen.getByRole("button", { name: "Today" }));
    expect(await screen.findByRole("heading", { name: "November 2026", level: 2 })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Next month" }));
    await user.click(screen.getByRole("button", { name: "Next month" }));
    expect(await screen.findByRole("heading", { name: "January 2027", level: 2 })).toBeInTheDocument();
    await waitFor(() => expect(reads(calls)).toHaveLength(2));
    expect(reads(calls)[1].query).toBe("?from=2026-12-25&to=2028-01-07");
  });

  it("counts the holidays and the events in it", async () => {
    const { user } = openPage();
    expect(await screen.findByText("1 Holiday")).toBeInTheDocument();
    expect(screen.getByText("0 Events")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Next month" }));
    expect(await screen.findByText("0 Holidays")).toBeInTheDocument();
    expect(screen.getByText("1 Event")).toBeInTheDocument();
  });

  it("lists what is in it beside the grid, and says so when nothing is", async () => {
    const { user } = openPage();
    const list = await screen.findByRole("region", { name: "Holidays and events" });
    expect(within(list).getByText("Diwali")).toBeInTheDocument();
    expect(list).toHaveTextContent("8 Nov to 10 Nov");
    expect(list).toHaveTextContent("School closed");
    expect(within(list).queryByText("Annual function")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Previous month" }));
    expect(await within(screen.getByRole("region", { name: "Holidays and events" })).findByText("Nothing this month")).toBeInTheDocument();
  });

  it("says why when the calendar could not be read", async () => {
    openPage("school_admin", { "GET /classroom/calendar": () => new Response(JSON.stringify({ success: false, message: "The calendar is busy" }), { status: 400, headers: { "Content-Type": "application/json" } }) });
    expect(await screen.findByText("The calendar is busy")).toBeInTheDocument();
  });
});

describe("the year", () => {
  it("shows its twelve months, each day with a holiday or an event marked, and the whole year's list at the side", async () => {
    const { user } = openPage();
    await screen.findByRole("heading", { name: "November 2026", level: 2 });
    await user.click(screen.getByRole("radio", { name: "Year" }));
    expect(await screen.findByRole("heading", { name: "2026", level: 2 })).toBeInTheDocument();
    for (const month of ["January", "June", "November", "December"]) expect(screen.getByRole("button", { name: `${month} 2026` })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^8 November 2026/ })).toHaveAccessibleName("8 November 2026: Diwali");
    expect(screen.getByRole("button", { name: /^20 December 2026/ })).toHaveAccessibleName("20 December 2026: Annual function");
    const list = screen.getByRole("region", { name: "Holidays and events" });
    expect(within(list).getByText("Diwali")).toBeInTheDocument();
    expect(within(list).getByText("Annual function")).toBeInTheDocument();
    expect(screen.getByText("1 Holiday")).toBeInTheDocument();
    expect(screen.getByText("1 Event")).toBeInTheDocument();
  });

  it("goes to the year before or after, and a month's name opens that month", async () => {
    const { calls, user } = openPage();
    await screen.findByRole("heading", { name: "November 2026", level: 2 });
    await user.click(screen.getByRole("radio", { name: "Year" }));
    await user.click(await screen.findByRole("button", { name: "Next year" }));
    expect(await screen.findByRole("heading", { name: "2027", level: 2 })).toBeInTheDocument();
    await waitFor(() => expect(reads(calls)).toHaveLength(2));
    expect(reads(calls)[1].query).toBe("?from=2026-12-25&to=2028-01-07");
    await user.click(screen.getByRole("button", { name: "Previous year" }));
    await user.click(await screen.findByRole("button", { name: "December 2026" }));
    expect(await screen.findByRole("heading", { name: "December 2026", level: 2 })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Month" })).toBeChecked();
    expect(within(screen.getByRole("button", { name: /^20 December 2026/ })).getByText("Annual function")).toBeInTheDocument();
  });
});

describe("a day", () => {
  it("the school clicks a day with nothing on it and adds a holiday or an event for that day", async () => {
    const { calls, user } = openPage();
    await user.click(await day(/^3 November 2026/));
    const dialog = await screen.findByRole("dialog", { name: "Add holiday or event" });
    await user.type(within(dialog).getByLabelText(/^Name/), "Sports day");
    await user.click(within(dialog).getByRole("radio", { name: "Event" }));
    await user.click(within(dialog).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(writes(calls)).toHaveLength(1));
    expect(writes(calls)[0]).toMatchObject({ method: "POST", path: "/classroom/calendar", body: { title: "Sports day", kind: "event", startDate: "2026-11-03", endDate: "2026-11-03" } });
    const done = await screen.findByRole("dialog", { name: "Added to the calendar" });
    expect(done).toHaveTextContent("Sports day");
    await user.click(within(done).getByRole("button", { name: "OK" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("the Add button at the top opens an empty window, with Today and Tomorrow in one click", async () => {
    const { calls, user } = openPage();
    await user.click(await screen.findByRole("button", { name: "Add holiday or event" }));
    const dialog = await screen.findByRole("dialog", { name: "Add holiday or event" });
    await user.type(within(dialog).getByLabelText(/^Name/), "Sports day");
    await user.click(within(dialog).getByRole("radio", { name: "Event" }));
    await user.click(within(dialog).getByRole("button", { name: "Tomorrow" }));
    await user.click(within(dialog).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(writes(calls)).toHaveLength(1));
    expect(writes(calls)[0]).toMatchObject({ method: "POST", body: { title: "Sports day", kind: "event", startDate: "2026-11-06" } });
  });

  it("asks for a name before saving, and sends nothing without one", async () => {
    const { calls, user } = openPage();
    await user.click(await day(/^3 November 2026/));
    const dialog = await screen.findByRole("dialog", { name: "Add holiday or event" });
    await user.click(within(dialog).getByRole("button", { name: "Save" }));
    expect(await within(dialog).findByText("Enter the name")).toBeInTheDocument();
    expect(writes(calls)).toHaveLength(0);
  });

  it("a day with something on it opens what is on it, and the school can add another for that day", async () => {
    const { calls, user } = openPage();
    await user.click(await day(/^9 November 2026/));
    const list = await screen.findByRole("dialog", { name: "Monday, 9 November 2026" });
    expect(list).toHaveTextContent("Diwali");
    expect(list).toHaveTextContent("Holiday");
    expect(list).toHaveTextContent("8 Nov to 10 Nov");
    expect(list).toHaveTextContent("School closed");
    await user.click(within(list).getByRole("button", { name: "Add holiday or event" }));
    const dialog = await screen.findByRole("dialog", { name: "Add holiday or event" });
    await user.type(within(dialog).getByLabelText(/^Name/), "Rangoli");
    await user.click(within(dialog).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(writes(calls)).toHaveLength(1));
    expect(writes(calls)[0]).toMatchObject({ method: "POST", body: { title: "Rangoli", kind: "holiday", startDate: "2026-11-09" } });
  });

  it("changes one from its pencil in that list and takes one away after asking, each with a window that says so", async () => {
    const { calls, user } = openPage();
    await user.click(await day(/^9 November 2026/));
    const list = await screen.findByRole("dialog", { name: "Monday, 9 November 2026" });
    await user.click(within(list).getByRole("button", { name: "Change Diwali" }));
    const dialog = await screen.findByRole("dialog", { name: "Change Diwali" });
    const name = within(dialog).getByLabelText(/^Name/);
    await user.clear(name);
    await user.type(name, "Diwali break");
    await user.click(within(dialog).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(writes(calls)).toHaveLength(1));
    expect(writes(calls)[0]).toMatchObject({ method: "PATCH", path: "/classroom/calendar/e1", body: { title: "Diwali break" } });
    await user.click(within(await screen.findByRole("dialog", { name: "Saved" })).getByRole("button", { name: "OK" }));

    await user.click(await day(/^9 November 2026/));
    const again = await screen.findByRole("dialog", { name: "Monday, 9 November 2026" });
    await user.click(within(again).getByRole("button", { name: "Remove Diwali" }));
    const ask = await screen.findByRole("dialog", { name: "Remove Diwali?" });
    await user.click(within(ask).getByRole("button", { name: "Remove" }));
    await waitFor(() => expect(writes(calls)).toHaveLength(2));
    expect(writes(calls)[1]).toMatchObject({ method: "DELETE", path: "/classroom/calendar/e1" });
    expect(await screen.findByRole("dialog", { name: "Taken off the calendar" })).toBeInTheDocument();
  });

  it("the list at the side has the same pencil and bin", async () => {
    const { calls, user } = openPage();
    const list = await screen.findByRole("region", { name: "Holidays and events" });
    await user.click(within(list).getByRole("button", { name: "Change Diwali" }));
    const dialog = await screen.findByRole("dialog", { name: "Change Diwali" });
    expect(within(dialog).getByLabelText(/^Name/)).toHaveValue("Diwali");
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    await user.click(within(screen.getByRole("region", { name: "Holidays and events" })).getByRole("button", { name: "Remove Diwali" }));
    expect(await screen.findByRole("dialog", { name: "Remove Diwali?" })).toBeInTheDocument();
    expect(writes(calls)).toHaveLength(0);
  });

  it("teachers and parents see the calendar and what is on a day, without the buttons that change it", async () => {
    for (const role of ["teacher", "parent"] as const) {
      const { user } = openPage(role);
      expect(await screen.findByRole("heading", { name: "November 2026", level: 2 })).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Add holiday or event" })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Change Diwali" })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Remove Diwali" })).not.toBeInTheDocument();

      await user.click(await day(/^9 November 2026/));
      const list = await screen.findByRole("dialog", { name: "Monday, 9 November 2026" });
      expect(list).toHaveTextContent("Diwali");
      expect(within(list).queryByRole("button", { name: /Change|Remove|Add holiday/ })).not.toBeInTheDocument();
      await user.click(within(list).getByRole("button", { name: "Close" }));
      await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

      await user.click(screen.getByRole("button", { name: /^3 November 2026/ }));
      expect(await screen.findByRole("dialog", { name: "Tuesday, 3 November 2026" })).toHaveTextContent("Nothing on this day");
      cleanup();
      for (const api of allApiSlices) store.dispatch(api.util.resetApiState());
    }
  });
});

describe("the standard holidays", () => {
  const withStandard = (hidden: CalendarEvent[] = [], items: CalendarEvent[] = [DIWALI, FUNCTION, GURU, GANDHI]) => ({
    "GET /classroom/calendar": () => ({ items, hidden }),
    "PUT /classroom/calendar/standard/2026-11-24-guru-nanak-jayanti": (body: unknown) => ({ key: GURU.id, title: GURU.title, shown: (body as { shown: boolean }).shown }),
  });

  it("are on the calendar like the school's own, and a national day says so and cannot be changed or taken off", async () => {
    const { user } = openPage("school_admin", withStandard());
    expect(await screen.findByText("2 Holidays")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Previous month" }));
    const list = await screen.findByRole("region", { name: "Holidays and events" });
    expect(await within(list).findByText("Gandhi Jayanti")).toBeInTheDocument();
    expect(list).toHaveTextContent("National holiday");
    expect(within(list).queryByRole("button", { name: /Gandhi Jayanti/ })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^2 October 2026/ })).toHaveAccessibleName("2 October 2026: Gandhi Jayanti");
  });

  it("a festival has no pencil, only a bin: the school asks, and it is off the school's calendar, with a window that says so", async () => {
    const { calls, user } = openPage("school_admin", withStandard());
    const list = await screen.findByRole("region", { name: "Holidays and events" });
    expect(within(list).getByText("Guru Nanak Jayanti")).toBeInTheDocument();
    expect(within(list).queryByRole("button", { name: "Change Guru Nanak Jayanti" })).not.toBeInTheDocument();
    await user.click(within(list).getByRole("button", { name: "Remove Guru Nanak Jayanti" }));
    const ask = await screen.findByRole("dialog", { name: "Remove Guru Nanak Jayanti?" });
    expect(ask).toHaveTextContent("It will not be a holiday for your school.");
    await user.click(within(ask).getByRole("button", { name: "Remove" }));
    await waitFor(() => expect(writes(calls)).toHaveLength(1));
    expect(writes(calls)[0]).toMatchObject({ method: "PUT", path: "/classroom/calendar/standard/2026-11-24-guru-nanak-jayanti", body: { shown: false } });
    const done = await screen.findByRole("dialog", { name: "Taken off the calendar" });
    expect(done).toHaveTextContent("Guru Nanak Jayanti");
  });

  it("a click on a day that has only a standard holiday opens that day, not the empty form", async () => {
    const { user } = openPage("school_admin", withStandard());
    await user.click(await day(/^24 November 2026/));
    const dialog = await screen.findByRole("dialog", { name: "Tuesday, 24 November 2026" });
    expect(dialog).toHaveTextContent("Guru Nanak Jayanti");
    expect(within(dialog).getByRole("button", { name: "Remove Guru Nanak Jayanti" })).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Add holiday or event" })).toBeInTheDocument();
  });

  it("what the school took off stays in the list where its day is, faded, and the arrow on it brings it back", async () => {
    const { calls, user } = openPage("school_admin", withStandard([GURU], [DIWALI, FUNCTION, GANDHI]));
    const list = await screen.findByRole("region", { name: "Holidays and events" });
    // It is not on the calendar any more (no bar, not counted), but the list keeps it, right after Diwali.
    expect(screen.getByRole("button", { name: /^24 November 2026/ })).toHaveAccessibleName("24 November 2026");
    expect(screen.getByText("1 Holiday")).toBeInTheDocument();
    const rows = within(list).getAllByRole("listitem");
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent("Diwali");
    expect(rows[1]).toHaveTextContent("Guru Nanak Jayanti");
    expect(rows[1]).toHaveTextContent("Taken off");
    expect(within(rows[1]).queryByRole("button", { name: /Remove|Change/ })).not.toBeInTheDocument();

    await user.click(within(rows[1]).getByRole("button", { name: "Bring back Guru Nanak Jayanti" }));
    await waitFor(() => expect(writes(calls)).toHaveLength(1));
    expect(writes(calls)[0]).toMatchObject({ method: "PUT", path: "/classroom/calendar/standard/2026-11-24-guru-nanak-jayanti", body: { shown: true } });
    expect(await screen.findByRole("dialog", { name: "Back on the calendar" })).toHaveTextContent("Guru Nanak Jayanti");
  });

  it("a month with only what was taken off in it is not said to be empty", async () => {
    openPage("school_admin", withStandard([GURU], []));
    const list = await screen.findByRole("region", { name: "Holidays and events" });
    expect(await within(list).findByText("Guru Nanak Jayanti")).toBeInTheDocument();
    expect(within(list).queryByText("Nothing this month")).not.toBeInTheDocument();
  });

  it("shows nothing taken off when nothing was, and never to a teacher or a parent", async () => {
    openPage("school_admin", withStandard());
    const list = await screen.findByRole("region", { name: "Holidays and events" });
    expect(await within(list).findByText("Guru Nanak Jayanti")).toBeInTheDocument();
    expect(within(list).queryByText("Taken off")).not.toBeInTheDocument();
    expect(within(list).queryByRole("button", { name: /Bring back/ })).not.toBeInTheDocument();
    cleanup();
    for (const api of allApiSlices) store.dispatch(api.util.resetApiState());

    openPage("teacher", withStandard([GURU], [DIWALI, FUNCTION, GANDHI]));
    const theirs = await screen.findByRole("region", { name: "Holidays and events" });
    expect(await within(theirs).findByText("Diwali")).toBeInTheDocument();
    expect(within(theirs).queryByText("Guru Nanak Jayanti")).not.toBeInTheDocument();
    expect(within(theirs).queryByRole("button", { name: /Bring back/ })).not.toBeInTheDocument();
  });

  it("teachers and parents see them without any button to change them", async () => {
    openPage("parent", withStandard());
    const list = await screen.findByRole("region", { name: "Holidays and events" });
    expect(await within(list).findByText("Guru Nanak Jayanti")).toBeInTheDocument();
    expect(within(list).queryByRole("button", { name: /Remove|Change/ })).not.toBeInTheDocument();
  });
});
