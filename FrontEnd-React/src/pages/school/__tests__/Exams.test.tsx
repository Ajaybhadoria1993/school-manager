import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Provider } from "react-redux";
import { RouterProvider, createMemoryRouter } from "react-router";
import { ToastProvider } from "../../../components/ui/toast-context";
import { allApiSlices } from "../../../redux/api/apiRoot";
import store from "../../../redux/store";
import { sessionStarted, signedOut } from "../../../redux/slices/authSlice";
import { fakeApi, type Call, type Handler } from "../../../test/fakeApi";
import type { Exam } from "../../../types";
import ExamsPage from "../Exams";

/**
 * Test & Exam (Manage school): the year's exams and tests, found by whether they have come, each one's page for its timetable, and
 * "Schedule exam" for a new one. "Today" is Friday 6 Nov 2026.
 */

const exam = (over: Partial<Exam>): Exam => ({
  id: "e1",
  name: "Half-Yearly Exam",
  type: "half_yearly",
  typeLabel: "Half-yearly exam",
  full: true,
  startDate: "2026-09-15",
  endDate: "2026-09-26",
  schoolHours: { start: "08:00", end: "12:30" },
  note: null,
  status: "over",
  paperCount: 12,
  classCount: 8,
  ...over,
});
const RUNNING = exam({ id: "e3", name: "Unit Test 2", type: "unit_test", typeLabel: "Unit test", full: false, startDate: "2026-11-05", endDate: "2026-11-09", schoolHours: null, status: "running", paperCount: 5, classCount: 1 });
const MONTHLY = exam({ id: "e2", name: "Monthly Test - November", type: "monthly_test", typeLabel: "Monthly test", full: false, startDate: "2026-11-30", endDate: "2026-11-30", schoolHours: null, status: "upcoming", paperCount: 0, classCount: 0 });
const HALF = exam({});

