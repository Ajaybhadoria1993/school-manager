import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import LandingPage from "../LandingPage";

/**
 * The front page: the two ways in are "Login" (someone already registered) and "Register your school" (a new school).
 * Both sit in the top bar at every width, so nobody has to open a menu to find them.
 */

const show = () =>
  render(
    <MemoryRouter>
      <LandingPage />
    </MemoryRouter>
  );

afterEach(cleanup);

describe("landing page: the two ways in", () => {
  it("shows Login and Register your school in the top bar", () => {
    show();
    const bar = screen.getByRole("banner");
    expect(within(bar).getByRole("link", { name: "Login" })).toHaveAttribute("href", "/login");
    expect(within(bar).getByRole("link", { name: /Register/ })).toHaveAttribute("href", "/signup");
  });

  it("keeps Login visible on a phone (not hidden below the small breakpoint)", () => {
    show();
    const login = within(screen.getByRole("banner")).getByRole("link", { name: "Login" });
    expect(login.className).not.toMatch(/(^|\s)hidden(\s|$)/);
  });

  it("calls it Login everywhere on this page, never Sign in", () => {
    show();
    expect(screen.queryByText("Sign in")).not.toBeInTheDocument();
    // top bar, hero, call-to-action band, footer account column, footer line
    expect(screen.getAllByRole("link", { name: "Login" }).length).toBeGreaterThanOrEqual(4);
    for (const link of screen.getAllByRole("link", { name: "Login" })) expect(link).toHaveAttribute("href", "/login");
  });

  it("keeps the Register your school link to the sign-up page in the hero", () => {
    show();
    const hero = document.getElementById("top")!;
    expect(within(hero).getByRole("link", { name: /Register your school/ })).toHaveAttribute("href", "/signup");
    expect(within(hero).getByRole("link", { name: "Login" })).toHaveAttribute("href", "/login");
  });
});

describe("landing page: the section links in the top bar", () => {
  it("lists the four sections for a wide screen", () => {
    show();
    const nav = within(screen.getByRole("banner")).getAllByRole("navigation", { name: "Sections" })[0];
    for (const label of ["What you get", "How it works", "Who it's for", "Roadmap"]) {
      expect(within(nav).getByRole("link", { name: label })).toBeInTheDocument();
    }
  });

  it("opens the phone menu with the same four sections, and closes it on Escape", async () => {
    const user = userEvent.setup();
    show();
    await user.click(screen.getByRole("button", { name: "Open menu" }));
    const menu = document.getElementById("landing-menu")!;
    expect(within(menu).getAllByRole("link")).toHaveLength(4);
    await user.keyboard("{Escape}");
    expect(document.getElementById("landing-menu")).toBeNull();
  });
});
