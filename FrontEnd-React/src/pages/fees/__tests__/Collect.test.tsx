import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Provider } from "react-redux";
import { RouterProvider, createMemoryRouter } from "react-router";
import { ToastProvider } from "../../../components/ui/toast-context";
import { allApiSlices } from "../../../redux/api/apiRoot";
import store from "../../../redux/store";
import { fakeApi, type Call, type Handler } from "../../../test/fakeApi";
import { signInAs, signOut } from "../../../test/session";
import type { AccountCharge, CollectionSummary, Dues, FeeAccount, Receipt, ReceiptSheet, UserRole } from "../../../types";
import CollectFeesPage from "../CollectFees";
import DuesPage from "../Dues";
import ReceiptsPage from "../Receipts";

/**
 * Collecting fees (2026-11-19, docs/fees.md): find a student, read the account, tick the instalments, take the payment (all of an instalment or part
 * of it, a cheque's number, the late fine the rules ask for), read the receipt; the dues; the day's receipts and cancelling one.
 */
const charge = (id: string, label: string, dueDate: string, over: Partial<AccountCharge> = {}): AccountCharge => ({
  id,
  label,
  headName: label.split(" · ")[0],
  kind: "tuition",
  source: "chart",
  lineId: "l1",
  dueDate,
  amount: 1000,
  concession: 0,
  net: 1000,
  paid: 0,
  outstanding: 1000,
  status: "overdue",
  ...over,
});
const APR = charge("c1", "Tuition fee · Apr", "2026-04-10", { paid: 1000, outstanding: 0, status: "paid" });
const MAY = charge("c2", "Tuition fee · May", "2026-05-10");
const JUN = charge("c3", "Tuition fee · Jun", "2026-06-10");
const JAN = charge("c4", "Tuition fee · Jan", "2099-01-10", { status: "upcoming" });
const ACCOUNT: FeeAccount = {
  student: { id: "s1", name: "Asha Verma", admissionNumber: "ADM-1", classLabel: "Class 5 - A" },
  year: { id: "y1", name: "2026-2027", status: "active" },
  rules: { dueDay: 10, graceDays: 0, lateFine: { mode: "flat", amount: 100, maxAmount: null }, allowPartial: true },
  charges: [APR, MAY, JUN, JAN],
  totals: { amount: 4000, concession: 0, net: 4000, paid: 1000, outstanding: 3000, dueNow: 2000, overdue: 2000 },
  lateFineToday: 200,
  concessions: [],
  receipts: [{ id: "r0", number: "2026-2027/0001", paidOn: "2026-04-12", total: 1100, mode: "cash", status: "valid" }],
  optional: [{ lineId: "l9", headName: "Uniform", amount: 1500, frequency: "yearly", yearly: 1500 }],
};
const RECEIPT: Receipt = {
  id: "r1",
  number: "2026-2027/0002",
  seq: 2,
  studentId: "s1",
  studentName: "Asha Verma",
  admissionNumber: "ADM-1",
  classLabel: "Class 5 - A",
  mode: "cash",
  modeLabel: "Cash",
  reference: null,
  paidOn: "2026-11-19",
  items: [
    { chargeId: "c2", label: "Tuition fee · May", amount: 1000 },
    { chargeId: "c3", label: "Tuition fee · Jun", amount: 1000 },
  ],
  lateFine: 200,
  total: 2200,
  note: null,
  status: "valid",
  receivedBy: "Anita Sharma",
  cancelledAt: null,
  cancelReason: null,
  cancelledBy: null,
};
const SHEET: ReceiptSheet = { ...RECEIPT, school: "Sunrise Public School", year: "2026-2027" };
const refuse = (status: number, message: string, details: object[] = [], code = "VALIDATION_ERROR") => () => new Response(JSON.stringify({ success: false, message, code, details }), { status, headers: { "Content-Type": "application/json" } });
const posted = (calls: Call[], method: string, path: string) => calls.filter((c) => c.method === method && c.path === path);

