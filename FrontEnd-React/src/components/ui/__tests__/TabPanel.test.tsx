import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TabPanel } from "../TabPanel";
import { PageTabs } from "../PageTabs";

/**
 * What a tab shows fades in when the tab changes (2026-11-23, user: "tab change karte hi jhatka lagta hai, sab kuch smooth change ho"): the box is animated
 * by the browser, never mounted again, and left alone for a person who asked for less motion.
 */
const animate = vi.fn();

beforeEach(() => {
  animate.mockReset();
  Object.defineProperty(HTMLElement.prototype, "animate", { value: animate, configurable: true, writable: true });
  vi.stubGlobal("matchMedia", (query: string) => ({ matches: false, media: query, addEventListener() {}, removeEventListener() {} }));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  // @ts-expect-error: put the environment back as jsdom has it (no animations)
  delete HTMLElement.prototype.animate;
});

describe("TabPanel", () => {
  it("does not animate when it is first shown, only when the tab changes (and then fades and rises)", () => {
    const { rerender } = render(<TabPanel tab="usual">first</TabPanel>);
    expect(animate).not.toHaveBeenCalled();
    rerender(<TabPanel tab="class">second</TabPanel>);
    expect(animate).toHaveBeenCalledTimes(1);
    const [frames, options] = animate.mock.calls[0];
    expect(frames).toEqual([
      { opacity: 0, transform: "translateY(6px)" },
      { opacity: 1, transform: "none" },
    ]);
    expect(options).toMatchObject({ duration: 220 });
    // The same tab again (any other change of the page) is not a change of tab.
    rerender(<TabPanel tab="class">third</TabPanel>);
    expect(animate).toHaveBeenCalledTimes(1);
  });

  it("keeps what is inside it when the tab changes: nothing is mounted again", async () => {
    const user = userEvent.setup();
    const { rerender } = render(
      <TabPanel tab="a">
        <input aria-label="Search" />
      </TabPanel>
    );
    await user.type(screen.getByLabelText("Search"), "amit");
    rerender(
      <TabPanel tab="b">
        <input aria-label="Search" />
      </TabPanel>
    );
    expect(screen.getByLabelText("Search")).toHaveValue("amit");
  });

  it("does not move for a person who asked for less motion", () => {
    vi.stubGlobal("matchMedia", (query: string) => ({ matches: query.includes("reduce"), media: query, addEventListener() {}, removeEventListener() {} }));
    const { rerender } = render(<TabPanel tab="a">x</TabPanel>);
    rerender(<TabPanel tab="b">x</TabPanel>);
    expect(animate).not.toHaveBeenCalled();
  });

  it("works in a browser that cannot animate (nothing is thrown)", () => {
    // @ts-expect-error: no animations, as in jsdom
    delete HTMLElement.prototype.animate;
    const { rerender } = render(<TabPanel tab="a">x</TabPanel>);
    expect(() => rerender(<TabPanel tab="b">x</TabPanel>)).not.toThrow();
  });

  it("passes the usual attributes on (a tab panel with its name)", () => {
    render(
      <TabPanel tab="a" role="tabpanel" aria-label="Diary" className="space-y-4">
        x
      </TabPanel>
    );
    expect(screen.getByRole("tabpanel", { name: "Diary" })).toHaveClass("space-y-4");
  });
});

describe("PageTabs: the bar under the open tab is always there and slides in", () => {
  it("every tab has a bar; it is shown (scale-x-100) only under the open one", () => {
    render(<PageTabs label="Which" tabs={[{ id: "a", label: "A" }, { id: "b", label: "B" }]} value="a" onChange={() => {}} />);
    const [open, closed] = screen.getAllByRole("tab");
    expect(open.className).toContain("after:scale-x-100");
    expect(closed.className).toContain("after:scale-x-0");
    expect(closed.className).toContain("after:transition-transform");
  });
});
