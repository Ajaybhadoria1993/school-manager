import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AppThemeProvider, appearanceStyle, useAppTheme } from "../AppThemeProvider";
import { THEMES, isThemeName } from "../themes";
import { ThemeScope } from "../themeScope";
import { useThemeScope } from "../themeScopeContext";

const KEY = "edushiksha.appearance.v2";
const style = (over: Partial<Parameters<typeof appearanceStyle>[0]> = {}) => appearanceStyle({ mode: "light", accent: "#8b684f", theme: "classic", ...over }) as Record<string, string>;

beforeEach(() => localStorage.clear());
afterEach(cleanup);

function Probe() {
  const { theme, setTheme, mode, accent } = useAppTheme();
  return (
    <div>
      <p data-testid="theme">{theme}</p>
      <p data-testid="mode">{mode}</p>
      <p data-testid="accent">{accent}</p>
      <button onClick={() => setTheme("onboarding")}>Pick onboarding</button>
      <button onClick={() => setTheme("nonsense" as never)}>Pick nonsense</button>
    </div>
  );
}
const show = () =>
  render(
    <AppThemeProvider>
      <Probe />
    </AppThemeProvider>
  );

describe("the themes the app offers", () => {
  it("are Classic (the app as it was, first), the look of the sign-up form and a green one", () => {
    expect(THEMES.map((t) => t.id)).toEqual(["classic", "onboarding", "evergreen"]);
    expect(THEMES.every((t) => t.name && t.description)).toBe(true);
    expect(isThemeName("onboarding")).toBe(true);
    expect(isThemeName("dark")).toBe(false);
    expect(isThemeName(undefined)).toBe(false);
  });
});

describe("the chosen theme is remembered on this device", () => {
  it("is the Onboarding look (the reference pictures, 2026-11-22) when nothing was chosen", () => {
    show();
    expect(screen.getByTestId("theme")).toHaveTextContent("onboarding");
  });

  it("an appearance saved under the first key (everyone had Classic then, without choosing) is not read: every device starts on the new look once", () => {
    localStorage.setItem("edushiksha.appearance.v1", JSON.stringify({ mode: "dark", accent: "#2563eb", theme: "classic" }));
    show();
    expect(screen.getByTestId("theme")).toHaveTextContent("onboarding");
  });

  it("a saved appearance with no theme in it keeps its accent and mode, as Classic", () => {
    localStorage.setItem(KEY, JSON.stringify({ mode: "dark", accent: "#2563eb" }));
    show();
    expect(screen.getByTestId("theme")).toHaveTextContent("classic");
    cleanup();
    localStorage.setItem(KEY, JSON.stringify({ mode: "dark", accent: "#2563eb" }));
    show();
    expect(screen.getByTestId("theme")).toHaveTextContent("classic");
    expect(screen.getByTestId("mode")).toHaveTextContent("dark");
    expect(screen.getByTestId("accent")).toHaveTextContent("#2563eb");
  });

  it("a saved theme the app does not know is Classic", () => {
    localStorage.setItem(KEY, JSON.stringify({ mode: "light", accent: "#2563eb", theme: "neon" }));
    show();
    expect(screen.getByTestId("theme")).toHaveTextContent("classic");
  });

  it("choosing one saves it with the accent and mode, so going back to Classic finds them as they were", async () => {
    localStorage.setItem(KEY, JSON.stringify({ mode: "dark", accent: "#9a5269" }));
    show();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Pick onboarding" }));
    expect(screen.getByTestId("theme")).toHaveTextContent("onboarding");
    expect(JSON.parse(localStorage.getItem(KEY)!)).toEqual({ mode: "dark", accent: "#9a5269", theme: "onboarding" });
  });

  it("a theme that does not exist is not taken", async () => {
    show();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Pick nonsense" }));
    expect(screen.getByTestId("theme")).toHaveTextContent("onboarding");
  });
});

describe("the colours of each theme", () => {
  it("Classic is what it always was: its accent, and its light or dark mode", () => {
    const light = style();
    expect(light["--primary"]).toBe("#8b684f");
    expect(light["--background"]).toBe("#faf8f5");
    // Classic has no deep menu: the menu is as light as the page.
    expect(light["--menu-from"]).toBeUndefined();
    const dark = style({ mode: "dark" });
    expect(dark["--background"]).toBe("#171614");
    expect(dark.colorScheme).toBe("dark");
  });

  it("the other themes have colours of their own: the accent and the display mode do not change them", () => {
    for (const theme of ["onboarding", "evergreen"] as const) {
      const plain = style({ theme });
      const other = style({ theme, accent: "#9a5269", mode: "dark" });
      expect(other).toEqual(plain);
      expect(plain.colorScheme).toBe("light");
      expect(plain["--surface"]).toBe("#ffffff");
      expect(plain["--menu-from"]).toBeTruthy();
      expect(plain["--menu-to"]).toBeTruthy();
      expect(plain["--menu-active"]).toBeTruthy();
    }
    expect(style({ theme: "onboarding" })["--primary"]).toBe("#2563eb");
    // The royal blue of the reference pictures (2026-11-22), brighter than the navy it was.
    expect(style({ theme: "onboarding" })["--menu-from"]).toBe("#1243b5");
    expect(style({ theme: "onboarding" })["--menu-to"]).toBe("#0b2c83");
    expect(style({ theme: "onboarding" })["--background"]).toBe("#f4f7fd");
    expect(style({ theme: "evergreen" })["--primary"]).toBe("#0f766e");
  });

  it("every look other than Classic has the orange of the reference pictures for its main actions and badges", () => {
    for (const theme of ["onboarding", "evergreen"] as const) {
      const themed = style({ theme });
      expect(themed["--orange"]).toBe("#f59e0b");
      expect(themed["--orange-hover"]).toBeTruthy();
      expect(themed["--orange-soft"]).toBeTruthy();
    }
  });

  it("the dashboard's charts: blue, orange and slate in the looks of the reference pictures; Classic has none of its own (its bronze is in the style sheet)", () => {
    for (const theme of ["onboarding", "evergreen"] as const) {
      const themed = style({ theme });
      expect(themed["--chart-1"]).toBe("#2563eb");
      expect(themed["--chart-2"]).toBe("#f59e0b");
      expect(themed["--chart-3"]).toBe("#808892");
    }
    expect(style({ theme: "classic" })["--chart-1"]).toBeUndefined();
  });

  it("every look keeps the same status colours and the form strips take the look's colour", () => {
    const classic = style();
    for (const theme of ["onboarding", "evergreen"] as const) {
      const themed = style({ theme });
      for (const token of ["--success", "--warning", "--danger", "--info"]) expect(themed[token]).toBe(classic[token]);
      expect(themed["--gold"]).toBe(themed["--primary"]);
    }
  });
});

describe("the scope a look is read from", () => {
  function Reader() {
    return <p data-testid="scope">{useThemeScope()}</p>;
  }

  it("is Classic outside the shell, and the look inside it", () => {
    render(<Reader />);
    expect(screen.getByTestId("scope")).toHaveTextContent("classic");
    cleanup();
    render(
      <ThemeScope theme="evergreen">
        <Reader />
      </ThemeScope>
    );
    expect(screen.getByTestId("scope")).toHaveTextContent("evergreen");
  });
});
