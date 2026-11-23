import { describe, expect, it } from "vitest";
import { router } from "../AppRoutes";

/** The first address a person opens: the school's sign-in page, not a landing page (the landing page was taken away, 2026-11-21). */
describe("the home address", () => {
  it("leads straight to the sign-in page", async () => {
    await router.navigate("/");
    expect(router.state.location.pathname).toBe("/login");
  });

  it("keeps what came after it (a reason for signing in again)", async () => {
    await router.navigate("/?reason=expired");
    expect(router.state.location.pathname).toBe("/login");
    expect(router.state.location.search).toBe("?reason=expired");
  });

  it("has no landing page route of its own any more", () => {
    const paths = router.routes[0].children?.map((r) => r.path);
    expect(paths).toContain("login");
    expect(paths).toContain("signup");
    // "/" is only a redirect: it has a loader and no page.
    const home = router.routes[0].children?.find((r) => r.path === "/");
    expect(home?.loader).toBeTypeOf("function");
    expect(home?.lazy).toBeUndefined();
    expect(home?.Component).toBeUndefined();
  });
});