function openCollect(extra: Record<string, Handler> = {}, who: { role?: UserRole; permissions?: string[] } = {}, at = "/fees/collect") {
  signInAs(who.role ?? "school_admin", who.permissions);
  const calls = fakeApi({
    "GET /fees/students/s1/account": () => ACCOUNT,
    "GET /fees/students/search": (_b, q) => ({ items: q.get("q") === "zzz" ? [] : [{ id: "s1", name: "Asha Verma", admissionNumber: "ADM-1", classLabel: "Class 5 - A" }] }),
    "GET /fees/receipts/r1": () => SHEET,
    ...extra,
  });
  const router = createMemoryRouter([{ path: "/fees/collect", element: <CollectFeesPage /> }], { initialEntries: [at] });
  render(
    <Provider store={store}>
      <ToastProvider>
        <RouterProvider router={router} />
      </ToastProvider>
    </Provider>,
  );
  return { calls, user: userEvent.setup() };
}
const account = () => screen.findByRole("region", { name: "Fees owed" });

afterEach(() => {
  cleanup();
  signOut();
  vi.unstubAllGlobals();
  for (const api of allApiSlices) store.dispatch(api.util.resetApiState());
});

describe("Fees > Collect fees", () => {
  it("finds a student by what is typed, says when none matches, and opens their account", async () => {
    const { user } = openCollect();
    const box = screen.getByPlaceholderText("Name or admission number");
    await user.type(box, "zzz");
    expect(await screen.findByText(/No student matches/)).toBeInTheDocument();
    await user.clear(box);
    await user.type(box, "asha");
    await user.click(await screen.findByRole("button", { name: /Asha Verma/ }));
    const owed = await account();
    expect(within(owed).getByRole("row", { name: /Tuition fee · May/ })).toBeInTheDocument();
    expect(screen.getByText(/Asha Verma · Class 5 - A · ADM-1/)).toBeInTheDocument();
  });

  it("shows what is owed, paid, due and late, and each instalment's standing", async () => {
    openCollect({}, {}, "/fees/collect?student=s1");
    const owed = await account();
    const tiles = screen.getByLabelText("About the account");
    expect(within(tiles).getByText("Fees this session").parentElement).toHaveTextContent("₹4,000");
    expect(within(tiles).getByText("Paid").parentElement).toHaveTextContent("₹1,000");
    expect(within(tiles).getByText("Due now").parentElement).toHaveTextContent("₹2,000");
    expect(within(tiles).getByText("Late").parentElement).toHaveTextContent("Late fine ₹200");
    expect(within(within(owed).getByRole("row", { name: /Tuition fee · Apr/ })).getByText("Paid")).toBeInTheDocument();
    expect(within(within(owed).getByRole("row", { name: /Tuition fee · May/ })).getByText("Late")).toBeInTheDocument();
    expect(within(within(owed).getByRole("row", { name: /Tuition fee · Jan/ })).getByText("Not due yet")).toBeInTheDocument();
    // A paid instalment cannot be chosen.
    expect(within(owed).queryByLabelText("Choose Tuition fee · Apr")).not.toBeInTheDocument();
  });

  it("ticks what is due, takes the payment with the late fine of the rules, and shows the receipt", async () => {
    const { calls, user } = openCollect({ "POST /fees/collect": () => RECEIPT }, {}, "/fees/collect?student=s1");
    await account();
    expect(screen.getByRole("button", { name: "Collect" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Tick all that are due" }));
    await user.click(screen.getByRole("button", { name: "Collect ₹2,000" }));
    const dialog = await screen.findByRole("dialog", { name: "Collect fees from Asha Verma" });
    // Two late instalments, a flat 100 each.
    expect(within(dialog).getByLabelText(/^Late fine/)).toHaveValue("200");
    expect(within(dialog).getByRole("button", { name: "Take ₹2,200" })).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Take ₹2,200" }));

    const sent = posted(calls, "POST", "/fees/collect")[0].body as { studentId: string; mode: string; items: unknown[]; lateFine: number; reference: string | null };
    expect(sent).toMatchObject({ studentId: "s1", mode: "cash", lateFine: 200, reference: null });
    expect(sent.items).toEqual([{ chargeId: "c2", amount: 1000 }, { chargeId: "c3", amount: 1000 }]);
    const receipt = await screen.findByRole("dialog", { name: "Receipt 2026-2027/0002" });
    expect(await within(receipt).findByText("Sunrise Public School")).toBeInTheDocument();
    expect(within(receipt).getByText("Late fine")).toBeInTheDocument();
    expect(within(receipt).getByText("₹2,200")).toBeInTheDocument();
    expect(within(receipt).getByText("Received by Anita Sharma")).toBeInTheDocument();
  });

  it("the cashier may take part of an instalment, and waive the fine; more than is owed is refused before anything is sent", async () => {
    const { calls, user } = openCollect({ "POST /fees/collect": () => RECEIPT }, {}, "/fees/collect?student=s1");
    await account();
    await user.click(screen.getByLabelText("Choose Tuition fee · May"));
    await user.click(screen.getByRole("button", { name: "Collect ₹1,000" }));
    const dialog = await screen.findByRole("dialog", { name: "Collect fees from Asha Verma" });
    const amount = within(dialog).getByLabelText(/Tuition fee · May/);
    await user.clear(amount);
    await user.type(amount, "1500");
    await user.click(within(dialog).getByRole("button", { name: /^Take/ }));
    expect(await within(dialog).findByText("Only ₹1,000 is owed")).toBeInTheDocument();
    expect(posted(calls, "POST", "/fees/collect")).toHaveLength(0);

    await user.clear(amount);
    await user.type(amount, "400");
    const fine = within(dialog).getByLabelText(/^Late fine/);
    await user.clear(fine);
    await user.type(fine, "0");
    expect(within(dialog).getByRole("button", { name: "Take ₹400" })).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Take ₹400" }));
    await waitFor(() => expect(posted(calls, "POST", "/fees/collect")).toHaveLength(1));
    expect(posted(calls, "POST", "/fees/collect")[0].body).toMatchObject({ lateFine: 0, items: [{ chargeId: "c2", amount: 400 }] });
  });

  it("a school that takes whole instalments only does not let the amount be changed", async () => {
    const strict: FeeAccount = { ...ACCOUNT, rules: { ...ACCOUNT.rules, allowPartial: false } };
    const { user } = openCollect({ "GET /fees/students/s1/account": () => strict }, {}, "/fees/collect?student=s1");
    await account();
    await user.click(screen.getByLabelText("Choose Tuition fee · May"));
    await user.click(screen.getByRole("button", { name: "Collect ₹1,000" }));
    const dialog = await screen.findByRole("dialog", { name: "Collect fees from Asha Verma" });
    expect(within(dialog).getByLabelText(/Tuition fee · May/)).toHaveAttribute("readonly");
  });

  it("a cheque needs its number; once given it is sent", async () => {
    const { calls, user } = openCollect({ "POST /fees/collect": () => RECEIPT }, {}, "/fees/collect?student=s1");
    await account();
    await user.click(screen.getByLabelText("Choose Tuition fee · Jun"));
    await user.click(screen.getByRole("button", { name: "Collect ₹1,000" }));
    const dialog = await screen.findByRole("dialog", { name: "Collect fees from Asha Verma" });
    await user.click(within(dialog).getByRole("button", { name: /How it was paid/ }));
    await user.click(await screen.findByRole("option", { name: "Cheque" }));
    await user.click(within(dialog).getByRole("button", { name: /^Take/ }));
    expect(await within(dialog).findByText("Enter the cheque number")).toBeInTheDocument();
    expect(posted(calls, "POST", "/fees/collect")).toHaveLength(0);
    await user.type(within(dialog).getByLabelText(/^Cheque number/), "000123");
    await user.click(within(dialog).getByRole("button", { name: /^Take/ }));
    await waitFor(() => expect(posted(calls, "POST", "/fees/collect")).toHaveLength(1));
    expect(posted(calls, "POST", "/fees/collect")[0].body).toMatchObject({ mode: "cheque", reference: "000123" });
  });

  it("puts the server's word under the instalment it is about, and keeps the window open", async () => {
    const { user } = openCollect(
      { "POST /fees/collect": refuse(400, "Validation failed", [{ path: "items.0.amount", message: "Tuition fee · Jun is already paid" }]) },
      {},
      "/fees/collect?student=s1",
    );
    await account();
    await user.click(screen.getByLabelText("Choose Tuition fee · Jun"));
    await user.click(screen.getByRole("button", { name: "Collect ₹1,000" }));
    const dialog = await screen.findByRole("dialog", { name: "Collect fees from Asha Verma" });
    await user.click(within(dialog).getByRole("button", { name: /^Take/ }));
    expect(await within(dialog).findByText("Tuition fee · Jun is already paid")).toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "Collect fees from Asha Verma" })).toBeInTheDocument();
  });

  it("an optional fee the class offers is added to the account in one click", async () => {
    const { calls, user } = openCollect({ "POST /fees/students/s1/optional": () => ACCOUNT }, {}, "/fees/collect?student=s1");
    await user.click(await screen.findByRole("button", { name: "Uniform ₹1,500" }));
    await waitFor(() => expect(posted(calls, "POST", "/fees/students/s1/optional")).toHaveLength(1));
    expect(posted(calls, "POST", "/fees/students/s1/optional")[0].body).toEqual({ lineId: "l9" });
  });

  it("a receipt opens from the list; one who manages the fees cancels it with a reason, and one who only collects cannot", async () => {
    const { calls, user } = openCollect({ "POST /fees/receipts/r0/cancel": () => ({ ...RECEIPT, status: "cancelled" }), "GET /fees/receipts/r0": () => ({ ...SHEET, id: "r0", number: "2026-2027/0001" }) }, {}, "/fees/collect?student=s1");
    await account();
    await user.click(screen.getByRole("button", { name: "2026-2027/0001" }));
    expect(await screen.findByRole("dialog", { name: "Receipt 2026-2027/0001" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Done" }));

    await user.click(await screen.findByRole("button", { name: "Cancel receipt 2026-2027/0001" }));
    const dialog = await screen.findByRole("dialog", { name: "Cancel receipt 2026-2027/0001" });
    await user.click(within(dialog).getByRole("button", { name: "Cancel the receipt" }));
    expect(await within(dialog).findByText("Write why it is cancelled")).toBeInTheDocument();
    await user.type(within(dialog).getByLabelText(/Why is it cancelled/), "Wrong student");
    await user.click(within(dialog).getByRole("button", { name: "Cancel the receipt" }));
    await waitFor(() => expect(posted(calls, "POST", "/fees/receipts/r0/cancel")).toHaveLength(1));
    expect(posted(calls, "POST", "/fees/receipts/r0/cancel")[0].body).toEqual({ reason: "Wrong student" });
  });

  it("one who may only collect cannot cancel a receipt or give a concession", async () => {
    openCollect({}, { role: "receptionist", permissions: ["fees.collect"] }, "/fees/collect?student=s1");
    await account();
    expect(screen.queryByRole("button", { name: /^Cancel receipt/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Give a concession" })).not.toBeInTheDocument();
  });

  it("a concession waits for approval: the school admin sees Approve, the accountant does not", async () => {
    const waiting: FeeAccount = { ...ACCOUNT, concessions: [{ id: "g1", name: "Sibling", mode: "percent", value: 10, status: "pending", note: "Brother in Class 8", headIds: [], givenBy: "Anita" }] };
    const { calls, user } = openCollect({ "GET /fees/students/s1/account": () => waiting, "POST /fees/student-concessions/g1/approve": () => ACCOUNT }, {}, "/fees/collect?student=s1");
    const section = await screen.findByRole("region", { name: "Concessions" });
    expect(within(section).getByText("Waiting for approval")).toBeInTheDocument();
    await user.click(within(section).getByRole("button", { name: "Approve" }));
    await waitFor(() => expect(posted(calls, "POST", "/fees/student-concessions/g1/approve")).toHaveLength(1));
    cleanup();
    for (const api of allApiSlices) store.dispatch(api.util.resetApiState());
    openCollect({ "GET /fees/students/s1/account": () => waiting }, { role: "accountant", permissions: ["fees.view", "fees.manage", "fees.collect"] }, "/fees/collect?student=s1");
    expect(within(await screen.findByRole("region", { name: "Concessions" })).queryByRole("button", { name: "Approve" })).not.toBeInTheDocument();
  });

  it("giving a concession: the school's list, minus what the student has; sent with a note", async () => {
    const { calls, user } = openCollect(
      {
        "GET /fees/concessions": () => ({
          items: [{ id: "k1", name: "Sibling", basis: "sibling", mode: "percent", value: 10, appliesTo: "all", headIds: [], headNames: [], needsApproval: false, notes: null, isActive: true, inUse: false }],
        }),
        "POST /fees/students/s1/concessions": () => ({ ...ACCOUNT, concessions: [{ id: "g1", name: "Sibling", mode: "percent", value: 10, status: "approved", note: null, headIds: [], givenBy: "x" }] }),
      },
      {},
      "/fees/collect?student=s1",
    );
    await user.click(await screen.findByRole("button", { name: "Give a concession" }));
    const dialog = await screen.findByRole("dialog", { name: "Give a concession to Asha Verma" });
    await user.click(within(dialog).getByRole("button", { name: /Concession/ }));
    await user.click(await screen.findByRole("option", { name: /Sibling/ }));
    await user.type(within(dialog).getByLabelText(/Why this student/), "Brother is in Class 8");
    await user.click(within(dialog).getByRole("button", { name: "Give" }));
    await waitFor(() => expect(posted(calls, "POST", "/fees/students/s1/concessions")).toHaveLength(1));
    expect(posted(calls, "POST", "/fees/students/s1/concessions")[0].body).toEqual({ concessionId: "k1", note: "Brother is in Class 8" });
  });

  it("an account the server refuses says why", async () => {
    openCollect({ "GET /fees/students/s1/account": refuse(404, "Student not found", [], "STUDENT_NOT_FOUND") }, {}, "/fees/collect?student=s1");
    expect(await screen.findByText("Student not found")).toBeInTheDocument();
  });
});

describe("Fees > Dues", () => {
  const DUES: Dues = {
    year: "2026-2027",
    asOn: "2026-11-19",
    totals: { students: 2, dueNow: 5000, overdue: 3000 },
    items: [
      { studentId: "s1", name: "Asha Verma", admissionNumber: "ADM-1", classId: "c5", classLabel: "Class 5 - A", dueNow: 3000, overdue: 3000, instalments: 3, oldestDue: "2026-04-10", lateFine: 300 },
      { studentId: "s2", name: "Kabir Rao", admissionNumber: "ADM-2", classId: "c5", classLabel: "Class 5 - A", dueNow: 2000, overdue: 0, instalments: 2, oldestDue: "2026-11-10", lateFine: 0 },
    ],
  };
  function openDues(extra: Record<string, Handler> = {}, who: { role?: UserRole; permissions?: string[] } = {}) {
    signInAs(who.role ?? "school_admin", who.permissions);
    const calls = fakeApi({ "GET /fees/dues": () => DUES, ...extra });
    const router = createMemoryRouter([{ path: "/fees/dues", element: <DuesPage /> }], { initialEntries: ["/fees/dues"] });
    render(
      <Provider store={store}>
        <ToastProvider>
          <RouterProvider router={router} />
        </ToastProvider>
      </Provider>,
    );
    return { calls, user: userEvent.setup() };
  }

  it("lists who owes, worst first, with what is due, what is late and the late fine; each row leads to the account", async () => {
    openDues();
    const table = await screen.findByRole("table", { name: "Students with fees due" });
    const asha = within(table).getByRole("row", { name: /Asha Verma/ });
    expect(within(asha).getByText("₹3,000", { selector: "td.text-danger" })).toBeInTheDocument();
    expect(within(asha).getByText("₹300")).toBeInTheDocument();
    expect(within(table).getByRole("link", { name: "Collect from Kabir Rao" })).toHaveAttribute("href", "/fees/collect?student=s2");
    const tiles = screen.getByLabelText("About the dues");
    expect(within(tiles).getByText("Due now").parentElement).toHaveTextContent("₹5,000");
    expect(screen.getByText("As on 19 Nov 2026 · 2026-2027")).toBeInTheDocument();
  });

  it("the search asks the server; nothing due says so", async () => {
    const { calls, user } = openDues({ "GET /fees/dues": (_b, q) => (q.get("search") === "zzz" ? { ...DUES, items: [], totals: { students: 0, dueNow: 0, overdue: 0 } } : DUES) });
    await screen.findByRole("table", { name: "Students with fees due" });
    await user.type(screen.getByLabelText("Search by name or admission number"), "zzz");
    expect(await screen.findByText("No student matches")).toBeInTheDocument();
    expect(calls.some((c) => c.query.includes("search=zzz"))).toBe(true);
  });

  it("makes every student's fees in one go for one who manages the fees, and not for one who only collects", async () => {
    const { calls, user } = openDues({ "POST /fees/generate": () => ({ students: 40, charges: 480 }) });
    await user.click(await screen.findByRole("button", { name: "Make every student's fees" }));
    expect(await screen.findByText("Fees made for 40 students")).toBeInTheDocument();
    expect(posted(calls, "POST", "/fees/generate")[0].body).toEqual({});
    cleanup();
    for (const api of allApiSlices) store.dispatch(api.util.resetApiState());
    openDues({}, { role: "receptionist", permissions: ["fees.collect"] });
    await screen.findByRole("table", { name: "Students with fees due" });
    expect(screen.queryByRole("button", { name: "Make every student's fees" })).not.toBeInTheDocument();
  });
});

describe("Fees > Receipts", () => {
  const SUMMARY: CollectionSummary = {
    from: "2026-11-19",
    to: "2026-11-19",
    receipts: 2,
    total: 3300,
    lateFine: 300,
    cancelled: { count: 1, total: 1000 },
    byMode: [
      { mode: "cash", modeLabel: "Cash", count: 1, total: 2200 },
      { mode: "upi", modeLabel: "UPI", count: 1, total: 1100 },
    ],
    byDay: [{ day: "2026-11-19", total: 3300 }],
  };
  const LIST = [RECEIPT, { ...RECEIPT, id: "r2", number: "2026-2027/0003", mode: "cheque" as const, modeLabel: "Cheque", reference: "000123", status: "cancelled" as const, studentName: "Kabir Rao", total: 1000 }];
  function openReceipts(who: { role?: UserRole; permissions?: string[] } = {}, extra: Record<string, Handler> = {}) {
    signInAs(who.role ?? "school_admin", who.permissions);
    const calls = fakeApi({ "GET /fees/collection": () => SUMMARY, "GET /fees/receipts": () => ({ items: LIST, limit: 100 }), "GET /fees/receipts/r1": () => SHEET, ...extra });
    const router = createMemoryRouter([{ path: "/fees/receipts", element: <ReceiptsPage /> }], { initialEntries: ["/fees/receipts"] });
    render(
      <Provider store={store}>
        <ToastProvider>
          <RouterProvider router={router} />
        </ToastProvider>
      </Provider>,
    );
    return { calls, user: userEvent.setup() };
  }

  it("adds up the day: the total, how many receipts, by how it was paid, the late fine and what was cancelled", async () => {
    const { calls } = openReceipts();
    const tiles = await screen.findByLabelText("About the collection");
    await waitFor(() => expect(within(tiles).getByText("Collected").parentElement).toHaveTextContent("₹3,300"));
    expect(within(tiles).getByText("Late fine taken").parentElement).toHaveTextContent("₹300");
    expect(within(tiles).getByText("Cancelled").parentElement).toHaveTextContent("₹1,000");
    const modes = screen.getByRole("list", { name: "By how it was paid" });
    expect(within(modes).getByText(/Cash:/)).toHaveTextContent("₹2,200");
    // The first look is at today.
    expect(calls.find((c) => c.path === "/fees/receipts")!.query).toMatch(/from=\d{4}-\d{2}-\d{2}&to=\d{4}-\d{2}-\d{2}/);
  });

  it("lists each receipt with who paid, how, and whether it stands; a receipt opens; a cancelled one has no cancel button", async () => {
    const { user } = openReceipts();
    const table = await screen.findByRole("table", { name: "Receipts" });
    expect(within(within(table).getByRole("row", { name: /Kabir Rao/ })).getByText("Cancelled")).toBeInTheDocument();
    expect(within(table).getByText("Cheque (000123)")).toBeInTheDocument();
    expect(within(table).queryByRole("button", { name: "Cancel receipt 2026-2027/0003" })).not.toBeInTheDocument();
    await user.click(within(table).getByRole("button", { name: "2026-2027/0002" }));
    expect(await screen.findByRole("dialog", { name: "Receipt 2026-2027/0002" })).toBeInTheDocument();
  });

  it("only one who manages the fees gets the cancel button", async () => {
    openReceipts({ role: "receptionist", permissions: ["fees.collect"] });
    const table = await screen.findByRole("table", { name: "Receipts" });
    expect(within(table).queryByRole("button", { name: /^Cancel receipt/ })).not.toBeInTheDocument();
  });

  it("says when no receipt was made in the days", async () => {
    openReceipts({}, { "GET /fees/receipts": () => ({ items: [], limit: 100 }) });
    expect(await screen.findByText("No receipt in these days")).toBeInTheDocument();
  });
});
