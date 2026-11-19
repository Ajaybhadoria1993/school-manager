import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Provider } from "react-redux";
import { RouterProvider, createMemoryRouter } from "react-router";
import { ToastProvider } from "../../../components/ui/toast-context";
import { allApiSlices } from "../../../redux/api/apiRoot";
import store from "../../../redux/store";
import { fakeApi, type Call, type Handler } from "../../../test/fakeApi";
import { signInAs, signOut } from "../../../test/session";
import type { ClassFees, Concession, FeeHead, FeeLine, FeeStructure, SavedFeeRules, UserRole } from "../../../types";
import ConcessionsPage from "../Concessions";
import FeeHeadsPage from "../FeeHeads";
import FeeRulesPage from "../FeeRules";
import FeeStructurePage from "../FeeStructure";

const head = (id: string, name: string, kind: FeeHead["kind"], over: Partial<FeeHead> = {}): FeeHead => ({
  id,
  name,
  kind,
  kindLabel: kind,
  refundable: false,
  defaultFrequency: "yearly",
  defaultAppliesTo: "all",
  defaultOptional: false,
  notes: null,
  isActive: true,
  inUse: false,
  ...over,
});
const TUITION = head("h1", "Tuition fee", "tuition", { defaultFrequency: "monthly", inUse: true });
const ADMISSION = head("h2", "Admission fee", "admission", { defaultFrequency: "one_time", defaultAppliesTo: "new" });
const UNIFORM = head("h3", "Uniform", "supplies", { defaultOptional: true });
const BUS = head("h4", "Bus fee", "transport", { defaultFrequency: "monthly", defaultOptional: true });
const HEADS = [ADMISSION, TUITION, UNIFORM, BUS];

const line = (id: string, h: FeeHead, over: Partial<FeeLine>): FeeLine => ({
  id,
  headId: h.id,
  headName: h.name,
  kind: h.kind,
  refundable: false,
  amount: 1000,
  frequency: "monthly",
  dueMonths: [4, 5, 6, 7, 8, 9, 10, 11, 12, 1, 2, 3],
  appliesTo: "all",
  optional: false,
  notes: null,
  yearly: 12000,
  ...over,
});
const CLASS_1: ClassFees = {
  id: "c1",
  name: "Class 1",
  department: "Primary",
  lines: [
    line("l1", ADMISSION, { amount: 5000, frequency: "one_time", dueMonths: [], appliesTo: "new", yearly: 5000 }),
    line("l2", TUITION, {}),
    line("l3", UNIFORM, { amount: 3000, frequency: "yearly", dueMonths: [4], optional: true, yearly: 3000 }),
  ],
  totals: { newStudent: 17000, atJoining: 5000, existingStudent: 12000, refundable: 0, optional: 3000 },
  warnings: [],
};
const CLASS_2: ClassFees = { id: "c2", name: "Class 2", department: "Primary", lines: [], totals: { newStudent: 0, atJoining: 0, existingStudent: 0, refundable: 0, optional: 0 }, warnings: [] };
const STRUCTURE: FeeStructure = {
  year: { id: "y1", name: "2026-2027", status: "active", startMonth: 4 },
  years: [{ id: "y1", name: "2026-2027", status: "active" }],
  classes: [CLASS_1, CLASS_2],
  heads: HEADS,
};

const calls = { current: [] as Call[] };
const refuse = (status: number, message: string, details: object[] = []) => () => new Response(JSON.stringify({ success: false, message, details }), { status, headers: { "Content-Type": "application/json" } });
const sent = (method: string, path: string) => calls.current.filter((c) => c.method === method && c.path === path);

