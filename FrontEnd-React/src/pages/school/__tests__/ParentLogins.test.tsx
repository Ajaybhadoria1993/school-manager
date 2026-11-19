import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Provider } from "react-redux";
import { RouterProvider, createMemoryRouter } from "react-router";
import { ToastProvider } from "../../../components/ui/toast-context";
import { allApiSlices } from "../../../redux/api/apiRoot";
import store from "../../../redux/store";
import type { StudentDetail, StudentGuardian } from "../../../types";
import { fakeApi, type Call, type Handler } from "../../../test/fakeApi";
import { signInAs, signOut } from "../../../test/session";
import StudentDetailPage from "../StudentDetail";

/**
 * A parent's login on the student's page (2026-11-04): each parent's card says their login (the username, never the password) or offers
 * one; a login is one for all of that parent's children.
 */

const RAVI: StudentGuardian = { id: "g1", name: "Ravi Verma", relation: "Father", isPrimary: true, mobile: "9000000001", mobileVerified: false, alternateMobile: null, email: null, occupation: null, login: null };
const SITA: StudentGuardian = { id: "g2", name: "Sita Verma", relation: "Mother", isPrimary: false, mobile: null, mobileVerified: false, alternateMobile: null, email: null, occupation: null, login: { username: "sita.verma_20", isActive: true } };

const ASHA: StudentDetail = {
  id: "s1",
  firstName: "Asha",
  lastName: "Verma",
  name: "Asha Verma",
  gender: "Female",
  admissionNumber: "ADM-2026-0001",
  dateOfBirth: "2016-05-14",
  admissionDate: "2026-06-01",
  status: "active",
  place: { enrolmentId: "e1", classId: "c1", className: "Class 1", sectionId: null, sectionName: null, rollNumber: null },
  address: { line1: "12 MG Road", line2: null, city: "Bhopal", state: "Madhya Pradesh", pincode: "462001" },
  bloodGroup: null,
  category: null,
  previousSchool: null,
  custom: {},
  guardians: [RAVI, SITA],
  enrolments: [],
  siblings: [],
  inactive: null,
  moves: [],
  aadhaarNumber: null,
  samagraId: null,
  apaarId: null,
  pen: null,
  srNumber: null,
  religion: null,
  nationality: null,
  emergencyMobile: null,
  disability: null,
  medicalNotes: null,
  feeConcession: null,
  transportRoute: null,
  transportStop: null,
  rteSeat: false,
  bpl: false,
  createdAt: "2026-06-01T00:00:00.000Z",
};

function openPage(extra: Record<string, Handler> = {}, state?: object) {
  signInAs("school_admin");
  const calls = fakeApi({
    "GET /students/s1": () => ASHA,
    "GET /staff/usernames/check": () => ({ available: true, suggestions: [] }),
    "POST /students/guardians/g1/login": (body) => ({ guardianId: "g1", login: { username: (body as { username: string }).username, isActive: true } }),
    "POST /students/guardians/g2/reset-password": () => ({ guardianId: "g2", login: SITA.login }),
    "PATCH /students/guardians/g2/login": (body) => ({ guardianId: "g2", login: { username: (body as { username: string }).username, isActive: true } }),
    ...extra,
  });
  const router = createMemoryRouter(
    [
      { path: "/school/students/:id", element: <StudentDetailPage /> },
      { path: "/school/students", element: <p>The students</p> },
    ],
    { initialEntries: [{ pathname: "/school/students/s1", state }] }
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
  signOut();
  cleanup();
  for (const api of allApiSlices) store.dispatch(api.util.resetApiState());
  vi.unstubAllGlobals();
});

const writes = (calls: Call[]) => calls.filter((c) => c.method !== "GET");
const card = (name: string) => screen.getByRole("listitem", { name });

