import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Provider } from "react-redux";
import { RouterProvider, createMemoryRouter } from "react-router";
import { ToastProvider } from "../../../components/ui/toast-context";
import { allApiSlices } from "../../../redux/api/apiRoot";
import store from "../../../redux/store";
import type { StudentDetail } from "../../../types";
import { fakeApi, type Handler } from "../../../test/fakeApi";
import { signInAs, signOut } from "../../../test/session";
import { STRUCTURE } from "../../../test/fixtures";
import StudentDetailPage from "../StudentDetail";

/** Asha of Class 1 (no sections). Class 6 has a section A. */
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
  place: { enrolmentId: "e1", classId: "c1", className: "Class 1", sectionId: null, sectionName: null, rollNumber: 3 },
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

const MOVES: StudentDetail["moves"] = [
  {
    id: "m2",
    kind: "transferred_out",
    at: "2026-10-27T10:30:00.000Z",
    reason: "Transferred to Delhi Public School",
    academicYear: { id: "y1", name: "2026-2027" },
    from: { classId: "c6", className: "Class 6", sectionId: "c6-A", sectionName: "A", rollNumber: 9 },
    to: null,
    school: { schoolName: "Delhi Public School", tcNumber: "TC/18", tcDate: "2026-10-20", remarks: null },
    by: { name: "Meena Singh", role: "school_admin" },
  },
  {
    id: "m1",
    kind: "moved",
    at: "2026-09-02T04:00:00.000Z",
    reason: "Morning section",
    academicYear: { id: "y1", name: "2026-2027" },
    from: { classId: "c1", className: "Class 1", sectionId: null, sectionName: null, rollNumber: 3 },
    to: { classId: "c6", className: "Class 6", sectionId: "c6-A", sectionName: "A", rollNumber: null },
    school: null,
    by: { name: "Dev Patel", role: "principal" },
  },
];

