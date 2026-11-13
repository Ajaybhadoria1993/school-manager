import { afterEach, describe, expect, it } from "vitest";
import { cleanup, renderHook } from "@testing-library/react";
import { useRootTheme } from "../useRootTheme";
import type { ThemeName } from "../themes";

const root = () => document.documentElement;

afterEach(() => {
  cleanup();
  root().removeAttribute("style");
});

describe("a look's colours reach the dialogs and dropdowns too (they are drawn outside the shell)", () => {
  it("a look other than Classic puts its colours on the page's root while the app is open, and takes them off again", () => {
    const { unmount } = renderHook(() => useRootTheme("evergreen"));
    expect(root().style.getPropertyValue("--primary")).toBe("#0f766e");
    expect(root().style.getPropertyValue("--surface")).toBe("#ffffff");
    unmount();
    expect(root().style.getPropertyValue("--primary")).toBe("");
    expect(root().style.getPropertyValue("--surface")).toBe("");
  });

  it("Classic puts nothing on the root: it is the app as it was", () => {
    renderHook(() => useRootTheme("classic"));
    expect(root().getAttribute("style") ?? "").toBe("");
  });

  it("changing the look replaces the colours, and going back to Classic leaves none behind", () => {
    const { rerender } = renderHook(({ theme }: { theme: ThemeName }) => useRootTheme(theme), { initialProps: { theme: "onboarding" as ThemeName } });
    expect(root().style.getPropertyValue("--primary")).toBe("#2563eb");
    rerender({ theme: "evergreen" });
    expect(root().style.getPropertyValue("--primary")).toBe("#0f766e");
    rerender({ theme: "classic" });
    expect(root().style.getPropertyValue("--primary")).toBe("");
    expect(root().getAttribute("style") ?? "").toBe("");
  });
});
