import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Provider } from "react-redux";
import { RouterProvider, createMemoryRouter } from "react-router";
import { ToastProvider } from "../../../components/ui/toast-context";
import { allApiSlices } from "../../../redux/api/apiRoot";
import store from "../../../redux/store";
import { sessionStarted, signedOut } from "../../../redux/slices/authSlice";
import type { AcademicYear, Promotion, PromotionStatus, UserRole } from "../../../types";
import { fakeApi, type Call, type Handler } from "../../../test/fakeApi";
import AcademicYearsPage from "../AcademicYears";

const year = (id: string, name: string, startDate: string, endDate: string, status: AcademicYear["status"]): AcademicYear => ({ id, name, startDate, endDate, status, activatedAt: status === "pending" ? null : "2026-04-01T00:00:00.000Z" });
const RUNNING = year("y2", "2026-2027", "2026-04-01", "2027-03-31", "active");
const NEXT = year("y3", "2027-2028", "2027-04-01", "2028-03-31", "pending");
const OLD = year("y1", "2025-2026", "2025-04-01", "2026-03-31", "closed");

const promotion = (status: PromotionStatus, total = 40): Promotion => ({
  id: "p1",
  status,
  fromYear: { id: "y2", name: "2026-2027" },
  toYear: { id: "y3", name: "2027-2028" },
  summary: { total, promote: total, retain: 0, leave: 0 },
  createdBy: { name: "Dev Patel", role: "principal" },
  createdAt: "2026-10-26T10:00:00.000Z",
  submitted: null,
  decision: null,
  appliedAt: null,
  entries: [],
  targets: [],
});

function openPage(years: AcademicYear[], role: UserRole = "school_admin", extra: Record<string, Handler> = {}) {
  store.dispatch(sessionStarted({ user: { id: "u1", name: "Meena Singh", email: "m@school.example", username: null, role, tenantId: "t1", emailVerifiedAt: null }, tenant: null }));
  const calls = fakeApi({ "GET /academics/academic-years": () => years, "GET /students/promotions": () => null, ...extra });
  const router = createMemoryRouter([{ path: "/school/academic-years", element: <AcademicYearsPage /> }, { path: "/school/promotion", element: <p>The promotion</p> }], {
    initialEntries: ["/school/academic-years"],
  });
  render(
    <Provider store={store}>
      <ToastProvider>
        <RouterProvider router={router} />
      </ToastProvider>
    </Provider>
  );
  return { calls, router, user: userEvent.setup() };
}

afterEach(() => {
  cleanup();
  store.dispatch(signedOut());
  for (const api of allApiSlices) store.dispatch(api.util.resetApiState());
  vi.unstubAllGlobals();
});

const posts = (calls: Call[], path: string) => calls.filter((c) => c.method === "POST" && c.path === path);

