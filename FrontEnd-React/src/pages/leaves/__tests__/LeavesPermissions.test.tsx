import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { Provider } from "react-redux";
import { RouterProvider, createMemoryRouter } from "react-router";
import { ToastProvider } from "../../../components/ui/toast-context";
import { allApiSlices } from "../../../redux/api/apiRoot";
import store from "../../../redux/store";
import { fakeApi } from "../../../test/fakeApi";
import { signInAs, signOut } from "../../../test/session";
import type { Leave, UserRole } from "../../../types";
import LeavesPage from "../LeavesPage";

const FEVER: Leave = {
  id: "l1",
  student: { id: "s1", name: "Asha Verma", admissionNumber: "ADM-2026-0001" },
  label: "Class 5 - A",
  fromDate: "2026-11-12",
  toDate: "2026-11-13",
  days: 2,
  reason: "Fever",
  appliedBy: "Ravi Verma (Father)",
  status: "pending",
  note: null,
  decidedBy: null,
  decidedAt: null,
  createdAt: "2026-11-04T08:00:00.000Z",
};

function openPage(role: UserRole, permissions: string[]) {
  signInAs(role, permissions);
  fakeApi({ "GET /classroom/leaves": () => ({ items: [FEVER] }) });
  const router = createMemoryRouter([{ path: "/leaves", element: <LeavesPage /> }], { initialEntries: ["/leaves"] });
  render(
    <Provider store={store}>
      <ToastProvider>
        <RouterProvider router={router} />
      </ToastProvider>
    </Provider>
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  signOut();
  for (const slice of allApiSlices) store.dispatch(slice.util.resetApiState());
});

describe("leave requests follow what the school allowed", () => {
  it("a person who may only see them reads each request and has no Approve or Decline", async () => {
    openPage("receptionist", ["leaves.view"]);
    expect(await screen.findByText("Fever")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Approve/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Decline/ })).not.toBeInTheDocument();
  });

  it("a person who may answer them has both buttons", async () => {
    openPage("receptionist", ["leaves.view", "leaves.decide"]);
    expect(await screen.findByRole("button", { name: /Approve/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Decline/ })).toBeInTheDocument();
  });

  it("a teacher with the usual list answers the leaves of their class, as before", async () => {
    openPage("teacher", ["leaves.view", "leaves.decide"]);
    expect(await screen.findByRole("button", { name: /Approve/ })).toBeInTheDocument();
  });
});
