import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { Provider } from "react-redux";
import { RouterProvider, createMemoryRouter } from "react-router";
import { ToastProvider } from "../../../components/ui/toast-context";
import { allApiSlices } from "../../../redux/api/apiRoot";
import store from "../../../redux/store";
import { fakeApi, type Handler } from "../../../test/fakeApi";
import { signInAs, signOut } from "../../../test/session";
import type { ChildBus, ChildDetail, ChildFees } from "../../../types";
import ChildPage from "../ChildPage";

// The map itself (Leaflet) needs a real browser; what is tested is what the parent's page gives it and says.
vi.mock("../../../components/transport/LiveMap", () => ({
  LiveMap: (props: { vehicles: { item: { number: string }; stamped: { position: { lat: number; lng: number } } }[]; follow?: boolean }) => (
    <div data-testid="map" data-follow={String(props.follow)}>
      {props.vehicles.map((v) => `${v.item.number}@${v.stamped.position.lat},${v.stamped.position.lng}`).join(";")}
    </div>
  ),
}));

/** A parent's page of one child: the school bus and the fee chart, each shown, and asked for, only when the school allowed it. */

const ASHA: ChildDetail = {
  id: "s1",
  name: "Asha Verma",
  firstName: "Asha",
  lastName: "Verma",
  admissionNumber: "ADM-2026-0001",
  gender: "Female",
  dateOfBirth: "2018-05-14",
  admissionDate: "2026-04-01",
  bloodGroup: null,
  category: null,
  place: { className: "Class 5", sectionName: "A", rollNumber: 12, label: "Class 5 - A" },
  classTeacher: { name: "Meena Singh" },
  address: { line1: "12 MG Road", line2: null, city: "Bhopal", state: "Madhya Pradesh", pincode: "462001" },
  previousSchool: null,
  records: {},
  guardians: [],
};

const BUS: ChildBus = {
  assigned: true,
  route: { name: "Route 1", morningStart: "07:00", afternoonStart: "14:15" },
  stop: { name: "Arera Colony", pickupTime: "07:10", dropTime: "14:40", fee: 900 },
  vehicle: { number: "Bus 1", registrationNumber: "MP09 AB 1234" },
  driver: { name: "Ramesh Yadav", mobile: "9876543210" },
  attendant: null,
  tracking: { enabled: true, live: { lat: 23.26, lng: 77.41, speedKmph: 28.4, heading: 90, recordedAt: "2026-11-19T08:00:00.000Z", ageSeconds: 4 }, lastSeenSeconds: 4 },
};

const NO_ACCOUNT: ChildFees["account"] = null;
const FEES: ChildFees = {
  account: NO_ACCOUNT,
  year: { name: "2026-2027", startMonth: 4 },
  rules: { dueDay: 5, graceDays: 3, lateFine: { mode: "flat", amount: 100, maxAmount: null }, allowPartial: true },
  className: "Class 5 - A",
  audience: "new",
  chart: {
    lines: [
      { id: "l1", headName: "Admission fee", kind: "admission", amount: 5000, frequency: "one_time", dueMonths: [], appliesTo: "new", optional: false, refundable: false, notes: null, yearly: 5000 },
      { id: "l2", headName: "Caution money", kind: "deposit", amount: 2000, frequency: "one_time", dueMonths: [], appliesTo: "new", optional: false, refundable: true, notes: null, yearly: 2000 },
      { id: "l3", headName: "Tuition fee", kind: "tuition", amount: 1000, frequency: "monthly", dueMonths: [4, 5, 6, 7, 8, 9, 10, 11, 12, 1, 2, 3], appliesTo: "all", optional: false, refundable: false, notes: null, yearly: 12000 },
      { id: "l4", headName: "Uniform", kind: "supplies", amount: 1500, frequency: "yearly", dueMonths: [4], appliesTo: "all", optional: true, refundable: false, notes: null, yearly: 1500 },
    ],
    compulsory: 19000,
    optional: 1500,
    refundable: 2000,
  },
  transport: { route: "Route 1", stop: "Arera Colony", monthlyFee: 900 },
};

const ACCOUNT: NonNullable<ChildFees["account"]> = {
  charges: [
    { id: "c1", label: "Tuition fee · Apr", headName: "Tuition fee", kind: "tuition", source: "chart", lineId: "l1", dueDate: "2026-04-10", amount: 1000, concession: 100, net: 900, paid: 900, outstanding: 0, status: "paid" },
    { id: "c2", label: "Tuition fee · May", headName: "Tuition fee", kind: "tuition", source: "chart", lineId: "l1", dueDate: "2026-05-10", amount: 1000, concession: 100, net: 900, paid: 0, outstanding: 900, status: "overdue" },
    { id: "c3", label: "Tuition fee · Jan", headName: "Tuition fee", kind: "tuition", source: "chart", lineId: "l1", dueDate: "2027-01-10", amount: 1000, concession: 100, net: 900, paid: 0, outstanding: 900, status: "upcoming" },
  ],
  totals: { amount: 17000, concession: 1200, net: 15800, paid: 900, outstanding: 14900, dueNow: 900, overdue: 900 },
  lateFineToday: 100,
  concessions: [{ id: "g1", name: "Sibling", mode: "percent", value: 10 }],
  receipts: [{ id: "r1", number: "2026-2027/0001", paidOn: "2026-11-02", total: 900, mode: "upi", status: "valid" }],
};

