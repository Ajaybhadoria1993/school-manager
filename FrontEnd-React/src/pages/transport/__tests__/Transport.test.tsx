import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Provider } from "react-redux";
import { RouterProvider, createMemoryRouter } from "react-router";
import { ToastProvider } from "../../../components/ui/toast-context";
import { clock, paperWords } from "../../../utils/transport";
import { allApiSlices } from "../../../redux/api/apiRoot";
import store from "../../../redux/store";
import { fakeApi, type Call, type Handler } from "../../../test/fakeApi";
import { signInAs, signOut } from "../../../test/session";
import type { CrewMember, TransportRoute, TransportSummary, UserRole, Vehicle } from "../../../types";
import DriversPage from "../Drivers";
import RoutesPage from "../Routes";
import VehiclesPage from "../Vehicles";

const paper = (key: string, label: string, status: "ok" | "soon" | "expired" | "missing", expiry: string | null, daysLeft: number | null) => ({ key, label, expiry, status, daysLeft });
const BUS: Vehicle = {
  id: "v1",
  number: "Bus 1",
  registrationNumber: "MP09 AB 1234",
  type: "bus",
  typeLabel: "Bus",
  seats: 40,
  model: "Tata Starbus",
  insuranceExpiry: "2027-06-30",
  fitnessExpiry: "2026-11-20",
  pollutionExpiry: "2026-11-07",
  permitExpiry: null,
  notes: null,
  isActive: true,
  papers: [
    paper("insuranceExpiry", "Insurance", "ok", "2027-06-30", 232),
    paper("fitnessExpiry", "Fitness certificate", "soon", "2026-11-20", 10),
    paper("pollutionExpiry", "Pollution (PUC)", "expired", "2026-11-07", -3),
    paper("permitExpiry", "Permit", "missing", null, null),
  ],
  routes: ["Route 1 - Arera Colony"],
};
const RAMESH: CrewMember = {
  id: "d1",
  name: "Ramesh Yadav",
  role: "driver",
  mobile: "9876543210",
  emergencyMobile: "9876500000",
  licenseNumber: "MP0920110012345",
  licenseExpiry: "2026-11-15",
  license: paper("licenseExpiry", "Licence", "soon", "2026-11-15", 5),
  address: null,
  joiningDate: "2024-04-01",
  notes: null,
  isActive: true,
  routes: ["Route 1 - Arera Colony"],
};
const SUNITA: CrewMember = { ...RAMESH, id: "d2", name: "Sunita Bai", role: "attendant", mobile: "9876543211", emergencyMobile: null, licenseNumber: null, licenseExpiry: null, license: null, joiningDate: null, routes: [] };
const ROUTE: TransportRoute = {
  id: "r1",
  name: "Route 1 - Arera Colony",
  vehicleId: "v1",
  vehicle: { id: "v1", number: "Bus 1", registrationNumber: "MP09 AB 1234", seats: 40, isActive: true },
  driverId: "d1",
  driver: { id: "d1", name: "Ramesh Yadav", mobile: "9876543210", isActive: true },
  attendantId: null,
  attendant: null,
  morningStart: "07:00",
  afternoonStart: "14:30",
  stops: [
    { name: "Arera Colony", pickupTime: "07:10", dropTime: "14:40", fee: 800 },
    { name: "Shahpura", pickupTime: "07:25", dropTime: null, fee: null },
  ],
  notes: null,
  isActive: true,
};
const SUMMARY: TransportSummary = {
  vehicles: { total: 1, seats: 40, inactive: 0 },
  drivers: { total: 1, attendants: 1 },
  routes: { total: 1, stops: 2, withoutVehicle: 0, withoutDriver: 0 },
  attention: [
    { kind: "vehicle", id: "v1", who: "Bus 1 (MP09 AB 1234)", what: "Pollution (PUC)", expiry: "2026-11-07", status: "expired", daysLeft: -3 },
    { kind: "vehicle", id: "v1", who: "Bus 1 (MP09 AB 1234)", what: "Fitness certificate", expiry: "2026-11-20", status: "soon", daysLeft: 10 },
    { kind: "driver", id: "d1", who: "Ramesh Yadav", what: "Licence", expiry: "2026-11-15", status: "soon", daysLeft: 5 },
  ],
  attentionCount: 3,
};

