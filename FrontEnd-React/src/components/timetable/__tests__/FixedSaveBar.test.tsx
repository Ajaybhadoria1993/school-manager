import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { FooterSlotContext } from "../../layout/FooterSlot";
import { FixedSaveBar } from "../FixedSaveBar";

/**
 * The buttons of a page that has one Save (School timings). In the signed-in app they stand in the layout's footer strip, under the scroll pane
 * (the page scrolls above them and never behind them; they are not part of what scrolls). Where there is no such layout (a test, a page on its
 * own) they are fixed to the bottom right of the screen.
 */

let slot: HTMLElement | null = null;
afterEach(() => {
  cleanup();
  slot?.remove();
  slot = null;
});

function Page({ withSlot }: { withSlot: boolean }) {
  return (
    <FooterSlotContext.Provider value={withSlot ? slot : null}>
      <div data-testid="page">
        <p>The page that scrolls</p>
        <FixedSaveBar>
          <button type="button">Throw away changes</button>
          <button type="button">Save changes</button>
        </FixedSaveBar>
      </div>
    </FooterSlotContext.Provider>
  );
}

describe("the Save buttons of a page", () => {
  it("stand in the layout's footer strip when there is one: outside the page that scrolls, not fixed over it, aligned to the right", () => {
    slot = document.createElement("div");
    document.body.appendChild(slot);
    render(<Page withSlot />);
    const save = screen.getByRole("button", { name: "Save changes" });
    expect(slot).toContainElement(save);
    expect(slot).toContainElement(screen.getByRole("button", { name: "Throw away changes" }));
    expect(screen.getByTestId("page")).not.toContainElement(save);
    expect(save.closest(".fixed")).toBeNull();
    expect(save.closest("[data-fixed-bar]")?.className).toContain("justify-end");
  });

  it("are fixed to the bottom right of the screen where there is no footer strip, drawn on the page itself and not inside it", () => {
    render(<Page withSlot={false} />);
    const save = screen.getByRole("button", { name: "Save changes" });
    expect(save.closest(".fixed")).not.toBeNull();
    expect(save.closest(".fixed")?.className).toContain("bottom-4");
    expect(screen.getByTestId("page")).not.toContainElement(save);
  });

  it("have no white card or shadow round them in either place", () => {
    slot = document.createElement("div");
    document.body.appendChild(slot);
    const { unmount } = render(<Page withSlot />);
    expect(screen.getByRole("button", { name: "Save changes" }).closest(".bg-surface")).toBeNull();
    unmount();
    render(<Page withSlot={false} />);
    expect(screen.getByRole("button", { name: "Save changes" }).closest(".bg-surface")).toBeNull();
    expect(screen.getByRole("button", { name: "Save changes" }).closest(".shadow-float")).toBeNull();
  });

  it("leave the footer strip empty again when the page goes away (an empty strip takes no room)", () => {
    slot = document.createElement("div");
    document.body.appendChild(slot);
    const { unmount } = render(<Page withSlot />);
    expect(slot).not.toBeEmptyDOMElement();
    unmount();
    expect(slot).toBeEmptyDOMElement();
  });
});
