import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DayStepper } from "../DayStepper";

afterEach(cleanup);

const show = (props: Partial<Parameters<typeof DayStepper>[0]> = {}) => {
  const onChange = vi.fn();
  render(<DayStepper id="d" label="Date" value="2026-11-10" onChange={onChange} {...props} />);
  return { onChange, user: userEvent.setup() };
};

describe("DayStepper: a day with a left and a right arrow", () => {
  it("the arrows move one day back and one day on (across a month's end too)", async () => {
    const { onChange, user } = show({ value: "2026-12-01" });
    await user.click(screen.getByRole("button", { name: "Previous day" }));
    expect(onChange).toHaveBeenLastCalledWith("2026-11-30");
    await user.click(screen.getByRole("button", { name: "Next day" }));
    expect(onChange).toHaveBeenLastCalledWith("2026-12-02");
  });

  it("an arrow that would leave the allowed days is off: the right one at the last day, the left one at the first", async () => {
    show({ value: "2026-11-10", min: "2026-11-10", max: "2026-11-10" });
    expect(screen.getByRole("button", { name: "Previous day" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Next day" })).toBeDisabled();
  });

  it("the date box has no clear button (a day is always chosen), and the calendar still opens from it", () => {
    show();
    expect(screen.queryByRole("button", { name: /^Clear/ })).not.toBeInTheDocument();
    expect(screen.getAllByRole("spinbutton").length).toBeGreaterThan(0);
  });

  it("a jump button (Today) shows only when another day is open, and sets that day", async () => {
    const { onChange, user } = show({ jump: { label: "Today", value: "2026-11-22" } });
    await user.click(screen.getByRole("button", { name: "Today" }));
    expect(onChange).toHaveBeenLastCalledWith("2026-11-22");
    cleanup();
    show({ value: "2026-11-22", jump: { label: "Today", value: "2026-11-22" } });
    expect(screen.queryByRole("button", { name: "Today" })).not.toBeInTheDocument();
  });
});