function open(page: "vehicles" | "drivers" | "routes", extra: Record<string, Handler> = {}, who: { role?: UserRole; permissions?: string[] } = {}) {
  signInAs(who.role ?? "school_admin", who.permissions);
  const calls = fakeApi({
    "GET /transport/summary": () => SUMMARY,
    "GET /transport/vehicles": () => ({ items: [BUS] }),
    "GET /transport/drivers": () => ({ items: [RAMESH, SUNITA] }),
    "GET /transport/routes": () => ({ items: [ROUTE] }),
    ...extra,
  });
  const element = page === "vehicles" ? <VehiclesPage /> : page === "drivers" ? <DriversPage /> : <RoutesPage />;
  const router = createMemoryRouter([{ path: "/transport/:page", element }], { initialEntries: [`/transport/${page}`] });
  render(
    <Provider store={store}>
      <ToastProvider>
        <RouterProvider router={router} />
      </ToastProvider>
    </Provider>
  );
  return { calls, user: userEvent.setup() };
}
const posted = (calls: Call[], method: string, path: string) => calls.filter((c) => c.method === method && c.path === path);
const refuse = (status: number, message: string, details: object[] = []) => () => new Response(JSON.stringify({ success: false, message, details }), { status, headers: { "Content-Type": "application/json" } });

afterEach(() => {
  cleanup();
  signOut();
  vi.unstubAllGlobals();
  for (const api of allApiSlices) store.dispatch(api.util.resetApiState());
});

describe("how a paper is said", () => {
  it("in words: valid till, ends in, ended, not given; and a time of day as am or pm", () => {
    expect(paperWords({ status: "ok", expiry: "2027-06-30", daysLeft: 232 })).toBe("Valid till 30 Jun 2027");
    expect(paperWords({ status: "soon", expiry: "2026-11-20", daysLeft: 10 })).toBe("Ends in 10 days");
    expect(paperWords({ status: "soon", expiry: "2026-11-11", daysLeft: 1 })).toBe("Ends in 1 day");
    expect(paperWords({ status: "soon", expiry: "2026-11-10", daysLeft: 0 })).toBe("Ends today");
    expect(paperWords({ status: "expired", expiry: "2026-11-07", daysLeft: -3 })).toBe("Ended 3 days ago");
    expect(paperWords({ status: "missing", expiry: null, daysLeft: null })).toBe("Not given");
    expect([clock("07:10"), clock("12:00"), clock("00:05"), clock("14:30"), clock(null)]).toEqual(["7:10 am", "12:00 pm", "12:05 am", "2:30 pm", ""]);
  });
});

