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
import PromotionPage from "../Promotion";

const year = (id: string, name: string, status: AcademicYear["status"]): AcademicYear => ({ id, name, startDate: "2026-04-01", endDate: "2027-03-31", status, activatedAt: null });
const YEARS = [year("y3", "2027-2028", "pending"), year("y2", "2026-2027", "active")];

const place = (classId: string, className: string, sectionName: string | null) => ({ classId, className, sectionId: sectionName ? `${classId}-${sectionName}` : null, sectionName });
const base = (status: PromotionStatus): Promotion => ({
  id: "p1",
  status,
  fromYear: { id: "y2", name: "2026-2027" },
  toYear: { id: "y3", name: "2027-2028" },
  summary: { total: 3, promote: 2, retain: 0, leave: 1 },
  createdBy: { name: "Dev Patel", role: "principal" },
  createdAt: "2026-10-26T10:00:00.000Z",
  submitted: status === "draft" ? null : { by: { name: "Dev Patel", role: "principal" }, at: "2026-10-26T11:00:00.000Z" },
  decision: null,
  appliedAt: null,
  entries: [
    { studentId: "s1", name: "Asha Verma", admissionNumber: "ADM-2026-0001", from: place("c5", "Class 5", "A"), outcome: "promote", to: place("c6", "Class 6", "A") },
    { studentId: "s2", name: "Bina Rao", admissionNumber: "ADM-2026-0002", from: place("c5", "Class 5", "B"), outcome: "promote", to: place("c6", "Class 6", "A") },
    { studentId: "s3", name: "Chitra Joshi", admissionNumber: "ADM-2026-0003", from: place("c6", "Class 6", "A"), outcome: "leave", to: null },
  ],
  targets: [
    { classId: "c5", className: "Class 5", sections: [{ id: "c5-A", name: "A", capacity: 40 }, { id: "c5-B", name: "B", capacity: 40 }] },
    { classId: "c6", className: "Class 6", sections: [{ id: "c6-A", name: "A", capacity: 40 }] },
  ],
});