function openPage(extra: Record<string, Handler> = {}) {
  signInAs("school_admin");
  const calls = fakeApi({ "GET /students/s1": () => ASHA, "GET /academics/structure": () => STRUCTURE, ...extra });
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

const pickIn = async (user: ReturnType<typeof userEvent.setup>, id: string, option: string) => {
  await user.click(document.getElementById(id)!);
  await user.click(await screen.findByRole("option", { name: option }));
};

afterEach(() => {
  cleanup();
  for (const api of allApiSlices) store.dispatch(api.util.resetApiState());
  signOut();
  vi.unstubAllGlobals();
});

describe("the moves and transfers of a student", () => {
  it("are listed with the history of the classes: where from, where to, who, when and why", async () => {
    openPage({ "GET /students/s1": () => ({ ...ASHA, moves: MOVES }) });
    const list = await screen.findByRole("list", { name: "Moves and transfers" });
    const [out, moved] = within(list).getAllByRole("listitem");
    expect(moved).toHaveTextContent("Class 1 (roll 3)");
    expect(moved).toHaveTextContent("Class 6 - A");
    expect(moved).toHaveTextContent("Morning section");
    expect(moved).toHaveTextContent("Dev Patel");
    expect(moved).toHaveTextContent("2 Sep 2026");
    expect(out).toHaveTextContent("Transferred to Delhi Public School");
    expect(out).toHaveTextContent("Certificate TC/18");
    expect(out).toHaveTextContent("Class 6 - A (roll 9)");
  });

  it("a student who never moved has no such list", async () => {
    openPage();
    await screen.findByRole("heading", { name: "Asha Verma" });
    expect(screen.queryByRole("list", { name: "Moves and transfers" })).not.toBeInTheDocument();
  });
});

describe("a student's page: transferring the student", () => {
  it("to another class or section: one request with the place and the reason, and the page shows the new place", async () => {
    let page = ASHA;
    const { calls, user } = openPage({
      "GET /students/s1": () => page,
      "PATCH /students/s1/enrolment": () => {
        page = { ...ASHA, place: { ...ASHA.place!, classId: "c6", className: "Class 6", sectionId: "c6-A", sectionName: "A" } };
        return page;
      },
    });
    await user.click(await screen.findByRole("button", { name: "Transfer" }));
    const dialog = await screen.findByRole("dialog", { name: "Transfer Asha Verma" });
    expect(within(dialog).getByRole("radio", { name: "Another class or section" })).toBeChecked();
    await pickIn(user, "transfer-class", "Class 6");
    await pickIn(user, "transfer-section", "Section A");
    await user.type(within(dialog).getByRole("textbox", { name: /Reason/ }), "Parents asked");
    await user.click(within(dialog).getByRole("button", { name: "Transfer student" }));
    await waitFor(() => expect(calls.filter((c) => c.method === "PATCH")).toHaveLength(1));
    expect(calls.find((c) => c.method === "PATCH")?.body).toEqual({ classId: "c6", sectionId: "c6-A", reason: "Parents asked" });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect((await screen.findAllByText(/Class 6 - A/)).length).toBeGreaterThan(0);
  });

  it("asks for something to change, and for the section when the class has them", async () => {
    const { calls, user } = openPage();
    await user.click(await screen.findByRole("button", { name: "Transfer" }));
    const dialog = await screen.findByRole("dialog", { name: "Transfer Asha Verma" });
    await user.click(within(dialog).getByRole("button", { name: "Transfer student" }));
    expect(await within(dialog).findByText("Choose a different class or section")).toBeInTheDocument();
    await pickIn(user, "transfer-class", "Class 6");
    await user.click(within(dialog).getByRole("button", { name: "Transfer student" }));
    expect(await within(dialog).findByText("Choose the section")).toBeInTheDocument();
    expect(calls.filter((c) => c.method === "PATCH")).toHaveLength(0);
  });

  it("a full section is said, and Transfer anyway sends the same again with the person's yes", async () => {
    let answers = 0;
    const { calls, user } = openPage({
      "PATCH /students/s1/enrolment": () => {
        answers += 1;
        return answers === 1
          ? new Response(JSON.stringify({ success: false, message: "Class 6 - A is full: 30 of 30 seats are taken.", code: "SECTION_FULL", details: [] }), { status: 409, headers: { "Content-Type": "application/json" } })
          : ASHA;
      },
    });
    await user.click(await screen.findByRole("button", { name: "Transfer" }));
    const dialog = await screen.findByRole("dialog", { name: "Transfer Asha Verma" });
    await pickIn(user, "transfer-class", "Class 6");
    await pickIn(user, "transfer-section", "Section A");
    await user.click(within(dialog).getByRole("button", { name: "Transfer student" }));
    expect(await within(dialog).findByText(/Class 6 - A is full/)).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Transfer anyway" }));
    await waitFor(() => expect(calls.filter((c) => c.method === "PATCH")).toHaveLength(2));
    expect(calls.filter((c) => c.method === "PATCH")[1].body).toMatchObject({ classId: "c6", sectionId: "c6-A", allowOverCapacity: true });
  });

  it("to another school: its name is needed, the certificate details are sent as given, and the page then says they left", async () => {
    let page: StudentDetail = ASHA;
    const { calls, user } = openPage({
      "GET /students/s1": () => page,
      "POST /students/s1/transfer-out": () => {
        page = {
          ...ASHA,
          status: "inactive",
          inactive: {
            at: "2026-10-27T10:00:00.000Z",
            by: { name: "Meena Singh", role: "school_admin" },
            reason: "Transferred to Delhi Public School",
            transfer: { schoolName: "Delhi Public School", tcNumber: "TC/18", tcDate: "2026-10-20", remarks: null },
          },
        };
        return page;
      },
    });
    await user.click(await screen.findByRole("button", { name: "Transfer" }));
    const dialog = await screen.findByRole("dialog", { name: "Transfer Asha Verma" });
    await user.click(within(dialog).getByRole("radio", { name: "Another school" }));
    await user.click(within(dialog).getByRole("button", { name: "Transfer student" }));
    expect(await within(dialog).findByText("Enter the name of the new school")).toBeInTheDocument();
    expect(calls.filter((c) => c.method === "POST")).toHaveLength(0);

    await user.type(within(dialog).getByRole("textbox", { name: /Name of the new school/ }), "Delhi Public School");
    await user.type(within(dialog).getByRole("textbox", { name: /TC number/ }), "TC/18");
    await user.type(within(dialog).getByLabelText(/TC date/), "2026-10-20");
    await user.click(within(dialog).getByRole("button", { name: "Transfer student" }));
    await waitFor(() => expect(calls.filter((c) => c.method === "POST")).toHaveLength(1));
    expect(calls.find((c) => c.method === "POST")?.body).toEqual({ schoolName: "Delhi Public School", tcNumber: "TC/18", tcDate: "2026-10-20" });
    expect(await screen.findByText(/Transferred to Delhi Public School/)).toBeInTheDocument();
    expect(screen.getByText(/Certificate TC\/18/)).toBeInTheDocument();
  });

  it("an inactive student cannot be transferred", async () => {
    openPage({ "GET /students/s1": () => ({ ...ASHA, status: "inactive", inactive: { at: "2026-10-25T10:30:00.000Z", by: { name: "Meena", role: "school_admin" }, reason: null, transfer: null } }) });
    await screen.findByRole("button", { name: "Make active" });
    expect(screen.queryByRole("button", { name: "Transfer" })).not.toBeInTheDocument();
  });
});