describe("Academic years: the running year and the next one", () => {
  it("shows the running year, and offers the next year with its name and days already suggested", async () => {
    openPage([RUNNING, OLD]);
    expect(await screen.findByRole("heading", { name: "Academic years", level: 1 })).toBeInTheDocument();
    const running = await screen.findByRole("region", { name: "Running year" });
    expect(running).toHaveTextContent("2026-2027");
    expect(running).toHaveTextContent("1 Apr 2026 to 31 Mar 2027");
    expect(screen.getByRole("textbox", { name: /Name of the next year/ })).toHaveValue("2027-2028");
    expect(screen.getByLabelText(/Starts on/)).toHaveValue("2027-04-01");
    expect(screen.getByLabelText(/Ends on/)).toHaveValue("2028-03-31");
    expect(screen.getByRole("checkbox", { name: /Copy the sections of 2026-2027/ })).toBeChecked();
    expect(screen.getByRole("region", { name: "Years that are over" })).toHaveTextContent("2025-2026");
  });

  it("makes the next year with one request (the sections copied unless the tick is taken off)", async () => {
    const { calls, user } = openPage([RUNNING], "school_admin", { "POST /academics/academic-years": () => ({ ...NEXT, sectionsCopied: 4 }) });
    await screen.findByRole("textbox", { name: /Name of the next year/ });
    await user.click(screen.getByRole("button", { name: "Make the next year" }));
    await waitFor(() => expect(posts(calls, "/academics/academic-years")).toHaveLength(1));
    expect(posts(calls, "/academics/academic-years")[0].body).toEqual({ name: "2027-2028", startDate: "2027-04-01", endDate: "2028-03-31", copySections: true, copyTimetable: true });
  });

  it("says what is wrong before anything is sent, and shows the server's word about a day", async () => {
    const refuse = () =>
      new Response(JSON.stringify({ success: false, message: "Invalid request data", code: "VALIDATION_ERROR", details: [{ path: "startDate", message: "The next year must start after the running year ends (31 Mar 2027)" }] }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    const { calls, user } = openPage([RUNNING], "school_admin", { "POST /academics/academic-years": refuse });
    const name = await screen.findByRole("textbox", { name: /Name of the next year/ });
    await user.clear(name);
    await user.click(screen.getByRole("button", { name: "Make the next year" }));
    expect(await screen.findByText("Enter the name of the next year, for example 2027-2028")).toBeInTheDocument();
    expect(posts(calls, "/academics/academic-years")).toHaveLength(0);
    await user.type(name, "2027-2028");
    await user.click(screen.getByRole("button", { name: "Make the next year" }));
    expect(await screen.findByText("The next year must start after the running year ends (31 Mar 2027)")).toBeInTheDocument();
  });
});

describe("Academic years: the year that waits", () => {
  it("shows where the promotion is, and leads to it", async () => {
    openPage([NEXT, RUNNING]);
    const next = await screen.findByRole("region", { name: "Next year" });
    expect(next).toHaveTextContent("2027-2028");
    expect(next).toHaveTextContent("Waiting");
    expect(await within(next).findByText("Not started")).toBeInTheDocument();
    expect(within(next).getByRole("link", { name: "Promote the students" })).toHaveAttribute("href", "/school/promotion");
    expect(screen.queryByRole("textbox", { name: /Name of the next year/ })).not.toBeInTheDocument();
  });

  it.each([
    ["draft", "Being made: 40 students"],
    ["submitted", "Waiting for the school admin to approve"],
    ["approved", "Approved: the students have a place in 2027-2028"],
  ] as const)("a promotion list that is %s says so", async (status, text) => {
    openPage([NEXT, RUNNING], "school_admin", { "GET /students/promotions": () => promotion(status) });
    const next = await screen.findByRole("region", { name: "Next year" });
    expect(await within(next).findByText(text)).toBeInTheDocument();
  });

  it("the school admin switches the year on after a question; the server's refusal is shown in it", async () => {
    const refuse = () =>
      new Response(JSON.stringify({ success: false, message: "3 students have no place in 2027-2028 yet. Make the promotion list and get it approved first.", code: "UNPLACED_STUDENTS" }), {
        status: 409,
        headers: { "Content-Type": "application/json" },
      });
    const { calls, user } = openPage([NEXT, RUNNING], "school_admin", { "POST /academics/academic-years/y3/activate": refuse });
    await user.click(await screen.findByRole("button", { name: "Switch on 2027-2028" }));
    const dialog = await screen.findByRole("dialog", { name: "Switch on 2027-2028?" });
    expect(dialog).toHaveTextContent("2026-2027 is closed");
    await user.click(within(dialog).getByRole("button", { name: "Switch on" }));
    expect(await within(dialog).findByText(/3 students have no place in 2027-2028 yet/)).toBeInTheDocument();
    expect(posts(calls, "/academics/academic-years/y3/activate")).toHaveLength(1);
  });

  it("Cancel in that question changes nothing", async () => {
    const { calls, user } = openPage([NEXT, RUNNING]);
    await user.click(await screen.findByRole("button", { name: "Switch on 2027-2028" }));
    await user.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Cancel" }));
    expect(posts(calls, "/academics/academic-years/y3/activate")).toHaveLength(0);
  });

  it("the principal prepares, but only the school admin switches the year on", async () => {
    openPage([NEXT, RUNNING], "principal");
    const next = await screen.findByRole("region", { name: "Next year" });
    expect(within(next).queryByRole("button", { name: /Switch on/ })).not.toBeInTheDocument();
    expect(within(next).getByText(/Only the school admin can switch the next year on/)).toBeInTheDocument();
    expect(within(next).getByRole("link", { name: "Promote the students" })).toBeInTheDocument();
  });
});