function open(page: "structure" | "heads" | "concessions" | "rules", extra: Record<string, Handler> = {}, who: { role?: UserRole; permissions?: string[] } = {}) {
  signInAs(who.role ?? "school_admin", who.permissions);
  calls.current = fakeApi({
    "GET /fees/structure": () => STRUCTURE,
    "GET /fees/heads": () => ({ items: HEADS }),
    "GET /fees/concessions": () => ({ items: [] }),
    "GET /fees/rules": () => RULES,
    ...extra,
  });
  const element = page === "structure" ? <FeeStructurePage /> : page === "heads" ? <FeeHeadsPage /> : page === "concessions" ? <ConcessionsPage /> : <FeeRulesPage />;
  const router = createMemoryRouter([{ path: "/fees/:page", element }], { initialEntries: [`/fees/${page}`] });
  render(
    <Provider store={store}>
      <ToastProvider>
        <RouterProvider router={router} />
      </ToastProvider>
    </Provider>
  );
  return { user: userEvent.setup() };
}

const RULES: SavedFeeRules = { dueDay: 10, graceDays: 0, lateFine: { mode: "none", amount: 0, maxAmount: null }, allowPartial: true, holdReportCard: false, holdCertificate: false, isDefault: true };

afterEach(() => {
  cleanup();
  signOut();
  vi.unstubAllGlobals();
  for (const api of allApiSlices) store.dispatch(api.util.resetApiState());
});

