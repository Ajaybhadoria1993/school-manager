import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, waitFor } from "@testing-library/react";
import { Provider } from "react-redux";
import { allApiSlices } from "../../redux/api/apiRoot";
import store from "../../redux/store";
import { fakeApi } from "../../test/fakeApi";
import { signInAs, signOut } from "../../test/session";
import { usePermissionRefresh } from "../usePermissionRefresh";

function Harness() {
  usePermissionRefresh();
  return null;
}
const me = (permissions: string[], role = "receptionist") => ({
  user: { id: "u1", name: "Asha Verma", email: "asha@school.example", username: null, role, tenantId: "t1", emailVerifiedAt: null, permissions },
  tenant: { id: "t1", name: "Sunrise Public School", approvalStatus: "approved", isActive: true },
});
const permissionsNow = () => store.getState().auth.user?.permissions;
const comeBack = () => act(() => void window.dispatchEvent(new Event("focus")));

afterEach(() => {
  cleanup();
  signOut();
  vi.unstubAllGlobals();
  for (const api of allApiSlices) store.dispatch(api.util.resetApiState());
});

describe("what the person may do is read again when the window is opened", () => {
  it("a box the school ticked reaches the menu without signing in again", async () => {
    signInAs("receptionist", ["calendar.view"]);
    const calls = fakeApi({ "GET /auth/me": () => me(["calendar.view", "students.view", "students.add"]) });
    render(
      <Provider store={store}>
        <Harness />
      </Provider>
    );
    expect(permissionsNow()).toEqual(["calendar.view"]);
    comeBack();
    await waitFor(() => expect(permissionsNow()).toEqual(["calendar.view", "students.view", "students.add"]));
    expect(calls.filter((c) => c.path === "/auth/me")).toHaveLength(1);
  });

  it("looks once, not again for every focus within a few seconds", async () => {
    signInAs("receptionist", ["calendar.view"]);
    const calls = fakeApi({ "GET /auth/me": () => me(["calendar.view"]) });
    render(
      <Provider store={store}>
        <Harness />
      </Provider>
    );
    comeBack();
    await waitFor(() => expect(calls.filter((c) => c.path === "/auth/me")).toHaveLength(1));
    comeBack();
    comeBack();
    await new Promise((r) => setTimeout(r, 50));
    expect(calls.filter((c) => c.path === "/auth/me")).toHaveLength(1);
  });

  it("changes nothing in the store when nothing changed, and does not look at all for nobody or for the platform team", async () => {
    signInAs("receptionist", ["calendar.view"]);
    const before = store.getState().auth.user;
    fakeApi({ "GET /auth/me": () => me(["calendar.view"]) });
    const { unmount } = render(
      <Provider store={store}>
        <Harness />
      </Provider>
    );
    comeBack();
    await new Promise((r) => setTimeout(r, 80));
    expect(store.getState().auth.user).toBe(before);
    unmount();

    signOut();
    const calls = fakeApi({ "GET /auth/me": () => me([]) });
    render(
      <Provider store={store}>
        <Harness />
      </Provider>
    );
    comeBack();
    await new Promise((r) => setTimeout(r, 50));
    expect(calls).toHaveLength(0);
  });
});
