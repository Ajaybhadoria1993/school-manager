import { afterEach, describe, expect, it, vi } from "vitest";
import { useState } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Hash } from "lucide-react";
import { BoxedControls, Input } from "../Input";

/**
 * An email is always kept in small letters: whatever is typed or pasted into an email box turns into small letters right there in the box,
 * and the page that owns the box only ever hears the small-letter version. Other boxes keep what is typed.
 */

function Box(props: React.ComponentProps<typeof Input> & { seen?: (v: string) => void }) {
  const { seen, ...rest } = props;
  const [value, setValue] = useState("");
  return (
    <Input
      aria-label="box"
      {...rest}
      value={value}
      onChange={(e) => {
        setValue(e.target.value);
        seen?.(e.target.value);
      }}
    />
  );
}

afterEach(cleanup);

describe("Input: email boxes keep small letters", () => {
  it("turns capital letters into small ones as they are typed", async () => {
    const user = userEvent.setup();
    render(<Box type="email" />);
    await user.type(screen.getByLabelText("box"), "Principal.Meena@Sunrise-School.IN");
    expect(screen.getByLabelText("box")).toHaveValue("principal.meena@sunrise-school.in");
  });

  it("tells the page only the small-letter version", async () => {
    const user = userEvent.setup();
    const seen = vi.fn();
    render(<Box type="email" seen={seen} />);
    await user.type(screen.getByLabelText("box"), "AB");
    expect(seen.mock.calls.map((c) => c[0])).toEqual(["a", "ab"]);
  });

  it("turns a pasted address into small letters", async () => {
    const user = userEvent.setup();
    render(<Box type="email" />);
    await user.click(screen.getByLabelText("box"));
    await user.paste("Meena.Singh@Example.COM");
    expect(screen.getByLabelText("box")).toHaveValue("meena.singh@example.com");
  });

  it("works for a box that is not marked as an email when it asks for small letters (the sign-in box takes an email or a username)", async () => {
    const user = userEvent.setup();
    render(<Box type="text" lowercase />);
    await user.type(screen.getByLabelText("box"), "Meena@Example.COM");
    expect(screen.getByLabelText("box")).toHaveValue("meena@example.com");
  });

  it("keeps the cursor where it was when a capital letter is typed in the middle", async () => {
    const user = userEvent.setup();
    render(<Box type="text" lowercase />);
    const box = screen.getByLabelText<HTMLInputElement>("box");
    await user.type(box, "ab");
    box.setSelectionRange(1, 1);
    await user.keyboard("X");
    expect(box).toHaveValue("axb");
    expect(box.selectionStart).toBe(2);
    await user.keyboard("Y");
    expect(box).toHaveValue("axyb");
  });

  it("an email box stays an email box after turning letters small", async () => {
    const user = userEvent.setup();
    render(<Box type="email" />);
    await user.type(screen.getByLabelText("box"), "Meena@Example.COM");
    expect(screen.getByLabelText("box")).toHaveAttribute("type", "email");
  });

  it("leaves every other box alone: names and the rest keep their capital letters", async () => {
    const user = userEvent.setup();
    render(<Box type="text" />);
    await user.type(screen.getByLabelText("box"), "Meena Singh");
    expect(screen.getByLabelText("box")).toHaveValue("Meena Singh");
  });

  it("an email box can still be filled by a page that sets the value itself (a saved address is shown as it is)", () => {
    render(<Input aria-label="box" type="email" value="meena@example.com" onChange={() => {}} />);
    expect(screen.getByLabelText("box")).toHaveValue("meena@example.com");
  });
});

describe("Input: the boxed look of the admission form", () => {
  it("is taller, with a firm border", () => {
    render(
      <BoxedControls>
        <Input aria-label="box" />
      </BoxedControls>
    );
    expect(screen.getByLabelText("box").className).toMatch(/(^|\s)h-12(\s|$)/);
    expect(screen.getByLabelText("box").className).toContain("border-foreground/60");
  });

  it("puts its icon in a block of its own at the left, and leaves the text room", () => {
    const { container } = render(
      <BoxedControls>
        <Input aria-label="box" icon={Hash} />
      </BoxedControls>
    );
    expect(container.querySelector('[data-slot="control-icon"] svg')).not.toBeNull();
    expect(screen.getByLabelText("box").className).toMatch(/(^|\s)pl-14(\s|$)/);
  });

  it("every other form keeps its usual box", () => {
    const { container } = render(<Input aria-label="box" icon={Hash} />);
    expect(screen.getByLabelText("box").className).toMatch(/(^|\s)h-10(\s|$)/);
    expect(screen.getByLabelText("box").className).not.toContain("border-foreground/60");
    expect(container.querySelector('[data-slot="control-icon"]')).toBeNull();
  });

  it("a height asked for by the page wins", () => {
    render(
      <BoxedControls>
        <Input aria-label="box" className="h-9" />
      </BoxedControls>
    );
    expect(screen.getByLabelText("box").className).toMatch(/(^|\s)h-9(\s|$)/);
    expect(screen.getByLabelText("box").className).not.toMatch(/(^|\s)h-12(\s|$)/);
  });
});
