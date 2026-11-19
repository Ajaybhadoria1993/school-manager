import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { HeaderClock } from "../HeaderClock";

/** The time and today's date in the top bar, in India's time, one under the other: "11:03 AM" over "Fri, Nov 13, 2026". */

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("the clock in the top bar", () => {
  it("shows the time and the date in India's time, whatever the computer's own zone is", () => {
    // 05:33 UTC is 11:03 in the morning in India.
    vi.setSystemTime(new Date("2026-11-13T05:33:10Z"));
    render(<HeaderClock />);
    expect(screen.getByText("11:03 AM")).toBeInTheDocument();
    expect(screen.getByText("Fri, Nov 13, 2026")).toBeInTheDocument();
  });

  it("is one machine-readable moment (a time element), so a reader or a tool can use it", () => {
    vi.setSystemTime(new Date("2026-11-13T05:33:10Z"));
    const { container } = render(<HeaderClock />);
    const moment = container.querySelector("time");
    expect(moment).not.toBeNull();
    expect(moment?.getAttribute("dateTime")).toBe("2026-11-13T05:33:10.000Z");
  });

  it("moves on by itself when the minute changes, and not before", () => {
    vi.setSystemTime(new Date("2026-11-13T05:33:10Z"));
    render(<HeaderClock />);
    act(() => {
      vi.advanceTimersByTime(30_000);
    });
    expect(screen.getByText("11:03 AM")).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(31_000);
    });
    expect(screen.getByText("11:04 AM")).toBeInTheDocument();
  });

  it("changes the date at midnight, and the afternoon is PM", () => {
    // 23:59:30 in India.
    vi.setSystemTime(new Date("2026-11-13T18:29:30Z"));
    render(<HeaderClock />);
    expect(screen.getByText("11:59 PM")).toBeInTheDocument();
    expect(screen.getByText("Fri, Nov 13, 2026")).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(31_000);
    });
    expect(screen.getByText("12:00 AM")).toBeInTheDocument();
    expect(screen.getByText("Sat, Nov 14, 2026")).toBeInTheDocument();
  });

  it("stops its timer when it leaves the screen", () => {
    vi.setSystemTime(new Date("2026-11-13T05:33:10Z"));
    const { unmount } = render(<HeaderClock />);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});
