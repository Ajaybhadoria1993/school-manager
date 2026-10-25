import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Steps } from "../Steps";

const STEPS = [{ label: "Academic" }, { label: "Personal info" }, { label: "Parents" }, { label: "More details" }];
const show = (props: Partial<Parameters<typeof Steps>[0]> = {}) => {
  const onSelect = vi.fn();
  render(<Steps steps={STEPS} active={1} completed={[0]} furthest={1} onSelect={onSelect} {...props} />);
  return onSelect;
};
const stepButton = (name: string) => within(screen.getByRole("list", { name: "Steps" })).getByRole("button", { name: new RegExp(name) });

describe("the stepper", () => {
  it("lists every step by its name, numbered, with the current one marked", () => {
    show();
    const list = screen.getByRole("list", { name: "Steps" });
    expect(within(list).getAllByRole("listitem")).toHaveLength(4);
    expect(stepButton("Personal info")).toHaveAttribute("aria-current", "step");
    expect(stepButton("Academic")).not.toHaveAttribute("aria-current");
    // A number each, except the one done (it has a tick).
    expect(list).toHaveTextContent("2");
    expect(list).toHaveTextContent("4");
  });

  it("says where the person is, in words, for a narrow screen: Step 2 of 4", () => {
    show();
    expect(screen.getByText(/Step 2 of 4/)).toHaveTextContent("Step 2 of 4: Personal info");
  });

  it("a step that was done says so (for a screen reader too)", () => {
    show();
    expect(within(stepButton("Academic")).getByText("done")).toBeInTheDocument();
    expect(within(stepButton("Parents")).queryByText("done")).not.toBeInTheDocument();
  });

  it("goes back to an earlier step, and forward only as far as the person has been", async () => {
    const onSelect = show({ active: 2, completed: [0, 1], furthest: 2 });
    const user = userEvent.setup();
    await user.click(stepButton("Academic"));
    expect(onSelect).toHaveBeenCalledWith(0);
    await user.click(stepButton("Personal info"));
    expect(onSelect).toHaveBeenCalledWith(1);
    // The current step and the ones not reached yet cannot be pressed.
    expect(stepButton("Parents")).toBeDisabled();
    expect(stepButton("More details")).toBeDisabled();
    await user.click(stepButton("More details"));
    expect(onSelect).toHaveBeenCalledTimes(2);
  });

  it("a step already visited can be opened again from an earlier one", async () => {
    const onSelect = show({ active: 0, completed: [0, 1], furthest: 2 });
    await userEvent.setup().click(stepButton("Parents"));
    expect(onSelect).toHaveBeenCalledWith(2);
  });

  it("is not pressable at all without onSelect", () => {
    show({ onSelect: undefined });
    for (const name of ["Academic", "Parents"]) expect(stepButton(name)).toBeDisabled();
  });
});
