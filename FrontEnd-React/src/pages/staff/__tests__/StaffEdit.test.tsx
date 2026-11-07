import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Provider } from "react-redux";
import { RouterProvider, createMemoryRouter } from "react-router";
import { ToastProvider } from "../../../components/ui/toast-context";
import { allApiSlices } from "../../../redux/api/apiRoot";
import store from "../../../redux/store";
import { fakeApi, type Call, type Handler } from "../../../test/fakeApi";
import type { StaffMember } from "../../../types";
import StaffEditPage from "../StaffEdit";

const ASHA: StaffMember = {
  id: "asha",
  name: "Asha Rao",
  role: "receptionist",
  roleLabel: "Receptionist",
  email: "asha@school.example",
  mobile: "9876543210",
  gender: "Female",
  dateOfBirth: null,
  address: { line1: "5 MG Road", city: "Bhopal", state: "Madhya Pradesh", pincode: "462001" },
  designation: "Front desk",
  employeeCode: "S-1",
  joiningDate: null,
  status: "active",
  invitedAt: "2026-11-01T00:00:00.000Z",
  acceptedAt: "2026-11-02T00:00:00.000Z",
};

function openPage(extra: Record<string, Handler> = {}) {
  const calls = fakeApi({
    "GET /staff/members/asha": () => ASHA,
    "PATCH /staff/members/asha": (body) => ({ ...ASHA, ...(body as object) }),
    ...extra,
  });
  const router = createMemoryRouter(
    [
      { path: "/staff/:id/edit", element: <StaffEditPage /> },
      { path: "/staff", element: <p>All staff</p> },
    ],
    { initialEntries: ["/staff/asha/edit"] }
  );
  render(
    <Provider store={store}>
      <ToastProvider>
        <RouterProvider router={router} />
      </ToastProvider>
    </Provider>
  );
  return { calls, router, user: userEvent.setup() };
}

afterEach(() => {
  cleanup();
  for (const api of allApiSlices) store.dispatch(api.util.resetApiState());
  vi.unstubAllGlobals();
});

const writes = (calls: Call[]) => calls.filter((c) => c.method !== "GET");
const server = (status: number, message: string, code: string, details: object[]) => () =>
  new Response(JSON.stringify({ success: false, message, code, details }), { status, headers: { "Content-Type": "application/json" } });

describe("Change staff", () => {
  it("opens with the person's details, the email fixed, and Save changes off until something changes", async () => {
    const { calls } = openPage();
    expect(await screen.findByRole("heading", { name: "Change staff" })).toBeInTheDocument();
    expect(screen.getByLabelText(/^Name/)).toHaveValue("Asha Rao");
    expect(screen.getByLabelText(/^Email/)).toHaveValue("asha@school.example");
    expect(screen.getByLabelText(/^Email/)).toBeDisabled();
    expect(screen.getByLabelText(/^Mobile number/)).toHaveValue("9876543210");
    expect(screen.getByLabelText(/^Designation/)).toHaveValue("Front desk");
    expect(screen.getByRole("button", { name: "Save changes" })).toBeDisabled();
    expect(calls.map((c) => `${c.method} ${c.path}`)).toEqual(["GET /staff/members/asha"]);
  });

  it("saves in one request without the email, goes back to Staff, and says it is saved", async () => {
    const { calls, router, user } = openPage();
    const name = await screen.findByLabelText(/^Name/);
    await user.clear(name);
    await user.type(name, "Asha R. Rao");
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    await screen.findByText("All staff");
    expect(router.state.location.pathname).toBe("/staff");
    expect(writes(calls)).toHaveLength(1);
    expect(writes(calls)[0]).toMatchObject({ method: "PATCH", path: "/staff/members/asha", body: { name: "Asha R. Rao", role: "receptionist" } });
    expect(writes(calls)[0].body).not.toHaveProperty("email");
    expect(await screen.findByText("Asha R. Rao is saved")).toBeInTheDocument();
  });

  it("will not save with the name emptied, and says so under the box", async () => {
    const { calls, user } = openPage();
    const name = await screen.findByLabelText(/^Name/);
    await user.clear(name);
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    expect(await screen.findByText("Enter the name")).toBeInTheDocument();
    expect(writes(calls)).toHaveLength(0);
  });

  it("puts a refused employee code under its box", async () => {
    const { user } = openPage({
      "PATCH /staff/members/asha": server(409, "Another staff member already has this employee code.", "STAFF_CODE_EXISTS", [{ path: "employeeCode", message: "Another staff member already has this employee code" }]),
    });
    const code = await screen.findByLabelText(/^Employee code/);
    await user.clear(code);
    await user.type(code, "S-2");
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    expect(await screen.findByText("Another staff member already has this employee code")).toBeInTheDocument();
  });

  it("says so, with the way back, when the person cannot be found", async () => {
    openPage({ "GET /staff/members/asha": server(404, "Staff member not found", "NOT_FOUND", []) });
    expect(await screen.findByText("Staff member not found")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "All staff" })).toHaveAttribute("href", "/staff");
  });
});