function openPage(permissions: string[], extra: Record<string, Handler> = {}) {
  signInAs("parent", permissions);
  const calls = fakeApi({ "GET /parent/children/s1": () => ASHA, "GET /parent/children/s1/bus": () => BUS, "GET /parent/children/s1/fees": () => FEES, ...extra });
  const router = createMemoryRouter([{ path: "/my-children/:id", element: <ChildPage /> }], { initialEntries: ["/my-children/s1"] });
  render(
    <Provider store={store}>
      <ToastProvider>
        <RouterProvider router={router} />
      </ToastProvider>
    </Provider>,
  );
  return calls;
}
const bus = () => screen.findByRole("region", { name: "School bus" });
const fees = () => screen.findByRole("region", { name: "Fees" });

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  signOut();
  for (const slice of allApiSlices) store.dispatch(slice.util.resetApiState());
});

describe("the child's school bus", () => {
  it("says the child is not on a route, and what to do", async () => {
    openPage(["child.transport"], { "GET /parent/children/s1/bus": () => ({ assigned: false }) });
    expect(await within(await bus()).findByText(/not on a school bus route/)).toBeInTheDocument();
  });

  it("shows the route, the stop and its times, the vehicle, and who drives with a number to call", async () => {
    openPage(["child.transport"]);
    const card = await bus();
    expect(await within(card).findByText("Route 1")).toBeInTheDocument();
    expect(within(card).getByText("Bus 1 · MP09 AB 1234")).toBeInTheDocument();
    expect(within(card).getByText("Arera Colony")).toBeInTheDocument();
    expect(within(card).getByText("Picks up 7:10 am · Drops 2:40 pm")).toBeInTheDocument();
    expect(within(card).getByRole("link", { name: "Call Ramesh Yadav" })).toHaveAttribute("href", "tel:9876543210");
    // No attendant on this route.
    expect(within(card).getByText("None yet")).toBeInTheDocument();
  });

  it("while the bus is live it says so with its speed and shows a map that follows it", async () => {
    openPage(["child.transport"]);
    const card = await bus();
    expect(await within(card).findByText("On the way")).toBeInTheDocument();
    expect(within(card).getByText(/28 km\/h · updated just now/)).toBeInTheDocument();
    const map = await within(card).findByTestId("map");
    expect(map).toHaveTextContent("Bus 1@23.26,77.41");
    expect(map).toHaveAttribute("data-follow", "true");
  });

  it("when the bus is not out it shows no map and no place, only when it was last seen", async () => {
    openPage(["child.transport"], { "GET /parent/children/s1/bus": () => ({ ...BUS, tracking: { enabled: true, live: null, lastSeenSeconds: 3 * 3600 } }) });
    const card = await bus();
    expect(await within(card).findByText("Not running now")).toBeInTheDocument();
    expect(within(card).getByText("Last seen 3 hr ago.")).toBeInTheDocument();
    expect(within(card).queryByTestId("map")).not.toBeInTheDocument();
  });

  it("a bus whose driver has not started a trip is 'Not started', and one with tracking off says the school has not turned it on", async () => {
    openPage(["child.transport"], { "GET /parent/children/s1/bus": () => ({ ...BUS, tracking: { enabled: true, live: null, lastSeenSeconds: null } }) });
    expect(await within(await bus()).findByText("Not started")).toBeInTheDocument();
    cleanup();
    for (const slice of allApiSlices) store.dispatch(slice.util.resetApiState());
    openPage(["child.transport"], { "GET /parent/children/s1/bus": () => ({ ...BUS, tracking: { enabled: false, live: null, lastSeenSeconds: null } }) });
    const card = await bus();
    expect(await within(card).findByText("Tracking is off")).toBeInTheDocument();
    expect(within(card).queryByTestId("map")).not.toBeInTheDocument();
  });

  it("a stop the school renamed since is not made up: the page says the school will tell the stop", async () => {
    openPage(["child.transport"], { "GET /parent/children/s1/bus": () => ({ ...BUS, stop: null }) });
    const card = await bus();
    expect(await within(card).findByText("The school will tell you the stop")).toBeInTheDocument();
    // With no stop the route's own times are what is known.
    expect(within(card).getByText("Leaves 7:00 am · Back 2:15 pm")).toBeInTheDocument();
  });

  it("says why when the school's server refuses", async () => {
    openPage(["child.transport"], { "GET /parent/children/s1/bus": () => new Response(JSON.stringify({ success: false, message: "Student not found" }), { status: 404, headers: { "Content-Type": "application/json" } }) });
    expect(await within(await bus()).findByText("Student not found")).toBeInTheDocument();
  });
});

