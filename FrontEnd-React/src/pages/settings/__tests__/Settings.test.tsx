import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { AppThemeProvider } from "../../../theme/AppThemeProvider";
import SettingsPage from "../Settings";

const KEY = "edushiksha.appearance.v1";

beforeEach(() => localStorage.clear());
afterEach(cleanup);

function openPage() {
  render(
    <MemoryRouter>
      <AppThemeProvider>
        <SettingsPage />
      </AppThemeProvider>
    </MemoryRouter>
  );
  return userEvent.setup();
}
const themes = () => screen.getByRole("group", { name: "Theme" });
const card = (name: string) => within(themes()).getByRole("button", { name: new RegExp(`^${name}`) });

describe("Settings > Appearance > Theme", () => {
  it("offers Classic (the look the app has), the look of the sign-up form and a green one; Classic is the one in use", () => {
    openPage();
    expect(within(themes()).getAllByRole("button")).toHaveLength(3);
    expect(card("Classic")).toHaveAttribute("aria-pressed", "true");
    expect(card("Onboarding")).toHaveAttribute("aria-pressed", "false");
    expect(card("Evergreen")).toHaveAttribute("aria-pressed", "false");
    // Classic keeps its own two choices.
    expect(screen.getByRole("group", { name: "Accent color" })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Display mode" })).toBeInTheDocument();
  });

  it("choosing one uses it at once and keeps it on this device; the accent and the display mode (Classic's) go away", async () => {
    const user = openPage();
    await user.click(card("Onboarding"));
    expect(card("Onboarding")).toHaveAttribute("aria-pressed", "true");
    expect(card("Classic")).toHaveAttribute("aria-pressed", "false");
    expect(JSON.parse(localStorage.getItem(KEY)!).theme).toBe("onboarding");
    expect(screen.queryByRole("group", { name: "Accent color" })).not.toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "Display mode" })).not.toBeInTheDocument();
  });

  it("going back to Classic finds the accent and the mode as they were", async () => {
    localStorage.setItem(KEY, JSON.stringify({ mode: "dark", accent: "#9a5269" }));
    const user = openPage();
    await user.click(card("Evergreen"));
    await user.click(card("Classic"));
    expect(card("Classic")).toHaveAttribute("aria-pressed", "true");
    expect(within(screen.getByRole("group", { name: "Display mode" })).getByRole("button", { name: /Dark/ })).toHaveAttribute("aria-pressed", "true");
    expect(JSON.parse(localStorage.getItem(KEY)!)).toEqual({ mode: "dark", accent: "#9a5269", theme: "classic" });
  });

  it("opens on the theme that was chosen before", () => {
    localStorage.setItem(KEY, JSON.stringify({ mode: "light", accent: "#2563eb", theme: "evergreen" }));
    openPage();
    expect(card("Evergreen")).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByRole("group", { name: "Accent color" })).not.toBeInTheDocument();
  });
});
