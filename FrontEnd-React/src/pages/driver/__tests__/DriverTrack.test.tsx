import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Provider } from "react-redux";
import { allApiSlices } from "../../../redux/api/apiRoot";
import store from "../../../redux/store";
import { fakeApi, type Call } from "../../../test/fakeApi";
import DriverTrackPage from "../DriverTrack";

const LINK = `${"a".repeat(24)}.${"x".repeat(32)}`;
const SESSION = { vehicle: { id: "v1", number: "Bus 1", registrationNumber: "MP09 AB 1234" }, routes: ["Route 1"] };
const refuse = (status: number) => () => new Response(JSON.stringify({ success: false, message: "No", code: "TRACKING_KEY_INVALID" }), { status, headers: { "Content-Type": "application/json" } });

/** A phone that has the link in its address (or kept from before) and a GPS that reports one reading as soon as it is asked. */
function phone({ hash = `#${LINK}`, handlers = {} as Record<string, () => unknown>, coords = { latitude: 23.26, longitude: 77.41, accuracy: 12.4, speed: 10, heading: 90 } } = {}) {
  window.history.replaceState(null, "", `/driver-track${hash}`);
  const calls: Call[] = fakeApi({ "POST /transport/tracking/session": () => SESSION, "POST /transport/tracking/ping": () => null, "POST /transport/tracking/stop": () => null, ...handlers });
  const inner = globalThis.fetch;
  const links: (string | null)[] = [];
  vi.stubGlobal("fetch", (input: RequestInfo | URL, init?: RequestInit) => {
    // Reading the headers of a Request does not use up its body (building another Request from it would).
    links.push((input instanceof Request ? input : new Request(input, init)).headers.get("X-Tracking-Link"));
    return inner(input, init);
  });
  const clearWatch = vi.fn();
  Object.defineProperty(navigator, "geolocation", {
    configurable: true,
    value: { watchPosition: (ok: PositionCallback) => (ok({ coords, timestamp: Date.now() } as GeolocationPosition), 7), clearWatch },
  });
  render(
    <Provider store={store}>
      <DriverTrackPage />
    </Provider>,
  );
  return { calls, links, clearWatch, user: userEvent.setup() };
}
const to = (calls: Call[], path: string) => calls.filter((c) => c.method === "POST" && c.path === `/transport/tracking/${path}`);

beforeEach(() => window.localStorage.clear());
afterEach(() => {
  for (const slice of allApiSlices) store.dispatch(slice.util.resetApiState());
  vi.unstubAllGlobals();
  window.localStorage.clear();
});

describe("the driver's page", () => {
  it("asks for the link when the phone has none", () => {
    const { calls } = phone({ hash: "" });
    expect(screen.getByRole("alert")).toHaveTextContent(/open the link the school sent/i);
    expect(calls).toHaveLength(0);
  });

  it("says a link the school switched off does not work, and forgets it", async () => {
    window.localStorage.setItem("driverTrackingLink", LINK);
    phone({ hash: "", handlers: { "POST /transport/tracking/session": refuse(401) } });
    expect(await screen.findByRole("alert")).toHaveTextContent(/does not work any more/i);
    expect(window.localStorage.getItem("driverTrackingLink")).toBeNull();
  });

  it("keeps the link after the first visit, takes it out of the address, and shows which vehicle this is", async () => {
    const { links } = phone();
    expect(await screen.findByRole("heading", { name: "Bus 1" })).toBeInTheDocument();
    expect(screen.getByText(/MP09 AB 1234 · Route 1/)).toBeInTheDocument();
    expect(window.localStorage.getItem("driverTrackingLink")).toBe(LINK);
    expect(window.location.hash).toBe("");
    // The link travels in its own header, never in the address.
    expect(links.every((l) => l === LINK)).toBe(true);
  });

  it("start trip sends the phone's position at once (speed in km/h), and end trip stops the GPS and tells the school", async () => {
    const { calls, clearWatch, user } = phone();
    await user.click(await screen.findByRole("button", { name: /start trip/i }));
    await waitFor(() => expect(to(calls, "ping")).toHaveLength(1));
    expect(to(calls, "ping")[0].body).toEqual({ lat: 23.26, lng: 77.41, speedKmph: 36, heading: 90, accuracy: 12 });
    expect(await screen.findByText("Trip running")).toBeInTheDocument();
    expect(await screen.findByText("36 km/h")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /end trip/i }));
    await waitFor(() => expect(to(calls, "stop")).toHaveLength(1));
    expect(clearWatch).toHaveBeenCalledWith(7);
    expect(await screen.findByText("Trip not started")).toBeInTheDocument();
  });

  it("when the school switches the link off during a trip, the page says so and stops", async () => {
    const { user } = phone({ handlers: { "POST /transport/tracking/ping": refuse(401) } });
    await user.click(await screen.findByRole("button", { name: /start trip/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/does not work any more/i);
    expect(screen.queryByRole("button", { name: /end trip/i })).not.toBeInTheDocument();
  });

  it("a phone that blocks the location is told how to allow it", async () => {
    const { user } = phone();
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: { watchPosition: (_ok: PositionCallback, bad: PositionErrorCallback) => (bad({ code: 1, PERMISSION_DENIED: 1 } as GeolocationPositionError), 1), clearWatch: vi.fn() },
    });
    await user.click(await screen.findByRole("button", { name: /start trip/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/location is blocked/i);
    expect(screen.getByRole("button", { name: /start trip/i })).toBeInTheDocument();
  });
});