function openPage(items: Exam[] = [RUNNING, MONTHLY, HALF], extra: Record<string, Handler> = {}) {
  store.dispatch(sessionStarted({ user: { id: "u1", name: "Anuj", email: "a@school.example", username: null, role: "school_admin", tenantId: "t1", emailVerifiedAt: null }, tenant: null }));
  const calls = fakeApi({
    "GET /exams": () => ({ items }),
    "POST /exams": (body) => exam({ id: "e9", paperCount: 0, classCount: 0, status: "upcoming", ...(body as object), typeLabel: "Half-yearly exam" } as Partial<Exam>),
    ...extra,
  });
  const router = createMemoryRouter([{ path: "/school/exams", element: <ExamsPage /> }, { path: "/school/exams/:id", element: <p>The page of an exam</p> }], { initialEntries: ["/school/exams"] });
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

const writes = (calls: Call[]) => calls.filter((c) => c.method !== "GET");

describe("the year's exams", () => {
  it("lists each exam with what it is, its days, whether it has come, how many papers and classes, and the school hours of a full exam", async () => {
    openPage();
    expect(await screen.findByRole("heading", { name: "Test & Exam", level: 1 })).toBeInTheDocument();
    const cards = await screen.findAllByRole("link", { name: /Exam|Test/ });
    expect(cards.map((c) => within(c).getByRole("heading").textContent)).toEqual(["Unit Test 2", "Monthly Test - November", "Half-Yearly Exam"]);

    const half = screen.getByRole("link", { name: /Half-Yearly Exam/ });
    expect(half).toHaveTextContent("Half-yearly exam");
    expect(half).toHaveTextContent("15 Sep to 26 Sep 2026");
    expect(half).toHaveTextContent("Over");
    expect(half).toHaveTextContent("12 papers");
    expect(half).toHaveTextContent("8 classes");
    expect(half).toHaveTextContent("School 8:00 AM to 12:30 PM");
    expect(half).toHaveAttribute("href", "/school/exams/e1");

    expect(screen.getByRole("link", { name: /Unit Test 2/ })).toHaveTextContent("Running");
    expect(screen.getByRole("link", { name: /Unit Test 2/ })).toHaveTextContent("1 class");
    expect(screen.getByRole("link", { name: /Unit Test 2/ })).not.toHaveTextContent("School ");
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
    expect(calls.filter((c) => c.method === "GET")).toHaveLength(1);
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
  it("a kind is one click, offers its usual name, and a full exam asks for the school's hours; saving opens the new exam's page", async () => {
    const { calls, router, user } = openPage();
    await user.click(await screen.findByRole("button", { name: "Schedule exam" }));
    const dialog = await screen.findByRole("dialog", { name: "Schedule exam" });
    await user.click(within(dialog).getByRole("radio", { name: "Half-yearly exam" }));
    expect(within(dialog).getByLabelText(/^Name/)).toHaveValue("Half-Yearly Exam");
    await user.click(within(dialog).getByRole("button", { name: "Today" }));
    fireEvent.change(within(dialog).getByLabelText("School starts"), { target: { value: "08:00" } });
    fireEvent.change(within(dialog).getByLabelText("School ends"), { target: { value: "12:30" } });
    await user.click(within(dialog).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(writes(calls)).toHaveLength(1));
    expect(writes(calls)[0]).toMatchObject({
      method: "POST",
      path: "/exams",
      body: { name: "Half-Yearly Exam", type: "half_yearly", startDate: "2026-11-06", endDate: "2026-11-06", schoolStart: "08:00", schoolEnd: "12:30", note: null },
    });
    await waitFor(() => expect(router.state.location.pathname).toBe("/school/exams/e9"));
  });

  it("a test has no school hours (the day goes on as usual), and changing the kind changes the offered name but not one the school typed", async () => {
    const { calls, user } = openPage();
    await user.click(await screen.findByRole("button", { name: "Schedule exam" }));
    const dialog = await screen.findByRole("dialog", { name: "Schedule exam" });
    await user.click(within(dialog).getByRole("radio", { name: "Half-yearly exam" }));
    expect(within(dialog).getByLabelText("School starts")).toBeInTheDocument();
    await user.click(within(dialog).getByRole("radio", { name: "Monthly test" }));
    expect(within(dialog).getByLabelText(/^Name/)).toHaveValue("Monthly Test");
    expect(within(dialog).queryByLabelText("School starts")).not.toBeInTheDocument();
    const name = within(dialog).getByLabelText(/^Name/);
    await user.clear(name);
    await user.type(name, "Monthly Test - December");
    await user.click(within(dialog).getByRole("radio", { name: "Class test" }));
    expect(name).toHaveValue("Monthly Test - December");
    await user.click(within(dialog).getByRole("button", { name: "Tomorrow" }));
    await user.click(within(dialog).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(writes(calls)).toHaveLength(1));
    expect(writes(calls)[0].body).toMatchObject({ name: "Monthly Test - December", type: "class_test", startDate: "2026-11-07", schoolStart: null, schoolEnd: null });
  });

  it("asks for what is missing and sends nothing: the kind, a name, the first day, and both school times or neither", async () => {
    const { calls, user } = openPage();
    await user.click(await screen.findByRole("button", { name: "Schedule exam" }));
    const dialog = await screen.findByRole("dialog", { name: "Schedule exam" });
    await user.click(within(dialog).getByRole("button", { name: "Save" }));
    expect(await within(dialog).findByText("Choose what it is")).toBeInTheDocument();
    await user.click(within(dialog).getByRole("radio", { name: "Annual exam" }));
    await user.clear(within(dialog).getByLabelText(/^Name/));
    fireEvent.change(within(dialog).getByLabelText("School starts"), { target: { value: "08:00" } });
    await user.click(within(dialog).getByRole("button", { name: "Save" }));
    expect(await within(dialog).findByText("Enter the exam name")).toBeInTheDocument();
    expect(within(dialog).getByText("Choose the first day")).toBeInTheDocument();
    expect(within(dialog).getByText("Give the time the school starts and the time it ends")).toBeInTheDocument();
    expect(writes(calls)).toHaveLength(0);
  });

  it("says in words what the server refused, and stays open", async () => {
    const { user } = openPage(undefined, {
      "POST /exams": () => new Response(JSON.stringify({ success: false, message: "There is already an exam called Half-Yearly Exam this year", code: "EXAM_EXISTS" }), { status: 409, headers: { "Content-Type": "application/json" } }),
    });
    await user.click(await screen.findByRole("button", { name: "Schedule exam" }));
    const dialog = await screen.findByRole("dialog", { name: "Schedule exam" });
    await user.click(within(dialog).getByRole("radio", { name: "Class test" }));
    await user.click(within(dialog).getByRole("button", { name: "Today" }));
    await user.click(within(dialog).getByRole("button", { name: "Save" }));
    expect(await within(dialog).findByText("There is already an exam called Half-Yearly Exam this year")).toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "Schedule exam" })).toBeInTheDocument();
  });
});
