import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BookOpenText } from "lucide-react";
import { PageTabs } from "../PageTabs";

const TABS = [
  { id: "active", label: "Active students", count: 120 },
  { id: "new", label: "New admissions", count: 0 },
  { id: "inactive", label: "Inactive" },
];

afterEach(cleanup);

function show(value = "active", onChange: (id: string) => void = () => {}) {
  render(<PageTabs label="Which students to show" tabs={TABS} value={value} onChange={onChange} />);
  return userEvent.setup();
}

describe("PageTabs (2026-11-22: the tabs of a page, side by side, like the reference pictures)", () => {
  it("is a tab list with one tab for each entry, the open one selected, and a count after the name when there is one (0 is shown)", () => {
    show("new");
    const list = screen.getByRole("tablist", { name: "Which students to show" });
    const tabs = within(list).getAllByRole("tab");
    expect(tabs.map((t) => t.getAttribute("aria-selected"))).toEqual(["false", "true", "false"]);
    expect(within(tabs[0]).getByText("Active students")).toBeInTheDocument();
    expect(within(tabs[0]).getByText("120")).toBeInTheDocument();
    expect(within(tabs[1]).getByText("0")).toBeInTheDocument();
    // No count given: no number, no empty pill.
    expect(tabs[2]).toHaveTextContent(/^Inactive$/);
  });

  it("a tab may have a small icon before its name (hidden from a screen reader: the name is the label)", () => {
    render(<PageTabs label="Class work" tabs={[{ id: "diary", label: "Diary", icon: BookOpenText }, { id: "tests", label: "Tests" }]} value="diary" onChange={() => {}} />);
    const [diary, tests] = screen.getAllByRole("tab");
    expect(diary.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
    expect(tests.querySelector("svg")).toBeNull();
    expect(screen.getByRole("tab", { name: "Diary" })).toBeInTheDocument();
  });

  it("the open tab has the orange bar under it and the others do not", () => {
    show("active");
    const [open, other] = screen.getAllByRole("tab");
    // The orange bar is under every tab and shown only under the open one (2026-11-23: it slides in instead of appearing).
    expect(open.className).toContain("after:bg-orange");
    expect(open.className).toContain("after:scale-x-100");
    expect(other.className).toContain("after:scale-x-0");
    expect(other.className).not.toContain("after:scale-x-100");
  });

  it("a click opens that tab (one call, with its id); a click on the open tab calls nothing", async () => {
    const onChange = vi.fn();
    const user = show("active", onChange);
    await user.click(screen.getByRole("tab", { name: /New admissions/ }));
    expect(onChange).toHaveBeenCalledExactlyOnceWith("new");
    onChange.mockClear();
    await user.click(screen.getByRole("tab", { name: /Active students/ }));
    expect(onChange).not.toHaveBeenCalled();
  });

  it("only the open tab is a stop of the Tab key; the arrow keys move to the next and the one before", async () => {
    const onChange = vi.fn();
    const user = show("active", onChange);
    const [open, , last] = screen.getAllByRole("tab");
    expect(open).toHaveAttribute("tabindex", "0");
    expect(last).toHaveAttribute("tabindex", "-1");
    open.focus();
    await user.keyboard("{ArrowRight}");
    expect(onChange).toHaveBeenLastCalledWith("new");
    // The focus went with it: from the second, the one before is the first again.
    await user.keyboard("{ArrowLeft}");
    expect(onChange).toHaveBeenLastCalledWith("active");
    // From the first, the one before is the last.
    await user.keyboard("{ArrowLeft}");
    expect(onChange).toHaveBeenLastCalledWith("inactive");
  });
});
