import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";
import { Provider } from "react-redux";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { allApiSlices } from "../../../redux/api/apiRoot";
import store from "../../../redux/store";
import type { TrackingHandlers } from "../../../realtime/trackingSocket";
import { fakeApi } from "../../../test/fakeApi";
import { signInAs, signOut } from "../../../test/session";
import type { LiveTracking, VehiclePosition } from "../../../types";
import TrackingPage from "../Tracking";

// The map itself (Leaflet) needs a real browser; the page's own work is what is tested: which vehicles show, what each says, and how pushes change them.
const onMap = vi.fn();
vi.mock("../../../components/transport/LiveMap", () => ({
  LiveMap: (props: { vehicles: { item: { number: string } }[] }) => {
    onMap(props.vehicles.map((v) => v.item.number));
    return <div data-testid="map">{props.vehicles.map((v) => v.item.number).join(",")}</div>;
  },
}));

let handlers: TrackingHandlers | null = null;
const closed = vi.fn();
vi.mock("../../../realtime/trackingSocket", () => ({
  connectTracking: (h: TrackingHandlers) => {
    handlers = h;
    return closed;
  },
}));

const at = (over: Partial<VehiclePosition> = {}): VehiclePosition => ({ lat: 23.26, lng: 77.41, speedKmph: 31, heading: 90, accuracy: 10, recordedAt: "2026-11-19T08:00:00.000Z", ageSeconds: 4, status: "live", ...over });
const LIVE: LiveTracking = {
  liveWithinSeconds: 120,
  items: [
    { vehicleId: "v1", number: "Bus 1", registrationNumber: "MP09 AB 1234", type: "bus", routes: ["Route 1"], driver: { name: "Ramesh Yadav", mobile: "9876543210" }, position: at() },
    { vehicleId: "v2", number: "Bus 2", registrationNumber: "MP09 AB 5678", type: "bus", routes: [], driver: null, position: null },
    { vehicleId: "v3", number: "Van 3", registrationNumber: "MP09 AB 9999", type: "van", routes: [], driver: null, position: at({ status: "offline", ageSeconds: 900, speedKmph: null }) },
  ],
};

function open(data: LiveTracking = LIVE, permissions?: string[]) {
  signInAs("school_admin", permissions);
  const calls = fakeApi({ "GET /transport/tracking/live": () => data });
  render(
    <Provider store={store}>
      <MemoryRouter>
        <TrackingPage />
      </MemoryRouter>
    </Provider>,
  );
  return calls;
}
const row = (name: string) => screen.getByRole("button", { name: new RegExp(name) }).closest("li") as HTMLElement;

afterEach(() => {
  cleanup();
  signOut();
  vi.unstubAllGlobals();
  handlers = null;
  onMap.mockClear();
  closed.mockClear();
  for (const api of allApiSlices) store.dispatch(api.util.resetApiState());
});

describe("Transport > Live tracking", () => {
  it("lists each vehicle with a driver link: live, offline, and not started; and puts only those that have reported on the map", async () => {
    open();
    expect(await screen.findByTestId("map")).toHaveTextContent("Bus 1,Van 3");
    expect(within(row("Bus 1")).getByText("Live")).toBeInTheDocument();
    expect(within(row("Bus 1")).getByText(/31 km\/h/)).toBeInTheDocument();
    expect(within(row("Bus 1")).getByText(/Ramesh Yadav · Route 1/)).toBeInTheDocument();
    expect(within(row("Van 3")).getByText("Offline")).toBeInTheDocument();
    expect(within(row("Van 3")).getByText(/15 min ago/)).toBeInTheDocument();
    expect(within(row("Bus 2")).getByText("Not started")).toBeInTheDocument();
    expect(within(row("Bus 2")).getByText(/Waiting for the driver/)).toBeInTheDocument();
    // Bus 2 has not reported, so it cannot be chosen.
    expect(screen.getByRole("button", { name: /Bus 2/ })).toBeDisabled();
  });

  it("counts the vehicles that are live and those that are not", async () => {
    open();
    await screen.findByTestId("map");
    const tiles = screen.getByLabelText("About the vehicles");
    // The numbers count up on screen, so they are waited for.
    await waitFor(() => {
      expect(within(tiles).getByText("Vehicles with a driver link").closest("div")).toHaveTextContent("3");
      expect(within(tiles).getByText("Live now").closest("div")).toHaveTextContent("1");
      expect(within(tiles).getByText("Not reporting").closest("div")).toHaveTextContent("2");
    });
  });

  it("a position that arrives on the socket moves the vehicle and brings a vehicle that had not started onto the map", async () => {
    open();
    await screen.findByTestId("map");
    act(() => handlers!.onLine(true));
    expect(screen.getByText("Live line on")).toBeInTheDocument();

    act(() => handlers!.onPosition({ vehicleId: "v2", position: at({ ageSeconds: 0, speedKmph: 12 }) }));
    expect(await screen.findByTestId("map")).toHaveTextContent("Bus 1,Bus 2,Van 3");
    expect(within(row("Bus 2")).getByText("Live")).toBeInTheDocument();
    expect(within(row("Bus 2")).getByText(/12 km\/h/)).toBeInTheDocument();

    // The driver ends the trip: offline at once.
    act(() => handlers!.onPosition({ vehicleId: "v1", position: at({ status: "offline" }) }));
    expect(within(row("Bus 1")).getByText("Offline")).toBeInTheDocument();
  });

  it("a push for a vehicle the page does not know (its link was made after the page opened) makes the page read the list again", async () => {
    const calls = open();
    await screen.findByTestId("map");
    act(() => handlers!.onPosition({ vehicleId: "new-one", position: at() }));
    await waitFor(() => expect(calls.filter((c) => c.path === "/transport/tracking/live")).toHaveLength(2));
  });

  it("when the line comes back after a break, what the page was told meanwhile is read again", async () => {
    const calls = open();
    await screen.findByTestId("map");
    act(() => handlers!.onPosition({ vehicleId: "v2", position: at() }));
    act(() => handlers!.onReconnect());
    await waitFor(() => expect(calls.filter((c) => c.path === "/transport/tracking/live")).toHaveLength(2));
  });

  it("closes the live line when the page is left", async () => {
    open();
    await screen.findByTestId("map");
    cleanup();
    expect(closed).toHaveBeenCalled();
  });

  it("says how to start when no vehicle has a link, and offers the Vehicles page to a person who may make one", async () => {
    open({ liveWithinSeconds: 120, items: [] });
    expect(await screen.findByText("No vehicle has a driver link yet")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /make a driver link/i })).toHaveAttribute("href", "/transport/vehicles");
  });
});
