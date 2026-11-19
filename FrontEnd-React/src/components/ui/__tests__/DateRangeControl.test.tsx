import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DateRangeControl } from "../DateRangeControl";

/**
 * The date filter of the whole app (2026-11-17), the look of Infinity Medisetu's: an arrow, a box with the days, an arrow; the box opens the
 * window "Select date range" (ready-made ranges, a calendar of two months, Cancel and Apply). 17 Nov 2026 is a Tuesday.
 */

const TODAY = "2026-11-17";
const DAY = { from: TODAY, to: TODAY };

afterEach(() => cleanup());

function show(range = DAY, over: { noFuture?: boolean } = {}) {
  const onChange = vi.fn();
  render(<DateRangeControl range={range} onChange={onChange} today={TODAY} noFuture={over.noFuture} />);
  return { onChange, user: userEvent.setup() };
}
const openWindow = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.click(screen.getByRole("button", { name: /\d{4}|\d{2} — / }));
  return screen.findByRole("dialog", { name: "Select date range" });
};

describe("the box and its arrows", () => {
  it("says the days like the reference: 17 Nov 26 — 17 Nov 26", () => {
    show();
    expect(screen.getByRole("button", { name: "17 Nov 26 — 17 Nov 26" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Previous period" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Next period" })).toBeInTheDocument();
  });

  it("the arrows move to the period before and after: a day, a week, a month", async () => {
    const { onChange, user } = show({ from: "2026-11-09", to: "2026-11-14" });
    await user.click(screen.getByRole("button", { name: "Next period" }));
    expect(onChange).toHaveBeenLastCalledWith({ from: "2026-11-16", to: "2026-11-21" });
    await user.click(screen.getByRole("button", { name: "Previous period" }));
    expect(onChange).toHaveBeenLastCalledWith({ from: "2026-11-02", to: "2026-11-07" });
    cleanup();
    const month = show({ from: "2026-10-01", to: "2026-10-31" });
    await month.user.click(screen.getByRole("button", { name: "Previous period" }));
    expect(month.onChange).toHaveBeenLastCalledWith({ from: "2026-09-01", to: "2026-09-30" });
  });

  it("with noFuture the later arrow stops once the range reaches today", () => {
    show(DAY, { noFuture: true });
    expect(screen.getByRole("button", { name: "Next period" })).toBeDisabled();
    cleanup();
    show({ from: "2026-11-09", to: "2026-11-14" }, { noFuture: true });
    expect(screen.getByRole("button", { name: "Next period" })).toBeEnabled();
  });

  it("without noFuture the later arrow always works", () => {
    show(DAY);
    expect(screen.getByRole("button", { name: "Next period" })).toBeEnabled();
  });
});

describe("the window Select date range", () => {
  it("opens from the box with the days and how many, the ready-made ranges, two months and Cancel / Apply", async () => {
    const { user } = show();
    const dialog = await openWindow(user);
    expect(within(dialog).getByText("17 Nov 26 — 17 Nov 26 · 1 day")).toBeInTheDocument();
    const presets = within(within(dialog).getByRole("group", { name: "Ready-made ranges" })).getAllByRole("button").map((b) => b.textContent);
    expect(presets).toEqual(["Today", "This Week", "Last Week", "Last 7 Days", "This Month", "Last Month", "Last 3 Months"]);
    expect(within(dialog).getByRole("table", { name: "November 2026" })).toBeInTheDocument();
    expect(within(dialog).getByRole("table", { name: "December 2026" })).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Cancel" })).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Apply" })).toBeInTheDocument();
    // The day being looked at is marked.
    expect(within(dialog).getByRole("button", { name: "17 November 2026" })).toHaveAttribute("aria-pressed", "true");
  });

  it("a ready-made range fills the calendar and the line above it; Apply gives it, nothing changes before", async () => {
    const { onChange, user } = show();
    const dialog = await openWindow(user);
    await user.click(within(dialog).getByRole("button", { name: "Last Week" }));
    expect(within(dialog).getByText("9 Nov 26 — 14 Nov 26 · 6 days")).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Last Week" })).toHaveAttribute("aria-pressed", "true");
    expect(within(dialog).getByRole("button", { name: "9 November 2026" })).toHaveAttribute("aria-pressed", "true");
    expect(within(dialog).getByRole("button", { name: "14 November 2026" })).toHaveAttribute("aria-pressed", "true");
    expect(onChange).not.toHaveBeenCalled();
    await user.click(within(dialog).getByRole("button", { name: "Apply" }));
    expect(onChange).toHaveBeenCalledExactlyOnceWith({ from: "2026-11-09", to: "2026-11-14" });
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Select date range" })).not.toBeInTheDocument());
  });

  it("two clicks in the calendar make a range: the first day, then the last", async () => {
    const { onChange, user } = show();
    const dialog = await openWindow(user);
    await user.click(within(dialog).getByRole("button", { name: "3 November 2026" }));
    expect(within(dialog).getByText("3 Nov 26 — 3 Nov 26 · 1 day")).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "12 November 2026" }));
    expect(within(dialog).getByText("3 Nov 26 — 12 Nov 26 · 10 days")).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Apply" }));
    expect(onChange).toHaveBeenCalledExactlyOnceWith({ from: "2026-11-03", to: "2026-11-12" });
  });

  it("a day can be picked in the second month too", async () => {
    const { onChange, user } = show({ from: "2026-11-30", to: "2026-11-30" });
    const dialog = await openWindow(user);
    await user.click(within(dialog).getByRole("button", { name: "30 November 2026" }));
    await user.click(within(dialog).getByRole("button", { name: "4 December 2026" }));
    await user.click(within(dialog).getByRole("button", { name: "Apply" }));
    expect(onChange).toHaveBeenCalledExactlyOnceWith({ from: "2026-11-30", to: "2026-12-04" });
  });

  it("Cancel leaves everything as it was", async () => {
    const { onChange, user } = show();
    const dialog = await openWindow(user);
    await user.click(within(dialog).getByRole("button", { name: "Last Month" }));
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(onChange).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Select date range" })).not.toBeInTheDocument());
    // Opened again, it starts from the days the box says, not from the cancelled pick.
    const again = await openWindow(user);
    expect(within(again).getByText("17 Nov 26 — 17 Nov 26 · 1 day")).toBeInTheDocument();
  });

  it("the month arrows move both months; the month and the year have their own boxes", async () => {
    const { user } = show();
    const dialog = await openWindow(user);
    await user.click(within(dialog).getByRole("button", { name: "Next month" }));
    expect(within(dialog).getByRole("table", { name: "December 2026" })).toBeInTheDocument();
    expect(within(dialog).getByRole("table", { name: "January 2027" })).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Previous month" }));
    await user.click(within(dialog).getByRole("button", { name: "Previous month" }));
    expect(within(dialog).getByRole("table", { name: "October 2026" })).toBeInTheDocument();
    expect(within(dialog).getByRole("table", { name: "November 2026" })).toBeInTheDocument();
  });

  it("with noFuture the days after today cannot be picked", async () => {
    const { user } = show(DAY, { noFuture: true });
    const dialog = await openWindow(user);
    expect(within(dialog).getByRole("button", { name: "17 November 2026" })).toBeEnabled();
    expect(within(dialog).getByRole("button", { name: "18 November 2026" })).toBeDisabled();
    expect(within(dialog).getByRole("button", { name: "2 December 2026" })).toBeDisabled();
  });

  it("without noFuture any day can be picked", async () => {
    const { user } = show();
    const dialog = await openWindow(user);
    expect(within(dialog).getByRole("button", { name: "18 November 2026" })).toBeEnabled();
  });
});
