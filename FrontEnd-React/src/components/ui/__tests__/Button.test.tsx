import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { Button } from "../Button";

/** Tailwind 4 gives a button the plain arrow; the app's buttons show the hand, like a link (the user asked, 2026-11-04). */
describe("Button", () => {
  it("shows the hand pointer", () => {
    render(<Button>Save</Button>);
    expect(screen.getByRole("button", { name: "Save" }).className).toContain("cursor-pointer");
  });
});