describe("Transport > Vehicles", () => {
  it("lists each vehicle with its plate, kind, seats, routes and how each paper stands, and says which papers to renew", async () => {
    open("vehicles");
    expect(await screen.findByRole("heading", { name: "Vehicles", level: 1 })).toBeInTheDocument();
    const table = await screen.findByRole("table", { name: "Vehicles" });
    expect(within(table).getByText("Bus 1")).toBeInTheDocument();
    expect(within(table).getByText("MP09 AB 1234")).toBeInTheDocument();
    expect(within(table).getByText("Tata Starbus")).toBeInTheDocument();
    expect(within(table).getByText("Route 1 - Arera Colony")).toBeInTheDocument();
    const papers = within(screen.getByRole("list", { name: "Papers of Bus 1" }));
    expect(papers.getByText("Valid till 30 Jun 2027")).toBeInTheDocument();
    expect(papers.getByText("Ends in 10 days")).toBeInTheDocument();
    expect(papers.getByText("Ended 3 days ago")).toBeInTheDocument();
    expect(papers.getByText("Not given")).toBeInTheDocument();
    // Only the vehicles' papers are said here (the driver's licence is on the Drivers page).
    const renew = await screen.findByLabelText("Papers to renew");
    expect(within(renew).getByText("2 papers to renew")).toBeInTheDocument();
    expect(within(renew).queryByText("Ramesh Yadav")).not.toBeInTheDocument();
  });

  it("asks the server once for the list and once for the numbers, and again for what the search says", async () => {
    const { calls, user } = open("vehicles");
    await screen.findByRole("table", { name: "Vehicles" });
    expect(calls.map((c) => `${c.method} ${c.path}`).sort()).toEqual(["GET /transport/summary", "GET /transport/vehicles"]);
    await user.type(screen.getByRole("searchbox", { name: /Search by number/ }), "starbus");
    await vi.waitFor(() => expect(calls.some((c) => c.path === "/transport/vehicles" && c.query.includes("search=starbus"))).toBe(true));
  });

  it("Add vehicle: the boxes that must be filled say so and nothing is sent; filled, one request, and a note says it is added", async () => {
    const { calls, user } = open("vehicles", { "POST /transport/vehicles": () => ({ ...BUS, id: "v2", number: "Bus 2" }) });
    await screen.findByRole("table", { name: "Vehicles" });
    await user.click(screen.getByRole("button", { name: "Add vehicle" }));
    const dialog = await screen.findByRole("dialog", { name: "Add vehicle" });
    await user.click(within(dialog).getByRole("button", { name: "Add vehicle" }));
    expect(await within(dialog).findByText("Enter the vehicle number (like Bus 1)")).toBeInTheDocument();
    expect(within(dialog).getByText("Enter the registration number")).toBeInTheDocument();
    expect(within(dialog).getByText("Enter the seats")).toBeInTheDocument();
    expect(posted(calls, "POST", "/transport/vehicles")).toHaveLength(0);

    await user.type(within(dialog).getByLabelText(/^Vehicle number/), "Bus 2");
    await user.type(within(dialog).getByLabelText(/^Registration number/), "mp09 cd 5678");
    await user.type(within(dialog).getByLabelText(/^Seats/), "30");
    await user.type(within(dialog).getByLabelText(/^Insurance/), "2027-03-31");
    await user.click(within(dialog).getByRole("button", { name: "Add vehicle" }));
    expect(await screen.findByText("Vehicle added")).toBeInTheDocument();
    const sent = posted(calls, "POST", "/transport/vehicles");
    expect(sent).toHaveLength(1);
    expect(sent[0].body).toMatchObject({ number: "Bus 2", registrationNumber: "MP09 CD 5678", seats: 30, type: "bus", insuranceExpiry: "2027-03-31", fitnessExpiry: "" });
  });

  it("a plate that is already in the list is said under its box, and the dialog stays open", async () => {
    const { user } = open("vehicles", { "POST /transport/vehicles": refuse(409, "A vehicle with this registration number is already in the list.", [{ path: "registrationNumber", message: "Another vehicle has this registration number" }]) });
    await screen.findByRole("table", { name: "Vehicles" });
    await user.click(screen.getByRole("button", { name: "Add vehicle" }));
    const dialog = await screen.findByRole("dialog", { name: "Add vehicle" });
    await user.type(within(dialog).getByLabelText(/^Vehicle number/), "Bus 2");
    await user.type(within(dialog).getByLabelText(/^Registration number/), "MP09 AB 1234");
    await user.type(within(dialog).getByLabelText(/^Seats/), "30");
    await user.click(within(dialog).getByRole("button", { name: "Add vehicle" }));
    expect(await within(dialog).findAllByText("Another vehicle has this registration number")).not.toHaveLength(0);
    expect(screen.getByRole("dialog", { name: "Add vehicle" })).toBeInTheDocument();
  });

  it("changing a vehicle opens it filled in; switching it off sends only that with the rest as it was", async () => {
    const { calls, user } = open("vehicles", { "PATCH /transport/vehicles/v1": (body) => ({ ...BUS, ...(body as object) }) });
    await screen.findByRole("table", { name: "Vehicles" });
    await user.click(screen.getByRole("button", { name: "Change Bus 1" }));
    const dialog = await screen.findByRole("dialog", { name: "Change Bus 1" });
    expect(within(dialog).getByLabelText(/^Registration number/)).toHaveValue("MP09 AB 1234");
    expect(within(dialog).getByLabelText(/^Seats/)).toHaveValue(40);
    expect(within(dialog).getByLabelText(/^Fitness certificate/)).toHaveValue("2026-11-20");
    await user.click(within(dialog).getByRole("switch"));
    await user.click(within(dialog).getByRole("button", { name: "Save" }));
    await screen.findByText("Vehicle saved");
    expect(posted(calls, "PATCH", "/transport/vehicles/v1")[0].body).toMatchObject({ isActive: false, number: "Bus 1", seats: 40 });
  });

  it("a person who may only see transport reads the list: no Add vehicle and no Change buttons", async () => {
    open("vehicles", {}, { role: "receptionist", permissions: ["transport.view"] });
    await screen.findByRole("table", { name: "Vehicles" });
    expect(screen.queryByRole("button", { name: "Add vehicle" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Change / })).not.toBeInTheDocument();
  });

  it("an empty school is told so, with the button to add the first vehicle", async () => {
    open("vehicles", { "GET /transport/vehicles": () => ({ items: [] }) });
    expect(await screen.findByText("No vehicles yet")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Add vehicle" })).toHaveLength(2);
  });
});

describe("Transport > Drivers", () => {
  it("lists drivers and attendants with mobile, emergency number, licence and how long it is valid, and the routes they run", async () => {
    open("drivers");
    const table = await screen.findByRole("table", { name: "Drivers and attendants" });
    const rows = within(table).getAllByRole("row");
    expect(within(rows[1]).getByText("Ramesh Yadav")).toBeInTheDocument();
    expect(within(rows[1]).getByText("9876543210")).toBeInTheDocument();
    expect(within(rows[1]).getByText("Emergency 9876500000")).toBeInTheDocument();
    expect(within(rows[1]).getByText("MP0920110012345")).toBeInTheDocument();
    expect(within(rows[1]).getByText("Ends in 5 days")).toBeInTheDocument();
    expect(within(rows[1]).getByText("Route 1 - Arera Colony")).toBeInTheDocument();
    expect(within(rows[2]).getByText("Sunita Bai")).toBeInTheDocument();
    expect(within(rows[2]).getByText("None yet")).toBeInTheDocument();
    // The licence to renew is said here (not the vehicle's papers).
    const renew = await screen.findByLabelText("Papers to renew");
    expect(within(renew).getByText("1 paper to renew")).toBeInTheDocument();
    expect(within(renew).queryByText(/Bus 1/)).not.toBeInTheDocument();
  });

  it("the chips ask for drivers or attendants only", async () => {
    const { calls, user } = open("drivers");
    await screen.findByRole("table", { name: "Drivers and attendants" });
    await user.click(screen.getByRole("radio", { name: "Attendants" }));
    await vi.waitFor(() => expect(calls.some((c) => c.path === "/transport/drivers" && c.query.includes("role=attendant"))).toBe(true));
  });

  it("Add driver has the licence boxes; Add attendant has none; each is one request with what was typed", async () => {
    const { calls, user } = open("drivers", { "POST /transport/drivers": (body) => ({ ...RAMESH, ...(body as object), id: "d9" }) });
    await screen.findByRole("table", { name: "Drivers and attendants" });
    await user.click(screen.getByRole("button", { name: "Add driver" }));
    const dialog = await screen.findByRole("dialog", { name: "Add driver" });
    await user.click(within(dialog).getByRole("button", { name: "Add" }));
    expect(await within(dialog).findByText("Enter the name")).toBeInTheDocument();
    expect(within(dialog).getByText("Enter the 10-digit mobile number")).toBeInTheDocument();
    await user.type(within(dialog).getByLabelText(/^Name/), "Mohan Lal");
    await user.type(within(dialog).getByLabelText(/^Mobile number/), "98 76 54 32 10");
    await user.type(within(dialog).getByLabelText(/^Driving licence number/), "mp09 2011 0099");
    await user.type(within(dialog).getByLabelText(/^Licence valid till/), "2028-01-31");
    await user.click(within(dialog).getByRole("button", { name: "Add" }));
    await screen.findByText("Driver added");
    expect(posted(calls, "POST", "/transport/drivers")[0].body).toMatchObject({ name: "Mohan Lal", role: "driver", mobile: "98 76 54 32 10", licenseNumber: "MP09 2011 0099", licenseExpiry: "2028-01-31" });
    cleanup();

    const second = open("drivers", { "POST /transport/drivers": (body) => ({ ...SUNITA, ...(body as object), id: "d10" }) });
    await screen.findByRole("table", { name: "Drivers and attendants" });
    await second.user.click(screen.getByRole("button", { name: "Add attendant" }));
    const attendant = await screen.findByRole("dialog", { name: "Add attendant" });
    expect(within(attendant).queryByLabelText("Driving licence number")).not.toBeInTheDocument();
    await second.user.type(within(attendant).getByLabelText(/^Name/), "Geeta Devi");
    await second.user.type(within(attendant).getByLabelText(/^Mobile number/), "9811122233");
    await second.user.click(within(attendant).getByRole("button", { name: "Add" }));
    await screen.findByText("Attendant added");
    expect(posted(second.calls, "POST", "/transport/drivers")[0].body).toMatchObject({ role: "attendant", licenseNumber: "", licenseExpiry: "" });
  });

  it("a mobile number that someone already has is said under its box", async () => {
    const { user } = open("drivers", { "POST /transport/drivers": refuse(409, "Ramesh Yadav already has this mobile number.", [{ path: "mobile", message: "Ramesh Yadav already has this mobile number" }]) });
    await screen.findByRole("table", { name: "Drivers and attendants" });
    await user.click(screen.getByRole("button", { name: "Add driver" }));
    const dialog = await screen.findByRole("dialog", { name: "Add driver" });
    await user.type(within(dialog).getByLabelText(/^Name/), "Mohan Lal");
    await user.type(within(dialog).getByLabelText(/^Mobile number/), "9876543210");
    await user.click(within(dialog).getByRole("button", { name: "Add" }));
    expect((await within(dialog).findAllByText("Ramesh Yadav already has this mobile number")).length).toBeGreaterThan(0);
  });

  it("a person who may only see transport has no Add or Change buttons", async () => {
    open("drivers", {}, { role: "receptionist", permissions: ["transport.view"] });
    await screen.findByRole("table", { name: "Drivers and attendants" });
    expect(screen.queryByRole("button", { name: /^Add / })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Change / })).not.toBeInTheDocument();
  });
});

