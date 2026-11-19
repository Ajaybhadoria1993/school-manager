import { describe, expect, it } from "vitest";
import type { VehiclePosition } from "../../types";
import { agoLabel, driverPageUrl, escapeHtml, headingOf, kmhOf, readDriverLink, standing } from "../tracking";

const LINK = `${"a".repeat(24)}.${"x".repeat(32)}`;
const memory = () => {
  const kept = new Map<string, string>();
  return { getItem: (k: string) => kept.get(k) ?? null, setItem: (k: string, v: string) => void kept.set(k, v), kept };
};
const position = (over: Partial<VehiclePosition> = {}): VehiclePosition => ({ lat: 1, lng: 2, speedKmph: null, heading: null, accuracy: null, recordedAt: "2026-11-19T08:00:00.000Z", ageSeconds: 0, status: "live", ...over });

describe("what the phone's GPS says, as the server wants it", () => {
  it("turns metres per second into kilometres per hour, and nothing into nothing", () => {
    expect(kmhOf(10)).toBe(36);
    expect(kmhOf(0)).toBe(0);
    expect(kmhOf(8.333)).toBe(30);
    expect(kmhOf(null)).toBeNull();
    expect(kmhOf(undefined)).toBeNull();
    expect(kmhOf(Number.NaN)).toBeNull();
    expect(kmhOf(-1)).toBeNull();
  });

  it("sends a heading only while moving, kept within 0 to 359", () => {
    expect(headingOf(90, 30)).toBe(90);
    expect(headingOf(90, 1)).toBeNull();
    expect(headingOf(90, null)).toBeNull();
    expect(headingOf(null, 30)).toBeNull();
    expect(headingOf(Number.NaN, 30)).toBeNull();
    expect(headingOf(360, 30)).toBe(0);
    expect(headingOf(-90, 30)).toBe(270);
  });
});

describe("how old a position reads", () => {
  it("in seconds, minutes, hours and days", () => {
    expect(agoLabel(3)).toBe("just now");
    expect(agoLabel(40)).toBe("40 sec ago");
    expect(agoLabel(300)).toBe("5 min ago");
    expect(agoLabel(7200)).toBe("2 hr ago");
    expect(agoLabel(86_400)).toBe("1 day ago");
    expect(agoLabel(3 * 86_400)).toBe("3 days ago");
  });

  it("keeps growing between pushes, and a quiet vehicle turns offline without the server saying so", () => {
    const stamped = { position: position({ ageSeconds: 10 }), at: 1_000_000 };
    expect(standing(stamped, 120, 1_000_000)).toEqual({ status: "live", ageSeconds: 10 });
    expect(standing(stamped, 120, 1_050_000)).toEqual({ status: "live", ageSeconds: 60 });
    expect(standing(stamped, 120, 1_111_000)).toEqual({ status: "offline", ageSeconds: 121 });
    // The trip ended: offline however fresh.
    expect(standing({ position: position({ status: "offline" }), at: 1_000_000 }, 120, 1_000_000).status).toBe("offline");
  });
});

describe("a vehicle's number on the map", () => {
  it("cannot carry markup into the page", () => {
    expect(escapeHtml(`<img src=x onerror="a()"> & 'b'`)).toBe("&lt;img src=x onerror=&quot;a()&quot;&gt; &amp; &#39;b&#39;");
    expect(escapeHtml("Bus 1")).toBe("Bus 1");
  });
});

describe("the driver's link on the phone", () => {
  it("is taken from the address after the #, and kept for the next visit", () => {
    const storage = memory();
    expect(readDriverLink(`#${LINK}`, storage)).toBe(LINK);
    expect(storage.kept.get("driverTrackingLink")).toBe(LINK);
    expect(readDriverLink("", storage)).toBe(LINK);
  });

  it("is not taken from anything that is not a link, and nothing is kept for a phone that never had one", () => {
    const storage = memory();
    expect(readDriverLink("#nonsense", storage)).toBeNull();
    expect(readDriverLink("#" + "a".repeat(24) + ".short", storage)).toBeNull();
    expect(storage.kept.size).toBe(0);
    expect(readDriverLink("", null)).toBeNull();
  });

  it("puts the link after the # of the driver page, where no server ever sees it", () => {
    expect(driverPageUrl(LINK, "https://school.example")).toBe(`https://school.example/driver-track#${LINK}`);
  });
});
