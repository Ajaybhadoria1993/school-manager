import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FormBarSlotContext } from "../../../layout/FormBarSlot";
import { FormActionBar } from "../FormActionBar";

/** A form whose bar of buttons is `FormActionBar dock`, the way the Add student and Edit student pages build it. */
function Page({ onSubmit }: { onSubmit: () => void }) {
  return (
    <form
      id="the-form"
      aria-label="The form"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
    >
      <input aria-label="Name" />
      <FormActionBar dock>
        <button type="button">Clear all</button>
        <button type="submit" form="the-form">
          Next step
        </button>
      </FormActionBar>
    </form>
  );
}

let slot: HTMLElement | null = null;
const withSlot = (ui: React.ReactElement) => {
  slot = document.createElement("div");
  document.body.appendChild(slot);
  return render(<FormBarSlotContext.Provider value={slot}>{ui}</FormBarSlotContext.Provider>);
};

afterEach(() => {
  slot?.remove();
  slot = null;
});

describe("the docked bar of a student form", () => {
  it("stands inside the form where the layout has no bottom slot (a page on its own)", () => {
    render(<Page onSubmit={() => {}} />);
    expect(screen.getByRole("form", { name: "The form" })).toContainElement(screen.getByRole("button", { name: "Next step" }));
  });

  it("stands in the layout's bottom slot when there is one, so it keeps one place whatever the page's length", () => {
    withSlot(<Page onSubmit={() => {}} />);
    expect(slot).toContainElement(screen.getByRole("button", { name: "Next step" }));
    expect(slot).toContainElement(screen.getByRole("button", { name: "Clear all" }));
    expect(screen.getByRole("form", { name: "The form" })).not.toContainElement(screen.getByRole("button", { name: "Next step" }));
  });

  it("still submits its form from the slot: by the button, and by Enter in a box", async () => {
    const onSubmit = vi.fn();
    const user = userEvent.setup();
    withSlot(<Page onSubmit={onSubmit} />);
    await user.click(screen.getByRole("button", { name: "Next step" }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
    await user.type(screen.getByLabelText("Name"), "{Enter}");
    expect(onSubmit).toHaveBeenCalledTimes(2);
  });

  it("leaves the slot empty again when the form goes away (an empty slot takes no room)", () => {
    const { unmount } = withSlot(<Page onSubmit={() => {}} />);
    expect(slot).not.toBeEmptyDOMElement();
    unmount();
    expect(slot).toBeEmptyDOMElement();
  });
});