function openPage(promotion: Promotion | null, role: UserRole = "school_admin", extra: Record<string, Handler> = {}, years: AcademicYear[] = YEARS) {
  store.dispatch(sessionStarted({ user: { id: "u1", name: "Meena Singh", email: "m@school.example", username: null, role, tenantId: "t1", emailVerifiedAt: null }, tenant: null }));
  const calls = fakeApi({ "GET /academics/academic-years": () => years, "GET /students/promotions": () => promotion, ...extra });
  const router = createMemoryRouter([{ path: "/school/promotion", element: <PromotionPage /> }, { path: "/school/academic-years", element: <p>The years</p> }], { initialEntries: ["/school/promotion"] });
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
const patches = (calls: Call[]) => calls.filter((c) => c.method === "PATCH");
const outcome = (name: string, label: "Promote" | "Stay" | "Leave") => screen.getByRole("button", { name: `${name}: ${label}` });
const pickIn = async (user: ReturnType<typeof userEvent.setup>, id: string, option: string) => {
  await user.click(document.getElementById(id)!);
  await user.click(await screen.findByRole("option", { name: option }));
};
const rejectedBody = (message: string, code: string) => () => new Response(JSON.stringify({ success: false, message, code }), { status: 409, headers: { "Content-Type": "application/json" } });

describe("Promotion: before the list", () => {
  it("with no next year, says to make it first", async () => {
    openPage(null, "school_admin", {}, [YEARS[1]]);
    expect(await screen.findByRole("heading", { name: "There is no next year yet" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Make the next year" })).toHaveAttribute("href", "/school/academic-years");
  });

  it("with a next year and no list, offers to make it, with a suggestion for every student", async () => {
    const { calls, user } = openPage(null, "principal", { "POST /students/promotions": () => base("draft") });
    await user.click(await screen.findByRole("button", { name: "Make the promotion list" }));
    await waitFor(() => expect(posts(calls, "/students/promotions")).toHaveLength(1));
    expect(posts(calls, "/students/promotions")[0].body).toEqual({ toAcademicYearId: "y3" });
  });
});

describe("Promotion: the draft list", () => {
  it("shows each class with its students, what happens to each, and where they go", async () => {
    openPage(base("draft"));
    expect(await screen.findByRole("heading", { name: "Promote 2026-2027 to 2027-2028", level: 1 })).toBeInTheDocument();
    const five = await screen.findByRole("region", { name: "Class 5" });
    expect(five).toHaveTextContent("2 students");
    const row = within(five).getByText("Asha Verma").closest("tr")!;
    expect(row).toHaveTextContent("A");
    expect(row).toHaveTextContent("Class 6 · A");
    expect(outcome("Asha Verma", "Promote")).toHaveAttribute("aria-pressed", "true");
    const six = screen.getByRole("region", { name: "Class 6" });
    expect(within(six).getByText("Chitra Joshi").closest("tr")).toHaveTextContent("Leaves the school");
    expect(outcome("Chitra Joshi", "Leave")).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText(/2 go on · 0 stay · 1 leaving/)).toBeInTheDocument();
  });

  it("changes are saved by Save changes, as one request with only what changed; the list cannot be sent before", async () => {
    let now = base("draft");
    const { calls, user } = openPage(now, "principal", {
      "GET /students/promotions": () => now,
      "PATCH /students/promotions/p1": () => {
        now = { ...now, entries: now.entries.map((e) => (e.studentId === "s1" ? { ...e, outcome: "leave" as const, to: null } : e.studentId === "s3" ? { ...e, outcome: "retain" as const, to: place("c6", "Class 6", "A") } : e)) };
        return now;
      },
    });
    await screen.findByRole("region", { name: "Class 5" });
    expect(screen.getByRole("button", { name: "Save changes" })).toBeDisabled();
    await user.click(outcome("Chitra Joshi", "Stay"));
    await user.click(outcome("Asha Verma", "Leave"));
    expect(screen.getByRole("button", { name: "Save changes (2)" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Send for approval" })).toBeDisabled();
    expect(patches(calls)).toHaveLength(0);

    await user.click(screen.getByRole("button", { name: "Save changes (2)" }));
    await waitFor(() => expect(patches(calls)).toHaveLength(1));
    expect(patches(calls)[0].body).toEqual({ entries: [{ studentId: "s3", outcome: "retain" }, { studentId: "s1", outcome: "leave" }] });
    await waitFor(() => expect(screen.getByRole("button", { name: "Save changes" })).toBeDisabled());
    expect(screen.getByRole("button", { name: "Send for approval" })).toBeEnabled();
  });

  it("putting a change back as it was is no change", async () => {
    const { user } = openPage(base("draft"));
    await screen.findByRole("region", { name: "Class 5" });
    await user.click(outcome("Asha Verma", "Leave"));
    expect(screen.getByRole("button", { name: "Save changes (1)" })).toBeEnabled();
    await user.click(outcome("Asha Verma", "Promote"));
    expect(screen.getByRole("button", { name: "Save changes" })).toBeDisabled();
  });

  it("a class can be sent to another class as a whole (one choice, every student of it)", async () => {
    const { calls, user } = openPage(base("draft"));
    await screen.findByRole("region", { name: "Class 5" });
    await pickIn(user, "goes-to-c5", "Class 5");
    await user.click(screen.getByRole("button", { name: "Save changes (2)" }));
    await waitFor(() => expect(patches(calls)).toHaveLength(1));
    expect(patches(calls)[0].body).toEqual({
      entries: [
        { studentId: "s1", outcome: "promote", classId: "c5" },
        { studentId: "s2", outcome: "promote", classId: "c5" },
      ],
    });
  });

  it("a whole class can stay, or nobody of it continues", async () => {
    const { calls, user } = openPage(base("draft"));
    const five = await screen.findByRole("region", { name: "Class 5" });
    await user.click(within(five).getByRole("button", { name: "All stay in Class 5" }));
    await user.click(screen.getByRole("button", { name: "Save changes (2)" }));
    await waitFor(() => expect(patches(calls)).toHaveLength(1));
    expect(patches(calls)[0].body).toEqual({ entries: [{ studentId: "s1", outcome: "retain" }, { studentId: "s2", outcome: "retain" }] });
  });

  it("Discard puts everything back as saved", async () => {
    const { user } = openPage(base("draft"));
    await screen.findByRole("region", { name: "Class 5" });
    await user.click(outcome("Asha Verma", "Leave"));
    await user.click(screen.getByRole("button", { name: "Discard changes" }));
    expect(outcome("Asha Verma", "Promote")).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Save changes" })).toBeDisabled();
  });

  it("Send for approval is one request, and a refusal is said", async () => {
    const { calls, user } = openPage(base("draft"), "principal", { "POST /students/promotions/p1/submit": rejectedBody("2 students have no class or section in 2027-2028 yet: Asha Verma.", "PROMOTION_INCOMPLETE") });
    await user.click(await screen.findByRole("button", { name: "Send for approval" }));
    await waitFor(() => expect(posts(calls, "/students/promotions/p1/submit")).toHaveLength(1));
    expect(await screen.findByText(/2 students have no class or section/)).toBeInTheDocument();
  });

  it("shows why a list was sent back, from the admin", async () => {
    openPage({ ...base("draft"), decision: { outcome: "rejected", by: { name: "Meena Singh", role: "school_admin" }, at: "2026-10-27T09:00:00.000Z", note: "Keep Bina in Class 5" } }, "principal");
    expect(await screen.findByText(/Sent back by Meena Singh/)).toBeInTheDocument();
    expect(screen.getByText(/Keep Bina in Class 5/)).toBeInTheDocument();
  });

  it("cancelling the list asks first", async () => {
    const { calls, user } = openPage(base("draft"));
    await user.click(await screen.findByRole("button", { name: "Cancel the list" }));
    const dialog = await screen.findByRole("dialog", { name: "Cancel this promotion list?" });
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(posts(calls, "/students/promotions/p1/cancel")).toHaveLength(0);
    await user.click(screen.getByRole("button", { name: "Cancel the list" }));
    await user.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Cancel the list" }));
    await waitFor(() => expect(posts(calls, "/students/promotions/p1/cancel")).toHaveLength(1));
  });
});

describe("Promotion: the school admin's approval", () => {
  it("the principal sees that the list waits for the school admin and cannot approve", async () => {
    openPage(base("submitted"), "principal");
    expect(await screen.findByText(/Waiting for the school admin to approve/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Approve" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Send back" })).not.toBeInTheDocument();
    // The students cannot be changed now.
    expect(screen.queryByRole("button", { name: "Asha Verma: Leave" })).not.toBeInTheDocument();
  });

  it("the school admin approves after a question", async () => {
    const { calls, user } = openPage(base("submitted"), "school_admin", { "POST /students/promotions/p1/approve": () => base("approved") });
    await user.click(await screen.findByRole("button", { name: "Approve" }));
    const dialog = await screen.findByRole("dialog", { name: "Approve the promotion?" });
    expect(dialog).toHaveTextContent("a place in 2027-2028");
    await user.click(within(dialog).getByRole("button", { name: "Approve" }));
    await waitFor(() => expect(posts(calls, "/students/promotions/p1/approve")).toHaveLength(1));
    expect(posts(calls, "/students/promotions/p1/approve")[0].body).toEqual({ allowOverCapacity: false });
  });

  it("a section that would be over its seats is said, and Approve anyway goes over with the admin's yes", async () => {
    let tries = 0;
    const { calls, user } = openPage(base("submitted"), "school_admin", {
      "POST /students/promotions/p1/approve": () => {
        tries += 1;
        return tries === 1 ? rejectedBody("Class 6 - A would have 2 students for 1 seats.", "SECTION_FULL")() : base("approved");
      },
    });
    await user.click(await screen.findByRole("button", { name: "Approve" }));
    const dialog = await screen.findByRole("dialog", { name: "Approve the promotion?" });
    await user.click(within(dialog).getByRole("button", { name: "Approve" }));
    expect(await within(dialog).findByText(/Class 6 - A would have 2 students for 1 seats/)).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Approve anyway" }));
    await waitFor(() => expect(posts(calls, "/students/promotions/p1/approve")).toHaveLength(2));
    expect(posts(calls, "/students/promotions/p1/approve")[1].body).toEqual({ allowOverCapacity: true });
  });

  it("sending back carries the admin's note", async () => {
    const { calls, user } = openPage(base("submitted"), "school_admin", { "POST /students/promotions/p1/reject": () => base("draft") });
    await user.click(await screen.findByRole("button", { name: "Send back" }));
    const dialog = await screen.findByRole("dialog", { name: "Send the list back?" });
    await user.type(within(dialog).getByRole("textbox", { name: /Note/ }), "Keep Bina in Class 5");
    await user.click(within(dialog).getByRole("button", { name: "Send back" }));
    await waitFor(() => expect(posts(calls, "/students/promotions/p1/reject")).toHaveLength(1));
    expect(posts(calls, "/students/promotions/p1/reject")[0].body).toEqual({ note: "Keep Bina in Class 5" });
  });

  it("an approved list says the students have their places, and leads to switching the year on", async () => {
    openPage({ ...base("approved"), decision: { outcome: "approved", by: { name: "Meena Singh", role: "school_admin" }, at: "2026-10-27T09:00:00.000Z", note: null } });
    expect(await screen.findByText(/Approved by Meena Singh/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Go to Academic years" })).toHaveAttribute("href", "/school/academic-years");
    expect(screen.queryByRole("button", { name: "Asha Verma: Leave" })).not.toBeInTheDocument();
  });
});
