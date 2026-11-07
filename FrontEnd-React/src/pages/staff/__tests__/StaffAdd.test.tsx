import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Provider } from "react-redux";
import { RouterProvider, createMemoryRouter } from "react-router";
import { ToastProvider } from "../../../components/ui/toast-context";
import { allApiSlices } from "../../../redux/api/apiRoot";
import store from "../../../redux/store";
import { fakeApi, type Call, type Handler } from "../../../test/fakeApi";
import type { StaffMember } from "../../../types";
import StaffAddPage from "../StaffAdd";

const MADE: StaffMember = {
  id: "new-staff",
  name: "Asha Rao",
  role: "receptionist",
  roleLabel: "Receptionist",
  email: "asha@school.example",
  mobile: null,
  gender: null,
  dateOfBirth: null,
  address: { line1: null, city: null, state: null, pincode: null },
  designation: null,
  employeeCode: null,
  joiningDate: null,
  status: "invited",
  invitedAt: "2026-11-07T00:00:00.000Z",
  acceptedAt: null,
};

function openPage(extra: Record<string, Handler> = {}) {
  const calls = fakeApi({
    "POST /staff/members": (body) => ({ ...MADE, ...(body as object), emailSent: true, inviteExpiresAt: "2026-11-09T00:00:00.000Z" }),
    ...extra,
  });
  const router = createMemoryRouter(
    [
      { path: "/staff/new", element: <StaffAddPage /> },
      { path: "/staff", element: <p>All staff</p> },
    ],
    { initialEntries: ["/staff/new"] }
  );
  render(
    <Provider store={store}>
      <ToastProvider>
        <RouterProvider router={router} />
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

const writes = (calls: Call[]) => calls.filter((c) => c.method !== "GET");
const send = (user: ReturnType<typeof userEvent.setup>) => user.click(screen.getByRole("button", { name: "Send invitation" }));
const server = (status: number, message: string, code: string, details: object[]) => () =>
  new Response(JSON.stringify({ success: false, message, code, details }), { status, headers: { "Content-Type": "application/json" } });

async function chooseRole(user: ReturnType<typeof userEvent.setup>, label: string) {
  await user.click(screen.getByRole("button", { name: /Role/ }));
  await user.click(await screen.findByRole("option", { name: label }));
}

async function fillRequired(user: ReturnType<typeof userEvent.setup>) {
  await chooseRole(user, "Receptionist");
  await user.type(screen.getByLabelText(/^Name/), "Asha Rao");
  await user.type(screen.getByLabelText(/^Email/), "Asha@School.Example");
}

describe("Add staff", () => {
  it("opens as one page of boxes with Send invitation, and asks the server for nothing", async () => {
    const { calls } = openPage();
    expect(await screen.findByRole("heading", { name: "Add staff" })).toBeInTheDocument();
    expect(screen.getByLabelText(/^Name/)).toBeInTheDocument();
    expect(screen.getByLabelText(/^Email/)).toBeInTheDocument();
    expect(screen.getByLabelText(/^Mobile number/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Send invitation" })).toBeInTheDocument();
    expect(calls).toHaveLength(0);
  });

  it("says what each role can do once it is chosen", async () => {
    const { user } = openPage();
    await screen.findByRole("heading", { name: "Add staff" });
    await chooseRole(user, "Management");
    expect(await screen.findByText(/who looks at how the school is doing/)).toBeInTheDocument();
  });

  it("will not send with the role, the name or the email missing, marks each in words, and sends nothing", async () => {
    const { calls, user } = openPage();
    await screen.findByRole("heading", { name: "Add staff" });
    await send(user);
    // "Choose the role" is also the Select's placeholder: the message is the one in the alert under the box.
    expect(await screen.findByText("Enter the name")).toBeInTheDocument();
    expect(document.getElementById("staff-role-error")).toHaveTextContent("Choose the role");
    expect(document.getElementById("staff-name-error")).toHaveTextContent("Enter the name");
    expect(document.getElementById("staff-email-error")).toHaveTextContent("Enter the email address");
    expect(writes(calls)).toHaveLength(0);
  });

  it("holds an email that is not one, and a mobile that is not 10 digits, until it is right", async () => {
    const { calls, user } = openPage();
    await screen.findByRole("heading", { name: "Add staff" });
    await fillRequired(user);
    await user.clear(screen.getByLabelText(/^Email/));
    await user.type(screen.getByLabelText(/^Email/), "not-an-email");
    await user.type(screen.getByLabelText(/^Mobile number/), "12345");
    await send(user);
    expect(await screen.findByText("Enter a valid email address")).toBeInTheDocument();
    expect(screen.getByText("Enter a 10-digit mobile number starting with 6, 7, 8 or 9")).toBeInTheDocument();
    expect(writes(calls)).toHaveLength(0);
  });

  it("sends the invitation in one request (email in lower case, empty boxes as null) and says it went", async () => {
    const { calls, user } = openPage();
    await screen.findByRole("heading", { name: "Add staff" });
    await fillRequired(user);
    await send(user);
    expect(await screen.findByRole("heading", { name: "Invitation sent" })).toBeInTheDocument();
    expect(screen.getByText(/An email with a link was sent to asha@school.example/)).toHaveTextContent("joins as Receptionist");
    expect(writes(calls)).toHaveLength(1);
    expect(writes(calls)[0]).toMatchObject({
      method: "POST",
      path: "/staff/members",
      body: { name: "Asha Rao", role: "receptionist", email: "asha@school.example", mobile: null, designation: null, address: { line1: null, city: null, state: null, pincode: null } },
    });
    expect(screen.getByRole("link", { name: "Back to staff" })).toHaveAttribute("href", "/staff");
  });

  it("starts a clean form again from Add another", async () => {
    const { user } = openPage();
    await screen.findByRole("heading", { name: "Add staff" });
    await fillRequired(user);
    await send(user);
    await user.click(await screen.findByRole("button", { name: "Add another" }));
    expect(await screen.findByLabelText(/^Name/)).toHaveValue("");
    expect(screen.getByLabelText(/^Email/)).toHaveValue("");
  });

  it("says when the email did not go out, that the person is in Staff as Invited, and shows the link in development", async () => {
    const { user } = openPage({
      "POST /staff/members": (body) => ({ ...MADE, ...(body as object), emailSent: false, inviteExpiresAt: "2026-11-09T00:00:00.000Z", devInviteLink: "http://localhost:5173/accept-invite?token=abc" }),
    });
    await screen.findByRole("heading", { name: "Add staff" });
    await fillRequired(user);
    await send(user);
    expect(await screen.findByRole("heading", { name: "Asha Rao is added, but the email did not go out" })).toBeInTheDocument();
    expect(screen.getByText(/is in Staff as Invited/)).toHaveTextContent("Resend invite");
    expect(screen.getByText(/Link \(development only/)).toHaveTextContent("accept-invite?token=abc");
  });

  it("puts the server's refusal of an email that already has a login under the email box", async () => {
    const { user } = openPage({
      "POST /staff/members": server(409, "This email already has a login or an invitation. Use another email.", "EMAIL_IN_USE", [{ path: "email", message: "This email already has a login or an invitation" }]),
    });
    await screen.findByRole("heading", { name: "Add staff" });
    await fillRequired(user);
    await send(user);
    expect(await screen.findByText("This email already has a login or an invitation")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByLabelText(/^Email/)).toHaveFocus());
    // Typing in the box clears the refusal.
    await user.type(screen.getByLabelText(/^Email/), "x");
    expect(screen.queryByText("This email already has a login or an invitation")).not.toBeInTheDocument();
  });

  it("shows the server's words when the refusal names no box", async () => {
    const { user } = openPage({ "POST /staff/members": server(409, "A school can have up to 200 staff members.", "LIMIT_REACHED", []) });
    await screen.findByRole("heading", { name: "Add staff" });
    await fillRequired(user);
    await send(user);
    expect(await screen.findByText("A school can have up to 200 staff members.")).toBeInTheDocument();
  });
});