describe("Transport > Routes", () => {
  it("shows each route as a card: its vehicle, driver and attendant, when it leaves, and its stops in order with times and fee", async () => {
    open("routes");
    const card = await screen.findByRole("group", { name: "Route 1 - Arera Colony" });
    expect(within(card).getByText("Morning 7:00 am")).toBeInTheDocument();
    expect(within(card).getByText("Afternoon 2:30 pm")).toBeInTheDocument();
    expect(within(card).getByText("Bus 1 · MP09 AB 1234")).toBeInTheDocument();
    expect(within(card).getByText("Ramesh Yadav · 9876543210")).toBeInTheDocument();
    expect(within(card).getByText("None yet")).toBeInTheDocument();
    const stops = within(within(card).getByRole("list", { name: "Stops of Route 1 - Arera Colony" })).getAllByRole("listitem");
    expect(stops.map((s) => s.textContent)).toEqual(["1Arera Colony7:10 am · back 2:40 pm · ₹800/month", "2Shahpura7:25 am"]);
  });

  it("Add route: the name is needed; with it, a stop typed and an empty one left out, one request carries the stops in order", async () => {
    const { calls, user } = open("routes", { "POST /transport/routes": (body) => ({ ...ROUTE, ...(body as object), id: "r2" }) });
    await screen.findByRole("group", { name: "Route 1 - Arera Colony" });
    await user.click(screen.getByRole("button", { name: "Add route" }));
    const dialog = await screen.findByRole("dialog", { name: "Add route" });
    await user.click(within(dialog).getByRole("button", { name: "Add route" }));
    expect(await within(dialog).findByText("Enter the route name")).toBeInTheDocument();
    expect(posted(calls, "POST", "/transport/routes")).toHaveLength(0);

    await user.type(within(dialog).getByLabelText(/^Route name/), "Route 2 - Kolar");
    await user.type(within(dialog).getByLabelText("Stop 1 name"), "Kolar Road");
    await user.type(within(dialog).getByLabelText("Stop 1 monthly fee"), "900");
    await user.click(within(dialog).getByRole("button", { name: "Add stop" }));
    await user.click(within(dialog).getByRole("button", { name: "Add stop" }));
    await user.type(within(dialog).getByLabelText("Stop 2 name"), "Bhel Square");
    // The empty third stop is left out; stop 2 moves above stop 1.
    await user.click(within(dialog).getByRole("button", { name: "Move stop 2 up" }));
    await user.click(within(dialog).getByRole("button", { name: "Add route" }));
    await screen.findByText("Route added");
    const sent = posted(calls, "POST", "/transport/routes")[0].body as { name: string; vehicleId: null; stops: { name: string; fee: string }[] };
    expect(sent).toMatchObject({ name: "Route 2 - Kolar", vehicleId: null });
    expect(sent.stops.map((s) => [s.name, s.fee])).toEqual([["Bhel Square", ""], ["Kolar Road", "900"]]);
  });

  it("changing a route opens it with its stops; a stop can be taken away", async () => {
    const { calls, user } = open("routes", { "PATCH /transport/routes/r1": (body) => ({ ...ROUTE, ...(body as object) }) });
    await screen.findByRole("group", { name: "Route 1 - Arera Colony" });
    await user.click(screen.getByRole("button", { name: "Change Route 1 - Arera Colony" }));
    const dialog = await screen.findByRole("dialog", { name: "Change Route 1 - Arera Colony" });
    expect(within(dialog).getByLabelText("Stop 1 name")).toHaveValue("Arera Colony");
    expect(within(dialog).getByLabelText("Stop 2 pick-up time")).toHaveValue("07:25");
    await user.click(within(dialog).getByRole("button", { name: "Remove stop 2" }));
    await user.click(within(dialog).getByRole("button", { name: "Save" }));
    await screen.findByText("Route saved");
    const body = posted(calls, "PATCH", "/transport/routes/r1")[0].body as { stops: { name: string }[]; vehicleId: string; driverId: string };
    expect(body.stops.map((s) => s.name)).toEqual(["Arera Colony"]);
    expect(body).toMatchObject({ vehicleId: "v1", driverId: "d1" });
  });

  it("a person who may only see transport reads the routes", async () => {
    open("routes", {}, { role: "receptionist", permissions: ["transport.view"] });
    await screen.findByRole("group", { name: "Route 1 - Arera Colony" });
    expect(screen.queryByRole("button", { name: "Add route" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Change / })).not.toBeInTheDocument();
  });
});