describe("Fees > Fee structure", () => {
  it("lists the classes with what a new student pays, and the chosen class's fees with how often, who pays and what a year comes to", async () => {
    open("structure");
    expect(await screen.findByRole("heading", { name: "Fee structure", level: 1 })).toBeInTheDocument();
    const classes = within(await screen.findByRole("region", { name: "Classes" }).catch(() => screen.getByLabelText("Classes")));
    expect(classes.getByText("₹17,000")).toBeInTheDocument();
    expect(classes.getByText("Not set")).toBeInTheDocument();

    const table = await screen.findByRole("table", { name: "Fees of Class 1" });
    expect(within(table).getByText("Tuition fee")).toBeInTheDocument();
    expect(within(table).getByText("Every month")).toBeInTheDocument();
    expect(within(table).getByText("Once, when joining")).toBeInTheDocument();
    // The amount, and again what it comes to in a year.
    expect(within(table).getAllByText("₹5,000")).toHaveLength(2);
    expect(within(table).getByText("Optional")).toBeInTheDocument();
    expect(within(table).getByText("New students only")).toBeInTheDocument();
    // What the chart comes to for each kind of student.
    expect(screen.getByText("A new student pays")).toBeInTheDocument();
    expect(screen.getByText("₹5,000 of it when joining")).toBeInTheDocument();
    expect(screen.getByText("An existing student pays")).toBeInTheDocument();
    expect(screen.getByText("Optional extras")).toBeInTheDocument();
    // The transport fee comes from the route's stop, not from the class.
    expect(screen.getByText(/The transport fee is not here/)).toBeInTheDocument();
  });

  it("asks the server once, and shows another class by choosing it (no new request)", async () => {
    const { user } = open("structure");
    await screen.findByRole("table", { name: "Fees of Class 1" });
    expect(calls.current.map((c) => `${c.method} ${c.path}`)).toEqual(["GET /fees/structure"]);
    await user.click(screen.getByRole("button", { name: /Class 2/ }));
    expect(await screen.findByText("No fees for Class 2 yet")).toBeInTheDocument();
    expect(calls.current).toHaveLength(1);
  });

  it("says what to do first when the school has no fees in its list, and adds the usual fees (the common ones ticked) in one request", async () => {
    const { user } = open("structure", {
      "GET /fees/structure": () => ({ ...STRUCTURE, heads: [] }),
      "POST /fees/heads/many": (body) => ({ created: (body as { heads: unknown[] }).heads.length, skipped: 0, items: [] }),
    });
    expect(await screen.findByText("Start with the list of your fees")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Add the usual fees" }));
    const dialog = await screen.findByRole("dialog", { name: "Add the usual fees" });
    expect(within(dialog).getByRole("checkbox", { name: /Registration fee/ })).toBeChecked();
    expect(within(dialog).getByRole("checkbox", { name: /Tuition fee/ })).toBeChecked();
    expect(within(dialog).getByRole("checkbox", { name: /Caution money/ })).toBeChecked();
    expect(within(dialog).getByRole("checkbox", { name: /Uniform \(dress\)/ })).toBeChecked();
    expect(within(dialog).getByRole("checkbox", { name: /Re-admission fee/ })).not.toBeChecked();
    await user.click(within(dialog).getByRole("checkbox", { name: /Re-admission fee/ }));
    await user.click(within(dialog).getByRole("button", { name: /^Add \d+ fees$/ }));
    await vi.waitFor(() => expect(sent("POST", "/fees/heads/many")).toHaveLength(1));
    const heads = (sent("POST", "/fees/heads/many")[0].body as { heads: { name: string; kind: string; defaultFrequency: string; defaultAppliesTo: string; refundable: boolean }[] }).heads;
    expect(heads.find((h) => h.name === "Caution money")).toMatchObject({ kind: "deposit", defaultFrequency: "one_time", defaultAppliesTo: "new", refundable: true });
    expect(heads.find((h) => h.name === "Tuition fee")).toMatchObject({ kind: "tuition", defaultFrequency: "monthly" });
    expect(heads.some((h) => h.name === "Re-admission fee")).toBe(true);
  });

  it("Add fee: fills in how often and who pays from the fee, adds up the year as it is typed, and sends one request for every class ticked", async () => {
    const { user } = open("structure", { "POST /fees/structure/lines": () => ({ created: 2 }) });
    await screen.findByRole("table", { name: "Fees of Class 1" });
    // The page's own Add fee (the class's is the second).
    await user.click(screen.getAllByRole("button", { name: "Add fee" })[0]);
    const dialog = await screen.findByRole("dialog", { name: "Add fee" });
    // The transport fee is not offered: it comes from the stop.
    await user.click(within(dialog).getByRole("button", { name: /Choose the fee/ }));
    expect(screen.queryByRole("option", { name: "Bus fee" })).not.toBeInTheDocument();
    await user.click(await screen.findByRole("option", { name: "Tuition fee" }));
    expect(within(dialog).getByRole("radio", { name: "Monthly" })).toBeChecked();
    await user.type(within(dialog).getByLabelText(/^Amount/), "1200");
    expect(within(dialog).getByText("₹1,200 × 12 times = ₹14,400 a year")).toBeInTheDocument();
    // The class the page was on is ticked; another can be added.
    expect(within(dialog).getByRole("checkbox", { name: "Class 1" })).toBeChecked();
    await user.click(within(dialog).getByRole("checkbox", { name: "Class 2" }));
    await user.click(within(dialog).getByRole("button", { name: "Add fee" }));
    await vi.waitFor(() => expect(sent("POST", "/fees/structure/lines")).toHaveLength(1));
    expect(sent("POST", "/fees/structure/lines")[0].body).toMatchObject({
      classIds: ["c1", "c2"],
      headId: "h1",
      amount: 1200,
      frequency: "monthly",
      dueMonths: [4, 5, 6, 7, 8, 9, 10, 11, 12, 1, 2, 3],
      appliesTo: "all",
      optional: false,
    });
  });

  it("Add fee: a fee with no amount, no class or the wrong number of months says so and sends nothing", async () => {
    const { user } = open("structure");
    await screen.findByRole("table", { name: "Fees of Class 1" });
    // The page's own Add fee (the class's is the second).
    await user.click(screen.getAllByRole("button", { name: "Add fee" })[0]);
    const dialog = await screen.findByRole("dialog", { name: "Add fee" });
    await user.click(within(dialog).getByRole("checkbox", { name: "Class 1" }));
    await user.click(within(dialog).getByRole("button", { name: "Add fee" }));
    // "Choose the fee" is the box's own placeholder and now also the message under it.
    expect(await within(dialog).findAllByText("Choose the fee")).toHaveLength(2);
    expect(within(dialog).getByText("Choose at least one class")).toBeInTheDocument();
    expect(within(dialog).getByText("Enter an amount above 0")).toBeInTheDocument();
    // Quarterly needs four months.
    await user.click(within(dialog).getByRole("radio", { name: "Quarterly" }));
    await user.click(within(dialog).getByRole("checkbox", { name: "Jul" }));
    await user.click(within(dialog).getByRole("button", { name: "Add fee" }));
    expect(await within(dialog).findByText("Choose 4 months: the fee is charged four times a year")).toBeInTheDocument();
    expect(sent("POST", "/fees/structure/lines")).toHaveLength(0);
  });

  it("a one-time fee is for new students and has no months", async () => {
    const { user } = open("structure");
    await screen.findByRole("table", { name: "Fees of Class 1" });
    // The page's own Add fee (the class's is the second).
    await user.click(screen.getAllByRole("button", { name: "Add fee" })[0]);
    const dialog = await screen.findByRole("dialog", { name: "Add fee" });
    await user.click(within(dialog).getByRole("radio", { name: "Once, when joining" }));
    expect(within(dialog).queryByRole("list", { name: "Months it is charged in" })).not.toBeInTheDocument();
    expect(within(dialog).getByText(/New students only: a one-time fee is paid when the child joins/)).toBeInTheDocument();
    await user.type(within(dialog).getByLabelText(/^Amount/), "5000");
    expect(within(dialog).getByText("₹5,000, paid once")).toBeInTheDocument();
  });

  it("changes a line (one request), and takes one off after asking", async () => {
    const { user } = open("structure", {
      "PATCH /fees/structure/lines/l2": () => ({ ...CLASS_1.lines[1], amount: 1300 }),
      "DELETE /fees/structure/lines/l3": () => null,
    });
    await screen.findByRole("table", { name: "Fees of Class 1" });
    await user.click(screen.getByRole("button", { name: "Change Tuition fee" }));
    const dialog = await screen.findByRole("dialog", { name: "Change Tuition fee (Class 1)" });
    const amount = within(dialog).getByLabelText(/^Amount/);
    await user.clear(amount);
    await user.type(amount, "1300");
    await user.click(within(dialog).getByRole("button", { name: "Save" }));
    await vi.waitFor(() => expect(sent("PATCH", "/fees/structure/lines/l2")).toHaveLength(1));
    expect(sent("PATCH", "/fees/structure/lines/l2")[0].body).toMatchObject({ amount: 1300, frequency: "monthly", appliesTo: "all", optional: false });

    await user.click(screen.getByRole("button", { name: "Take Uniform off" }));
    const confirm = await screen.findByRole("dialog", { name: "Take Uniform off Class 1?" });
    expect(sent("DELETE", "/fees/structure/lines/l3")).toHaveLength(0);
    await user.click(within(confirm).getByRole("button", { name: "Take it off" }));
    await vi.waitFor(() => expect(sent("DELETE", "/fees/structure/lines/l3")).toHaveLength(1));
  });

  it("shows the warning the server gives about a class's fee chart", async () => {
    open("structure", { "GET /fees/structure": () => ({ ...STRUCTURE, classes: [{ ...CLASS_1, warnings: ["The development fee is 17% of the tuition fee. The Supreme Court allows up to 15% (some states set a lower limit)."] }, CLASS_2] }) });
    expect(await screen.findByText(/The development fee is 17% of the tuition fee/)).toBeInTheDocument();
  });

  it("Copy fees from last session says a raise above 10% may need the fee committee's approval, and sends the percentage", async () => {
    const { user } = open("structure", { "POST /fees/structure/copy-year": () => ({ added: 3, skipped: 0, from: "2025-2026", raisePercent: 12 }) });
    await screen.findByRole("table", { name: "Fees of Class 1" });
    await user.click(screen.getByRole("button", { name: "Copy fees" }));
    const dialog = await screen.findByRole("dialog", { name: "Copy fees" });
    await user.click(within(dialog).getByRole("radio", { name: "Last session's fees" }));
    const raise = within(dialog).getByLabelText(/^Raise every amount/);
    await user.clear(raise);
    await user.type(raise, "8");
    expect(within(dialog).queryByText(/needs the fee committee's approval/)).not.toBeInTheDocument();
    await user.clear(raise);
    await user.type(raise, "12");
    expect(within(dialog).getByText(/More than 10% over last year needs the fee committee's approval/)).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Copy" }));
    await vi.waitFor(() => expect(sent("POST", "/fees/structure/copy-year")).toHaveLength(1));
    expect(sent("POST", "/fees/structure/copy-year")[0].body).toMatchObject({ raisePercent: 12 });
  });

  it("copies one class's fees to other classes", async () => {
    const { user } = open("structure", { "POST /fees/structure/copy-class": () => ({ added: 3, replaced: 0, skipped: 0 }) });
    await screen.findByRole("table", { name: "Fees of Class 1" });
    await user.click(screen.getByRole("button", { name: "Copy to other classes" }));
    const dialog = await screen.findByRole("dialog", { name: "Copy fees" });
    await user.click(within(dialog).getByRole("checkbox", { name: "Class 2" }));
    await user.click(within(dialog).getByRole("button", { name: "Copy" }));
    await vi.waitFor(() => expect(sent("POST", "/fees/structure/copy-class")).toHaveLength(1));
    expect(sent("POST", "/fees/structure/copy-class")[0].body).toMatchObject({ fromClassId: "c1", toClassIds: ["c2"], replace: false });
  });

  it("a person who may only look sees the fees and no button that changes them", async () => {
    open("structure", {}, { role: "accountant", permissions: ["fees.view"] });
    await screen.findByRole("table", { name: "Fees of Class 1" });
    expect(screen.queryByRole("button", { name: "Add fee" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Copy fees" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Change Tuition fee" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Take Tuition fee off" })).not.toBeInTheDocument();
  });

  it("the upcoming session can be chosen and set up before it starts", async () => {
    const { user } = open("structure", {
      "GET /fees/structure": (_, query) =>
        query.get("yearId") === "y2"
          ? { ...STRUCTURE, year: { id: "y2", name: "2027-2028", status: "pending", startMonth: 4 }, years: [{ id: "y1", name: "2026-2027", status: "active" }, { id: "y2", name: "2027-2028", status: "pending" }], classes: [CLASS_2, { ...CLASS_2, id: "c3", name: "Class 3" }] }
          : { ...STRUCTURE, years: [{ id: "y1", name: "2026-2027", status: "active" }, { id: "y2", name: "2027-2028", status: "pending" }] },
    });
    await screen.findByRole("table", { name: "Fees of Class 1" });
    await user.click(screen.getByRole("button", { name: /2026-2027/ }));
    await user.click(await screen.findByRole("option", { name: "2027-2028 (upcoming)" }));
    expect(await screen.findByText("Setting up 2027-2028, the upcoming session")).toBeInTheDocument();
    expect(calls.current.some((c) => c.path === "/fees/structure" && c.query.includes("yearId=y2"))).toBe(true);
  });
});

describe("Fees > Fee heads", () => {
  it("lists the school's fees with what each is about, how it is usually charged and who usually pays; only a fee not in use can be deleted", async () => {
    open("heads");
    const table = await screen.findByRole("table", { name: "Fees" });
    expect(within(table).getByText("Tuition fee")).toBeInTheDocument();
    expect(within(table).getAllByText("Optional").length).toBeGreaterThan(0);
    expect(within(table).getAllByText("New students only").length).toBeGreaterThan(0);
    expect(screen.queryByRole("button", { name: "Delete Tuition fee" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Delete Admission fee" })).toBeInTheDocument();
  });

  it("Add a fee: needs a name and what it is about, and sends nothing until it has them", async () => {
    const { user } = open("heads", { "POST /fees/heads": () => ({ ...UNIFORM, id: "h9" }) });
    await screen.findByRole("table", { name: "Fees" });
    await user.click(screen.getByRole("button", { name: "Add a fee" }));
    const dialog = await screen.findByRole("dialog", { name: "Add a fee" });
    await user.click(within(dialog).getByRole("button", { name: "Add fee" }));
    expect(await within(dialog).findByText("Enter the name of the fee")).toBeInTheDocument();
    expect(within(dialog).getByText("Choose what the fee is about")).toBeInTheDocument();
    expect(sent("POST", "/fees/heads")).toHaveLength(0);
    await user.type(within(dialog).getByLabelText(/^Name of the fee/), "Lab fee");
    await user.click(within(dialog).getByRole("button", { name: /^Choose What it is about/ }));
    await user.click(await screen.findByRole("option", { name: "Facilities and activities" }));
    await user.click(within(dialog).getByRole("button", { name: "Add fee" }));
    await vi.waitFor(() => expect(sent("POST", "/fees/heads")).toHaveLength(1));
    expect(sent("POST", "/fees/heads")[0].body).toMatchObject({ name: "Lab fee", kind: "facility", defaultFrequency: "yearly", defaultAppliesTo: "all" });
  });

  it("deletes a fee after asking", async () => {
    const { user } = open("heads", { "DELETE /fees/heads/h2": () => null });
    await screen.findByRole("table", { name: "Fees" });
    await user.click(screen.getByRole("button", { name: "Delete Admission fee" }));
    const confirm = await screen.findByRole("dialog", { name: "Delete Admission fee?" });
    await user.click(within(confirm).getByRole("button", { name: "Delete" }));
    await vi.waitFor(() => expect(sent("DELETE", "/fees/heads/h2")).toHaveLength(1));
  });

  it("says why a fee cannot be added twice, in the server's words", async () => {
    const { user } = open("heads", { "POST /fees/heads": refuse(409, "Tuition fee is already in your list of fees.", [{ path: "name", message: "Another fee has this name" }]) });
    await screen.findByRole("table", { name: "Fees" });
    await user.click(screen.getByRole("button", { name: "Add a fee" }));
    const dialog = await screen.findByRole("dialog", { name: "Add a fee" });
    await user.type(within(dialog).getByLabelText(/^Name of the fee/), "Tuition fee");
    await user.click(within(dialog).getByRole("button", { name: /^Choose What it is about/ }));
    await user.click(await screen.findByRole("option", { name: "Tuition" }));
    await user.click(within(dialog).getByRole("button", { name: "Add fee" }));
    expect(await within(dialog).findByText("Another fee has this name")).toBeInTheDocument();
  });
});

describe("Fees > Concessions", () => {
  const SIBLING: Concession = { id: "k1", name: "Sibling concession", basis: "sibling", mode: "percent", value: 10, appliesTo: "selected", headIds: ["h1"], headNames: ["Tuition fee"], needsApproval: false, notes: "From the second child", isActive: true };
  const RTE: Concession = { id: "k2", name: "RTE free seat", basis: "rte", mode: "percent", value: 100, appliesTo: "all", headIds: [], headNames: [], needsApproval: true, notes: null, isActive: true };

  it("lists each concession with what it takes off, why it is given and whether it needs approval", async () => {
    open("concessions", { "GET /fees/concessions": () => ({ items: [SIBLING, RTE] }) });
    const list = await screen.findByRole("list", { name: "Concessions" });
    expect(within(list).getByText("10% off Tuition fee")).toBeInTheDocument();
    expect(within(list).getByText("100% off every fee")).toBeInTheDocument();
    expect(within(list).getByText("Brother or sister")).toBeInTheDocument();
    expect(within(list).getByText("RTE free seat", { selector: "span" })).toBeInTheDocument();
    expect(within(list).getByText("No approval needed")).toBeInTheDocument();
    expect(within(list).getByText("Needs approval")).toBeInTheDocument();
  });

  it("Add a concession: says what is missing, and a percentage above 100 is refused on screen", async () => {
    const { user } = open("concessions", { "POST /fees/concessions": () => SIBLING });
    await screen.findByText("No concessions yet");
    await user.click(screen.getAllByRole("button", { name: "Add a concession" })[0]);
    const dialog = await screen.findByRole("dialog", { name: "Add a concession" });
    await user.click(within(dialog).getByRole("button", { name: "Add concession" }));
    expect(await within(dialog).findByText("Enter the name of the concession")).toBeInTheDocument();
    expect(within(dialog).getByText("Choose why it is given")).toBeInTheDocument();
    expect(within(dialog).getByText("Enter a value above 0")).toBeInTheDocument();
    await user.type(within(dialog).getByLabelText(/^Percentage/), "150");
    await user.click(within(dialog).getByRole("button", { name: "Add concession" }));
    expect(await within(dialog).findByText("A percentage cannot be more than 100")).toBeInTheDocument();
    expect(sent("POST", "/fees/concessions")).toHaveLength(0);
  });

  it("deletes a concession after asking", async () => {
    const { user } = open("concessions", { "GET /fees/concessions": () => ({ items: [RTE] }), "DELETE /fees/concessions/k2": () => null });
    await screen.findByRole("list", { name: "Concessions" });
    await user.click(screen.getByRole("button", { name: "Delete RTE free seat" }));
    await user.click(within(await screen.findByRole("dialog", { name: "Delete RTE free seat?" })).getByRole("button", { name: "Delete" }));
    await vi.waitFor(() => expect(sent("DELETE", "/fees/concessions/k2")).toHaveLength(1));
  });
});

describe("Fees > Fee rules", () => {
  it("starts with the usual rules, and Save is only for a change", async () => {
    const { user } = open("rules", { "PUT /fees/rules": (body) => ({ ...(body as object), isDefault: false }) });
    expect(await screen.findByLabelText(/^Fees are due on day/)).toHaveValue(10);
    expect(screen.getByRole("radio", { name: "No late fine" })).toBeChecked();
    expect(screen.queryByLabelText(/^Fine/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();

    await user.click(screen.getByRole("radio", { name: "An amount for each day late" }));
    await user.type(screen.getByLabelText(/^Fine for each day/), "10");
    await user.type(screen.getByLabelText(/^Most a family pays/), "500");
    const day = screen.getByLabelText(/^Fees are due on day/);
    await user.clear(day);
    await user.type(day, "5");
    await user.click(screen.getByRole("switch", { name: /Hold the report card/ }));
    await user.click(screen.getByRole("button", { name: "Save" }));
    await vi.waitFor(() => expect(sent("PUT", "/fees/rules")).toHaveLength(1));
    expect(sent("PUT", "/fees/rules")[0].body).toEqual({
      dueDay: 5,
      graceDays: 0,
      lateFine: { mode: "per_day", amount: 10, maxAmount: 500 },
      allowPartial: true,
      holdReportCard: true,
      holdCertificate: false,
    });
  });

  it("a late fine with no amount, and a due day past 28, say so and send nothing", async () => {
    const { user } = open("rules");
    await screen.findByLabelText(/^Fees are due on day/);
    await user.click(screen.getByRole("radio", { name: "One flat amount" }));
    const day = screen.getByLabelText(/^Fees are due on day/);
    await user.clear(day);
    await user.type(day, "31");
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText("The due day is 1 to 28")).toBeInTheDocument();
    expect(screen.getByText("Enter the fine")).toBeInTheDocument();
    expect(sent("PUT", "/fees/rules")).toHaveLength(0);
  });

  it("a person who may only look cannot change the rules", async () => {
    open("rules", {}, { role: "accountant", permissions: ["fees.view"] });
    expect(await screen.findByLabelText(/^Fees are due on day/)).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Save" })).not.toBeInTheDocument();
  });
});
