import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Provider } from "react-redux";
import { RouterProvider, createMemoryRouter } from "react-router";
import { ToastProvider } from "../../../components/ui/toast-context";
import { allApiSlices } from "../../../redux/api/apiRoot";
import store from "../../../redux/store";
import { yearViewChanged } from "../../../redux/slices/yearViewSlice";
import type { StudentDetail } from "../../../types";
import { fakeApi, type Handler } from "../../../test/fakeApi";
import StudentDetailPage from "../StudentDetail";

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
  guardians: [],
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

function openPage(extra: Record<string, Handler> = {}) {
  const calls = fakeApi({ "GET /students/s1": () => ASHA, ...extra });
  const router = createMemoryRouter(
    [
      { path: "/school/students/:id", element: <StudentDetailPage /> },
      { path: "/school/students", element: <p>The students</p> },
    ],
    { initialEntries: ["/school/students/s1"] }
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

describe("a student's page: making them inactive", () => {
  it("asks first (with an optional reason); Cancel keeps the student active", async () => {
    const { calls, user } = openPage();
    await user.click(await screen.findByRole("button", { name: "Make inactive" }));
    const dialog = await screen.findByRole("dialog", { name: "Make Asha Verma inactive?" });
    expect(dialog).toHaveTextContent("Nothing is deleted");
    expect(within(dialog).getByRole("textbox", { name: /Why/ })).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(calls.filter((c) => c.method === "POST")).toHaveLength(0);
    expect(screen.getByRole("heading", { name: "Asha Verma" })).toBeInTheDocument();
  });

  it("sends one request with this student's id and the reason, and the page stays", async () => {
    const { calls, router, user } = openPage({ "POST /students/deactivate": () => ({ deactivated: 1, skipped: 0 }) });
    await user.click(await screen.findByRole("button", { name: "Make inactive" }));
    const dialog = await screen.findByRole("dialog");
    await user.type(within(dialog).getByRole("textbox", { name: /Why/ }), "Left the school");
    await user.click(within(dialog).getByRole("button", { name: "Make inactive" }));
    await waitFor(() => expect(calls.filter((c) => c.method === "POST")).toHaveLength(1));
    expect(calls.find((c) => c.method === "POST")?.body).toEqual({ ids: ["s1"], reason: "Left the school" });
    expect(router.state.location.pathname).toBe("/school/students/s1");
  });
});

describe("the page of an inactive student", () => {
  const INACTIVE: StudentDetail = { ...ASHA, status: "inactive", inactive: { at: "2026-10-25T10:30:00.000Z", by: { name: "Meena Singh", role: "school_admin" }, reason: "Left the school", transfer: null } };

  it("shows their details with a banner saying who made them inactive, when and why; no Edit, no sibling, no Make inactive", async () => {
    openPage({ "GET /students/s1": () => INACTIVE });
    expect(await screen.findByText(/since 25 Oct 2026, 4:00 pm/)).toBeInTheDocument();
    expect(screen.getByText(/made inactive by Meena Singh: Left the school/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Make active" })).toBeInTheDocument();
    for (const name of ["Edit", "Admit a sibling", "Make inactive"]) expect(screen.queryByRole("button", { name }), name).not.toBeInTheDocument();
  });

  it("Make active is one request, and the page is read again to show them active", async () => {
    let now: StudentDetail = INACTIVE;
    const { calls, user } = openPage({
      "GET /students/s1": () => now,
      "POST /students/reactivate": () => {
        now = ASHA;
        return { reactivated: 1, skipped: 0, rollNumbersLost: 0 };
      },
    });
    await user.click(await screen.findByRole("button", { name: "Make active" }));
    expect(await screen.findByRole("button", { name: "Make inactive" })).toBeInTheDocument();
    expect(calls.filter((c) => c.method === "POST")).toHaveLength(1);
    expect(calls.find((c) => c.method === "POST")?.body).toEqual({ ids: ["s1"] });
    expect(screen.queryByText(/made inactive by/)).not.toBeInTheDocument();
  });
});

describe("a student's page while a year that is over is open (read only)", () => {
  afterEach(() => {
    store.dispatch(yearViewChanged(null));
  });

  it("is only looked at: no Edit, Transfer, Make inactive or Add a sibling, and the parent's login has no buttons", async () => {
    store.dispatch(yearViewChanged("y26"));
    openPage();
    expect(await screen.findByRole("heading", { name: ASHA.name, level: 1 })).toBeInTheDocument();
    for (const name of ["Edit", "Transfer", "Make inactive", "Add a sibling"]) expect(screen.queryByRole("button", { name })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Make a login for|New password for|Change the username of/ })).not.toBeInTheDocument();
  });
});