describe("a parent's login, on the student's page", () => {
  it("each parent's card says their login: the username with Change username and New password, or Make a login", async () => {
    openPage();
    await screen.findByRole("heading", { name: "Asha Verma", level: 1 });
    expect(within(card("Ravi Verma")).getByText("No login yet")).toBeInTheDocument();
    expect(within(card("Ravi Verma")).getByRole("button", { name: "Make a login for Ravi Verma" })).toBeInTheDocument();
    expect(within(card("Sita Verma")).getByText("sita.verma_20")).toBeInTheDocument();
    expect(within(card("Sita Verma")).getByRole("button", { name: "Change the username of Sita Verma" })).toBeInTheDocument();
    expect(within(card("Sita Verma")).getByRole("button", { name: "New password for Sita Verma" })).toBeInTheDocument();
  });

  it("Make a login: a username from the name and a password already made; saved, it shows them once to hand over", async () => {
    const { calls, user } = openPage();
    await user.click(await screen.findByRole("button", { name: "Make a login for Ravi Verma" }));
    const dialog = await screen.findByRole("dialog", { name: "Make a login for Ravi Verma" });
    const username = within(dialog).getByLabelText(/^Username/) as HTMLInputElement;
    expect(username.value).toMatch(/^ravi\.verma_\d{2}$/);
    await waitFor(() => expect(calls.some((c) => c.path === "/staff/usernames/check")).toBe(true));
    await user.click(within(dialog).getByRole("button", { name: "Make login" }));
    await waitFor(() => expect(writes(calls)).toHaveLength(1));
    const sent = writes(calls)[0];
    expect(sent).toMatchObject({ method: "POST", path: "/students/guardians/g1/login", body: { username: username.value } });
    const password = (sent.body as { password: string }).password;
    expect(password.length).toBeGreaterThanOrEqual(8);
    const details = await within(dialog).findByRole("region", { name: "Login details" });
    expect(details).toHaveTextContent(username.value);
    expect(details).toHaveTextContent(password);
  });

  it("a username made from the name that is already somebody's (another school's) is swapped at once for a free one", async () => {
    const { calls, user } = openPage({
      "GET /staff/usernames/check": (_body, query) =>
        query.get("username") === "ravi.verma_47" ? { available: true, suggestions: [] } : { available: false, suggestions: ["ravi.verma_47", "ravi.verma_83"] },
    });
    await user.click(await screen.findByRole("button", { name: "Make a login for Ravi Verma" }));
    const dialog = await screen.findByRole("dialog", { name: "Make a login for Ravi Verma" });
    await waitFor(() => expect(within(dialog).getByLabelText(/^Username/)).toHaveValue("ravi.verma_47"));
    expect(within(dialog).queryByText("This username is taken. Try another")).not.toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Make login" }));
    await waitFor(() => expect(writes(calls)).toHaveLength(1));
    expect(writes(calls)[0].body).toMatchObject({ username: "ravi.verma_47" });
  });

  it("a username the server refuses says why under the box, and nothing is shown as made", async () => {
    const message = "This username is taken. Try another, for example ravi.verma_41 or ravi.verma_77";
    const { user } = openPage({
      "POST /students/guardians/g1/login": () =>
        new Response(JSON.stringify({ success: false, message, code: "USERNAME_TAKEN", details: [{ path: "username", message }] }), { status: 409, headers: { "Content-Type": "application/json" } }),
    });
    await user.click(await screen.findByRole("button", { name: "Make a login for Ravi Verma" }));
    const dialog = await screen.findByRole("dialog", { name: "Make a login for Ravi Verma" });
    await user.click(within(dialog).getByRole("button", { name: "Make login" }));
    expect(await within(dialog).findByText(message)).toBeInTheDocument();
    expect(within(dialog).queryByRole("region", { name: "Login details" })).not.toBeInTheDocument();
  });

  it("New password: one already made, saved and shown once", async () => {
    const { calls, user } = openPage();
    await user.click(await screen.findByRole("button", { name: "New password for Sita Verma" }));
    const dialog = await screen.findByRole("dialog", { name: "New password for Sita Verma" });
    await user.click(within(dialog).getByRole("button", { name: "Change password" }));
    await waitFor(() => expect(writes(calls)).toHaveLength(1));
    expect(writes(calls)[0]).toMatchObject({ method: "POST", path: "/students/guardians/g2/reset-password" });
    const details = await within(dialog).findByRole("region", { name: "Login details" });
    expect(details).toHaveTextContent("sita.verma_20");
    expect(details).toHaveTextContent((writes(calls)[0].body as { password: string }).password);
  });

  it("Change username: checked free as it is typed, saved with one button", async () => {
    const { calls, user } = openPage();
    await user.click(await screen.findByRole("button", { name: "Change the username of Sita Verma" }));
    const dialog = await screen.findByRole("dialog", { name: "Change the username of Sita Verma" });
    const box = within(dialog).getByLabelText(/^Username/);
    await user.clear(box);
    await user.type(box, "sita.v");
    await user.click(within(dialog).getByRole("button", { name: "Save username" }));
    await waitFor(() => expect(writes(calls)).toHaveLength(1));
    expect(writes(calls)[0]).toMatchObject({ method: "PATCH", path: "/students/guardians/g2/login", body: { username: "sita.v" } });
  });

  it("right after Add student made a parent's login, the page shows it once", async () => {
    openPage({}, { admitted: true, parentLogin: { name: "Ravi Verma", username: "ravi.verma_12", password: "Ab3dEf9hJk" } });
    const details = await screen.findByRole("region", { name: "Login details" });
    expect(details).toHaveTextContent("ravi.verma_12");
    expect(details).toHaveTextContent("Ab3dEf9hJk");
    expect(screen.getByText("Login of Ravi Verma")).toBeInTheDocument();
  });

  it("when Add student could not make the login, the page says why", async () => {
    openPage({}, { admitted: true, parentLoginError: "This username is taken. Try another" });
    expect(await screen.findByText(/The parent's login was not made: This username is taken\. Try another/)).toBeInTheDocument();
  });
});
