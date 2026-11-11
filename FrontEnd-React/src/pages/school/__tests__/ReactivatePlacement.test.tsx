import { afterEach, describe, expect, it, vi, beforeEach } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Provider } from "react-redux";
import { RouterProvider, createMemoryRouter } from "react-router";
import { ToastProvider } from "../../../components/ui/toast-context";
import { allApiSlices } from "../../../redux/api/apiRoot";
import store from "../../../redux/store";
import type { InactivePage, InactiveStudent, StudentDetail } from "../../../types";
import { fakeApi } from "../../../test/fakeApi";
import { signInAs, signOut } from "../../../test/session";
import { STRUCTURE } from "../../../test/fixtures";
import InactiveStudentsPage from "../InactiveStudents";
import StudentDetailPage from "../StudentDetail";

/** Chitra finished Class 6 last year: inactive, and with no class in the running year. Dev left this year from Class 1. */
const row = (id: string, name: string, className: string | null): InactiveStudent => ({
  id,
  name,
  gender: "Female",
  admissionNumber: `ADM-2026-000${id.slice(1)}`,
  dateOfBirth: "2012-05-14",
  className,
  sectionName: null,
  rollNumber: null,
  parentName: "Ravi Verma",
  parentMobile: "9876543210",
  reason: "Passed out",
  transfer: null,
  inactiveAt: "2026-10-25T10:30:00.000Z",
  inactiveBy: { name: "Meena Singh", role: "school_admin" },
});
const CHITRA = row("s1", "Chitra Verma", null);
const DEV = row("s2", "Dev Rao", "Class 1");
const pageOf = (items: InactiveStudent[]): InactivePage => ({ items, page: 1, limit: 20, total: items.length, totalPages: 1 });

const pickIn = async (user: ReturnType<typeof userEvent.setup>, id: string, option: string) => {
  await user.click(document.getElementById(id)!);
  await user.click(await screen.findByRole("option", { name: option }));
};

beforeEach(() => signInAs("school_admin"));

afterEach(() => {
  cleanup();
  for (const api of allApiSlices) store.dispatch(api.util.resetApiState());
  signOut();
  vi.unstubAllGlobals();
});

describe("Make active for a student who has no class this year", () => {
  function openList(items: InactiveStudent[]) {
    const calls = fakeApi({
      "GET /students/inactive": () => pageOf(items),
      "GET /academics/structure": () => STRUCTURE,
      "POST /students/reactivate": () => ({ reactivated: 1, skipped: 0, rollNumbersLost: 0 }),
    });
    const router = createMemoryRouter([{ path: "/school/students/inactive", element: <InactiveStudentsPage /> }], { initialEntries: ["/school/students/inactive"] });
    render(
      <Provider store={store}>
        <ToastProvider>
          <RouterProvider router={router} />
        </ToastProvider>
      </Provider>
    );
    return { calls, user: userEvent.setup() };
  }

  it("asks where to put them first, and sends the class and section with the request", async () => {
    const { calls, user } = openList([CHITRA, DEV]);
    await user.click(await screen.findByRole("button", { name: "Make Chitra Verma active" }));
    const dialog = await screen.findByRole("dialog", { name: "Where does Chitra Verma study this year?" });
    expect(calls.filter((c) => c.method === "POST")).toHaveLength(0);
    await user.click(within(dialog).getByRole("button", { name: "Make active" }));
    expect(await within(dialog).findByText("Choose the class")).toBeInTheDocument();
    await pickIn(user, "placement-class", "Class 6");
    await user.click(within(dialog).getByRole("button", { name: "Make active" }));
    expect(await within(dialog).findByText("Choose the section")).toBeInTheDocument();
    await pickIn(user, "placement-section", "Section A");
    await user.click(within(dialog).getByRole("button", { name: "Make active" }));
    await waitFor(() => expect(calls.filter((c) => c.method === "POST")).toHaveLength(1));
    expect(calls.find((c) => c.method === "POST")?.body).toEqual({ ids: ["s1"], placement: { classId: "c6", sectionId: "c6-A" } });
  });

  it("a student who has a class this year is made active at once, with no question", async () => {
    const { calls, user } = openList([CHITRA, DEV]);
    await user.click(await screen.findByRole("button", { name: "Make Dev Rao active" }));
    await waitFor(() => expect(calls.filter((c) => c.method === "POST")).toHaveLength(1));
    expect(calls.find((c) => c.method === "POST")?.body).toEqual({ ids: ["s2"] });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("ticked students, one of them without a class, are asked about once and sent together", async () => {
    const { calls, user } = openList([CHITRA, DEV]);
    await user.click(await screen.findByRole("checkbox", { name: "Select all students on this page" }));
    await user.click(screen.getByRole("button", { name: "Make selected active" }));
    const dialog = await screen.findByRole("dialog", { name: "Where do these students study this year?" });
    await pickIn(user, "placement-class", "Class 1");
    await user.click(within(dialog).getByRole("button", { name: "Make active" }));
    await waitFor(() => expect(calls.filter((c) => c.method === "POST")).toHaveLength(1));
    expect(calls.find((c) => c.method === "POST")?.body).toEqual({ ids: ["s1", "s2"], placement: { classId: "c1" } });
  });
});

describe("the page of a student with no class this year", () => {
  it("Make active asks where to put them too", async () => {
    const page = {
      id: "s1",
      firstName: "Chitra",
      lastName: "Verma",
      name: "Chitra Verma",
      gender: "Female",
      admissionNumber: "ADM-2026-0001",
      dateOfBirth: "2012-05-14",
      admissionDate: "2026-06-01",
      status: "inactive",
      place: null,
      address: { line1: null, line2: null, city: null, state: null, pincode: null },
      bloodGroup: null,
      category: null,
      previousSchool: null,
      custom: {},
      guardians: [],
      enrolments: [],
      siblings: [],
      inactive: { at: "2026-10-25T10:30:00.000Z", by: { name: "Meena Singh", role: "school_admin" }, reason: "Passed out after 2026-2027", transfer: null },
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
    } as unknown as StudentDetail;
    const calls = fakeApi({ "GET /students/s1": () => page, "GET /academics/structure": () => STRUCTURE, "POST /students/reactivate": () => ({ reactivated: 1, skipped: 0, rollNumbersLost: 0 }) });
    const router = createMemoryRouter([{ path: "/school/students/:id", element: <StudentDetailPage /> }], { initialEntries: ["/school/students/s1"] });
    render(
      <Provider store={store}>
        <ToastProvider>
          <RouterProvider router={router} />
        </ToastProvider>
      </Provider>
    );
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Make active" }));
    await screen.findByRole("dialog", { name: "Where does Chitra Verma study this year?" });
    expect(calls.filter((c) => c.method === "POST")).toHaveLength(0);
  });
});
