import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Provider } from "react-redux";
import { ToastProvider } from "../../ui/toast-context";
import { allApiSlices } from "../../../redux/api/apiRoot";
import store from "../../../redux/store";
import type { AcademicStructure } from "../../../types";
import { fakeApi } from "../../../test/fakeApi";
import { STRUCTURE as BASE } from "../../../test/schoolClass";
import { InactiveList } from "../InactiveList";

const NOTE = { at: "2026-11-10T10:00:00.000Z", by: { name: "Meena Rao", role: "school_admin" } };
const structure = (extra: Partial<AcademicStructure>): AcademicStructure => ({ ...BASE, ...extra });

function show(s: AcademicStructure, handlers: Parameters<typeof fakeApi>[0] = {}) {
  const calls = fakeApi(handlers);
  render(
    <Provider store={store}>
      <ToastProvider>
        <InactiveList structure={s} />
      </ToastProvider>
    </Provider>
  );
  return { calls, user: userEvent.setup() };
}

afterEach(() => {
  cleanup();
  for (const api of allApiSlices) store.dispatch(api.util.resetApiState());
  vi.unstubAllGlobals();
});

describe("the inactive classes and departments", () => {
  it("is not on the page when nothing is inactive", () => {
    render(
      <Provider store={store}>
        <ToastProvider>
          <InactiveList structure={structure({})} />
        </ToastProvider>
      </Provider>
    );
    expect(screen.queryByRole("button", { name: /Inactive/ })).toBeNull();
    expect(screen.queryByText(/Inactive \(/)).toBeNull();
  });

  it("is closed until opened, and counts what is in it", async () => {
    const { user } = show(
      structure({
        inactiveClasses: [{ id: "c10", name: "Class 10", order: 10, departmentId: "d1", capacity: 40, status: "inactive", inactive: NOTE, sections: [] }],
        inactiveDepartments: [{ id: "d9", name: "Archive", classCount: 0, status: "inactive", inactive: NOTE }],
      })
    );
    const toggle = screen.getByRole("button", { name: /Inactive \(2\)/ });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("Class 10")).toBeNull();

    await user.click(toggle);
    expect(await screen.findByText("Class 10")).toBeInTheDocument();
    expect(screen.getByText("Archive")).toBeInTheDocument();
    // Who made it inactive and when, and where the class was.
    expect(screen.getAllByText(/Made inactive by Meena Rao on/).length).toBe(2);
    expect(screen.getByText(/Was in Primary/)).toBeInTheDocument();
  });

  it("makes a class active again with one click, sending nothing else", async () => {
    const { calls, user } = show(
      structure({ inactiveClasses: [{ id: "c10", name: "Class 10", order: 10, departmentId: null, capacity: 40, status: "inactive", inactive: NOTE, sections: [] }] }),
      { "POST /academics/classes/c10/reactivate": () => ({ id: "c10", name: "Class 10", status: "active" }) }
    );
    await user.click(screen.getByRole("button", { name: /Inactive \(1\)/ }));
    await user.click(await screen.findByRole("button", { name: "Make Class 10 active" }));
    await waitFor(() => expect(calls.filter((c) => c.method === "POST")).toHaveLength(1));
    expect(calls[0]).toMatchObject({ method: "POST", path: "/academics/classes/c10/reactivate" });
  });

  it("shows the server's reason when a class cannot come back (its department is inactive)", async () => {
    const { user } = show(
      structure({ inactiveClasses: [{ id: "c10", name: "Class 10", order: 10, departmentId: "d9", capacity: 40, status: "inactive", inactive: NOTE, sections: [] }] }),
      {
        "POST /academics/classes/c10/reactivate": () =>
          new Response(JSON.stringify({ success: false, message: "Class 10 belongs to Archive, which is inactive. Make Archive active first.", code: "DEPARTMENT_INACTIVE" }), {
            status: 409,
            headers: { "Content-Type": "application/json" },
          }),
      }
    );
    await user.click(screen.getByRole("button", { name: /Inactive \(1\)/ }));
    await user.click(await screen.findByRole("button", { name: "Make Class 10 active" }));
    expect(await screen.findByText("Class 10 belongs to Archive, which is inactive. Make Archive active first.")).toBeInTheDocument();
    // The row is still there: nothing changed.
    expect(within(screen.getByRole("list")).getByText("Class 10")).toBeInTheDocument();
  });

  it("makes a department active again", async () => {
    const { calls, user } = show(structure({ inactiveDepartments: [{ id: "d9", name: "Archive", classCount: 0, status: "inactive", inactive: NOTE }] }), {
      "POST /academics/departments/d9/reactivate": () => ({ id: "d9", name: "Archive", status: "active" }),
    });
    await user.click(screen.getByRole("button", { name: /Inactive \(1\)/ }));
    await user.click(await screen.findByRole("button", { name: "Make Archive active" }));
    await waitFor(() => expect(calls.filter((c) => c.method === "POST")).toHaveLength(1));
    expect(calls[0].path).toBe("/academics/departments/d9/reactivate");
  });
});
