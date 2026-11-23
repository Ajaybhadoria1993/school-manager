import { afterEach, describe, expect, it } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { Provider } from "react-redux";
import { MemoryRouter } from "react-router";
import store from "../../../redux/store";
import { sessionStarted, signedOut } from "../../../redux/slices/authSlice";
import { ThemeScope } from "../../../theme/themeScope";
import type { ThemeName } from "../../../theme/themes";
import { Sidebar } from "../Sidebar";

function openMenu(theme?: ThemeName) {
  store.dispatch(
    sessionStarted({
      user: { id: "u1", name: "Asha Verma", email: "asha@sunrise.example", username: null, role: "school_admin", tenantId: "t1", emailVerifiedAt: null },
      tenant: { id: "t1", name: "Sunrise Public School", approvalStatus: "approved", isActive: true, mediums: [] },
    } as never)
  );
  const menu = (
    <Provider store={store}>
      <MemoryRouter initialEntries={["/dashboard"]}>
        <Sidebar mobileOpen={false} onClose={() => {}} />
      </MemoryRouter>
    </Provider>
  );
  render(theme ? <ThemeScope theme={theme}>{menu}</ThemeScope> : menu);
}

afterEach(() => {
  cleanup();
  act(() => {
    store.dispatch(signedOut());
  });
});

const wordmark = () => screen.getByText("Shiksha");

describe("the menu in each look", () => {
  it("Classic: the light menu it always was, with the wordmark for a light background", () => {
    openMenu();
    expect(wordmark().className).toContain("text-brand");
    expect(wordmark().className).not.toContain("text-sky");
    expect(wordmark().parentElement!.className).toContain("text-foreground");
  });

  it("a look of the sign-up form: the wordmark is the one for a dark background, and the menu carries the class the style sheet makes deep", () => {
    for (const theme of ["onboarding", "evergreen"] as const) {
      openMenu(theme);
      // The wordmark of the reference pictures: Edu in white, Shiksha in orange.
      expect(wordmark().className).toContain("text-orange");
      expect(wordmark().parentElement!.className).toContain("text-white");
      expect(document.querySelector("aside.app-sidebar")).not.toBeNull();
      cleanup();
      act(() => {
        store.dispatch(signedOut());
      });
    }
  });

  it("a deep look: the lit row is a lighter band with an orange bar at its left, and the logo sits on a white rounded square", () => {
    openMenu("onboarding");
    const lit = screen.getByRole("link", { name: "Dashboard" });
    expect(lit).toHaveAttribute("aria-current", "page");
    expect(lit.className).toContain("bg-white/15");
    expect(lit.className).toContain("before:bg-orange");
    const logo = document.querySelector<HTMLImageElement>('aside img[src="/brand/logo-mark.svg"]');
    expect(logo?.className).toContain("bg-white");
    expect(logo?.className).toContain("rounded-xl");
  });

  it("a deep look: the icon of a folding row (Timetable, Attendance...) is plain like the others, without a chip behind it", () => {
    openMenu("onboarding");
    for (const name of ["Timetable", "Attendance", "Manage school"]) {
      for (const row of screen.getAllByRole("button", { name: new RegExp("^" + name) })) {
        const chip = row.querySelector("span")!;
        expect(chip.className, name).not.toContain("bg-surface-muted");
        expect(chip.className, name).not.toContain("bg-primary");
      }
    }
    cleanup();
    act(() => {
      store.dispatch(signedOut());
    });
    // Classic keeps the chip.
    openMenu();
    const classic = screen.getByRole("button", { name: /^Timetable/ }).querySelector("span")!;
    expect(classic.className).toContain("bg-surface-muted");
  });

  it("Classic keeps its own lit row (the colour of the look, no orange bar) and the logo as it was", () => {
    openMenu();
    const lit = screen.getByRole("link", { name: "Dashboard" });
    expect(lit.className).toContain("bg-primary");
    expect(lit.className).not.toContain("before:bg-orange");
    const logo = document.querySelector<HTMLImageElement>('aside img[src="/brand/logo-mark.svg"]');
    expect(logo?.className).not.toContain("bg-white");
  });

  it("the menu has the class in Classic too (the style sheet only changes it in the other looks)", () => {
    openMenu();
    expect(document.querySelector("aside.app-sidebar")).not.toBeNull();
  });
});