describe("the child's fee chart", () => {
  it("says fees are paid at the school office and shows the school's chart for the class", async () => {
    openPage(["child.fees"]);
    const card = await fees();
    expect(await within(card).findByText(/Fees are paid at the school office\. Below is the school's fee chart for Class 5 - A, 2026-2027/)).toBeInTheDocument();
    expect(within(card).queryByRole("group", { name: "Fee account" })).not.toBeInTheDocument();
  });

  it("shows the child's account: what is owed, paid, due and late, each instalment's standing, the concession in force and the receipts", async () => {
    openPage(["child.fees"], { "GET /parent/children/s1/fees": () => ({ ...FEES, account: ACCOUNT }) });
    const account = await within(await fees()).findByRole("group", { name: "Fee account" });
    const totals = within(account.querySelector("dl") as HTMLElement);
    const number = (label: string) => totals.getByText(label).parentElement!;
    expect(number("Fees this session")).toHaveTextContent("₹15,800");
    expect(number("Fees this session")).toHaveTextContent("After ₹1,200 concession");
    expect(number("Paid")).toHaveTextContent("₹900");
    expect(number("Due now")).toHaveTextContent("₹900");
    expect(number("Late")).toHaveTextContent("₹900");
    expect(number("Late")).toHaveTextContent("Late fine ₹100 if paid today");
    const apr = within(account).getByRole("row", { name: /Tuition fee · Apr/ });
    expect(within(apr).getByText("Paid")).toBeInTheDocument();
    const may = within(account).getByRole("row", { name: /Tuition fee · May/ });
    expect(within(may).getByText("Late")).toBeInTheDocument();
    expect(within(may).getByText("₹100 off")).toBeInTheDocument();
    expect(within(account).getByText(/Sibling \(10% off\)/)).toBeInTheDocument();
    expect(within(account).getByText("2026-2027/0001")).toBeInTheDocument();
    expect(within(account).getByText(/UPI/)).toBeInTheDocument();
    expect(await within(await fees()).findByText(/what you pay shows above, with its receipt/)).toBeInTheDocument();
  });

  it("an account with no payment yet says so", async () => {
    openPage(["child.fees"], { "GET /parent/children/s1/fees": () => ({ ...FEES, account: { ...ACCOUNT, receipts: [], concessions: [] } }) });
    expect(await within(await fees()).findByText("No payment has been taken yet.")).toBeInTheDocument();
  });

  it("lists each fee with its amount, how often and what it comes to for the year, and says which are optional or given back", async () => {
    openPage(["child.fees"]);
    const table = await within(await fees()).findByRole("table", { name: "Fees of Class 5 - A" });
    const row = (name: string) => within(table).getByRole("row", { name: new RegExp(name) });
    expect(within(row("Admission fee")).getByText("Once, when joining")).toBeInTheDocument();
    expect(within(row("Tuition fee")).getByText("Every month")).toBeInTheDocument();
    expect(within(row("Tuition fee")).getByText("₹12,000")).toBeInTheDocument();
    expect(within(row("Caution money")).getByText("Given back")).toBeInTheDocument();
    expect(within(row("Uniform")).getByText("Optional")).toBeInTheDocument();
  });

  it("gives the totals, the bus fee of the stop (kept out of the totals), and the due rules", async () => {
    openPage(["child.fees"]);
    const card = await fees();
    const total = (await within(card).findByText("Compulsory fees for the year")).parentElement!;
    expect(total).toHaveTextContent("₹19,000");
    expect(within(card).getByText("Optional, if you choose them").parentElement).toHaveTextContent("₹1,500");
    expect(within(card).getByText("Of it, given back when the child leaves").parentElement).toHaveTextContent("₹2,000");
    expect(within(card).getByText(/₹900 a month. It is not in the totals above/)).toBeInTheDocument();
    expect(within(card).getByText(/Due on the 5th of the month. 3 days to pay without a fine. Late fine: ₹100. Part payment is allowed./)).toBeInTheDocument();
  });

  it("says so when the school has set up no fees for the class", async () => {
    openPage(["child.fees"], { "GET /parent/children/s1/fees": () => ({ ...FEES, chart: { lines: [], compulsory: 0, optional: 0, refundable: 0 }, transport: null }) });
    expect(await within(await fees()).findByText(/has not set up the fees for this class yet/)).toBeInTheDocument();
  });
});

describe("what the school allowed", () => {
  it("without the permissions the page shows neither part and does not ask the server for them", async () => {
    const calls = openPage(["child.attendance"]);
    await screen.findByRole("heading", { name: "Asha Verma", level: 1 });
    expect(screen.queryByRole("region", { name: "School bus" })).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Fees" })).not.toBeInTheDocument();
    expect(calls.some((c) => c.path.endsWith("/bus") || c.path.endsWith("/fees"))).toBe(false);
  });

  it("each part has its own permission", async () => {
    openPage(["child.fees"]);
    expect(await fees()).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "School bus" })).not.toBeInTheDocument();
  });
});
