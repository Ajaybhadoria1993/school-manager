import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { Button } from "../Button";

/** Tailwind 4 gives a button the plain arrow; the app's buttons show the hand, like a link (the user asked, 2026-11-04). */
describe("Button", () => {
  it("shows the hand pointer", () => {
    render(<Button>Save</Button>);
    expect(screen.getByRole("button", { name: "Save" }).className).toContain("cursor-pointer");
  });

  it("has an orange look for the one main action of a page (2026-11-22, the reference pictures), in place of the primary colour", () => {
    render(<Button variant="accent">Save attendance</Button>);
    const button = screen.getByRole("button", { name: "Save attendance" });
    expect(button.className).toContain("bg-orange");
    expect(button.className).toContain("hover:bg-orange-hover");
    expect(button.className).not.toContain("bg-primary");
  });
});
