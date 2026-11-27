import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Provider } from "react-redux";
import { RouterProvider, createMemoryRouter } from "react-router";
import { ToastProvider } from "../../../components/ui/toast-context";
import { allApiSlices } from "../../../redux/api/apiRoot";
import store from "../../../redux/store";
import { sessionStarted, signedOut } from "../../../redux/slices/authSlice";
import { fakeApi, type Call, type Handler } from "../../../test/fakeApi";
import { STRUCTURE } from "../../../test/fixtures";
import type { AcademicStructure, Exam, ExamDetail, ExamRooms, ExamRoster } from "../../../types";
import ExamsPage from "../Exams";

/**
 * Exam > Students and Exam > Rooms (2026-11-27, the user: "ek tab jismein sab bacche hon, filter laga ho, naam, father name, roll number; admission
 * ke time roll number nahi diya to yahan de sakein; ek tab Room number: kitne se kitne bacche kis room mein"). "Today" is Friday 6 Nov 2026.
 */

const C1 = { id: "c1", name: "Class 1", order: 1 };
const C2 = { id: "c2", name: "Class 2", order: 2 };
const EXAM: Exam = {
  id: "e3",
  name: "Unit Test 2",
  type: "unit_test",
  typeLabel: "Unit test",
  full: false,
  startDate: "2026-11-05",
  endDate: "2026-11-09",
  schoolHours: null,
  scope: "classes",
  audience: { label: "Class 1 and Class 2", departments: [], classes: [C1, C2] },
  note: null,
  status: "running",
  paperCount: 0,
  classCount: 0,
};
const DETAIL: ExamDetail = { ...EXAM, audience: EXAM.audience!, papers: [] };

const ROSTER_C1: ExamRoster = {
  classId: "c1",
  className: "Class 1",
  sectionId: null,
  sections: [],
  items: [
    { id: "asha", name: "Asha Verma", admissionNumber: "ADM-1", fatherName: "Ravi Verma", sectionId: null, sectionName: null, rollNumber: 1, room: "Room 101" },
    { id: "mira", name: "Mira Shah", admissionNumber: "ADM-3", fatherName: "Anil Shah", sectionId: null, sectionName: null, rollNumber: null, room: null },
    { id: "kabir", name: "Kabir Rao", admissionNumber: "ADM-2", fatherName: null, sectionId: null, sectionName: null, rollNumber: null, room: null },
  ],
  counts: { students: 3, withoutRoll: 2, withoutRoom: 0 },
};
const ROSTER_C2: ExamRoster = {
  classId: "c2",
  className: "Class 2",
  sectionId: null,
  sections: [
    { id: "c2-A", name: "A" },
    { id: "c2-B", name: "B" },
  ],
  items: [{ id: "dev", name: "Dev Patel", admissionNumber: "ADM-4", fatherName: "Raj Patel", sectionId: "c2-A", sectionName: "A", rollNumber: 4, room: null }],
  counts: { students: 1, withoutRoll: 0, withoutRoom: 1 },
};
const ROOMS: ExamRooms = {
  items: [{ id: "r1", examId: "e3", room: "Room 101", classId: "c1", className: "Class 1", sectionId: null, sectionName: null, fromRoll: 1, toRoll: 30, students: 1 }],
  left: [
    { classId: "c1", className: "Class 1", sectionId: null, sectionName: null, withoutRoom: 0, withoutRoll: 2 },
    { classId: "c2", className: "Class 2", sectionId: "c2-A", sectionName: "A", withoutRoom: 1, withoutRoll: 0 },
  ],
};
const SCHOOL: AcademicStructure = {
  ...STRUCTURE,
  classes: [
    { id: "c1", name: "Class 1", order: 1, departmentId: null, capacity: null, sections: [] },
    {
      id: "c2",
      name: "Class 2",
      order: 2,
      departmentId: null,
      capacity: null,
      sections: [
        { id: "c2-A", classId: "c2", name: "A", capacity: 30, room: null },
        { id: "c2-B", classId: "c2", name: "B", capacity: 30, room: null },
      ],
    },
  ],
};

const refused = (message: string, status: number, extra: object = {}) => () => new Response(JSON.stringify({ success: false, message, ...extra }), { status, headers: { "Content-Type": "application/json" } });

function openPage(tab: "students" | "rooms", extra: Record<string, Handler> = {}) {
  store.dispatch(sessionStarted({ user: { id: "u1", name: "Anuj", email: "a@school.example", username: null, role: "school_admin", tenantId: "t1", emailVerifiedAt: null }, tenant: null }));
  const calls = fakeApi({
    "GET /exams": () => ({ items: [EXAM] }),
    "GET /exams/e3": () => DETAIL,
    "GET /exams/e3/students": (_body, query) => (query.get("classId") === "c2" ? ROSTER_C2 : ROSTER_C1),
    "PUT /exams/e3/roll-numbers": (body) => ({ updated: (body as { rows: unknown[] }).rows.length }),
    "GET /exams/e3/rooms": () => ROOMS,
    "POST /exams/e3/rooms": (body) => ({ ...ROOMS.items[0], id: "r2", ...(body as object), students: 0 }),
    "PATCH /exams/e3/rooms/r1": (body) => ({ ...ROOMS.items[0], ...(body as object) }),
    "DELETE /exams/e3/rooms/r1": () => ({ id: "r1" }),
    "GET /academics/structure": () => SCHOOL,
    ...extra,
  });
  const router = createMemoryRouter([{ path: "/school/exams", element: <ExamsPage /> }], { initialEntries: [`/school/exams?tab=${tab}`] });
  render(
    <Provider store={store}>
      <ToastProvider>
        <RouterProvider router={router} />
      </ToastProvider>
    </Provider>
  );
  return { calls, router, user: userEvent.setup() };
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-06T06:00:00.000Z"));
});

afterEach(() => {
  cleanup();
  store.dispatch(signedOut());
  for (const api of allApiSlices) store.dispatch(api.util.resetApiState());
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

const writes = (calls: Call[]) => calls.filter((c) => c.method !== "GET");
const rowOf = (table: HTMLElement, name: string) => within(table).getByRole("row", { name: new RegExp(name) });
const rollBox = (name: string) => screen.getByLabelText(`Roll number of ${name}`);

describe("Exam > Students", () => {
  it("is a tab of its own: each child of the class with the roll number, name and admission number, father's name and room; a search narrows it", async () => {
    const { calls, user } = openPage("students");
    expect(screen.getByRole("tab", { name: "Students" })).toHaveAttribute("aria-selected", "true");
    const table = await screen.findByRole("table", { name: "Children of Class 1" });
    const asha = rowOf(table, "Asha Verma");
    expect(within(asha).getByLabelText("Roll number of Asha Verma")).toHaveValue(1);
    expect(asha).toHaveTextContent("ADM-1");
    expect(asha).toHaveTextContent("Ravi Verma");
    expect(asha).toHaveTextContent("Room 101");
    expect(screen.getByText("3 children")).toBeInTheDocument();
    expect(screen.getByText(/2 without a roll number · 0 without a room/)).toBeInTheDocument();
    expect(calls.find((c) => c.path === "/exams/e3/students")?.query).toBe("?classId=c1");

    await user.type(screen.getByLabelText("Search"), "kabir");
    expect(within(table).getAllByRole("row").slice(1).map((r) => within(r).getAllByRole("cell")[1].textContent)).toEqual(["Kabir RaoADM-2"]);
  });

  it("Number the rest gives the children without a number the next ones, A to Z; Save sends only what changed", async () => {
    const { calls, user } = openPage("students");
    await screen.findByRole("table", { name: "Children of Class 1" });
    expect(screen.getByRole("button", { name: "Save roll numbers" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Number the rest" }));
    expect(rollBox("Kabir Rao")).toHaveValue(2);
    expect(rollBox("Mira Shah")).toHaveValue(3);
    await user.click(screen.getByRole("button", { name: "Save roll numbers" }));
    await waitFor(() => expect(writes(calls)).toHaveLength(1));
    expect(writes(calls)[0]).toMatchObject({
      method: "PUT",
      path: "/exams/e3/roll-numbers",
      body: {
        rows: [
          { studentId: "mira", rollNumber: 3 },
          { studentId: "kabir", rollNumber: 2 },
        ],
      },
    });
    expect(await screen.findByText("2 roll numbers saved.")).toBeInTheDocument();
  });

  it("a number given twice is said under its box and nothing is sent; what the server refuses is said under the child's box", async () => {
    const { calls, user } = openPage("students", {
      "PUT /exams/e3/roll-numbers": refused("Roll number 5 of Class 1 is Dev Patel's", 409, { code: "ROLL_NUMBER_TAKEN" }),
    });
    await screen.findByRole("table", { name: "Children of Class 1" });
    await user.type(rollBox("Kabir Rao"), "1");
    await user.click(screen.getByRole("button", { name: "Save roll numbers" }));
    expect(await screen.findByText("Roll number 1 is given twice")).toBeInTheDocument();
    expect(writes(calls)).toHaveLength(0);
    await user.clear(rollBox("Kabir Rao"));
    await user.type(rollBox("Kabir Rao"), "5");
    await user.click(screen.getByRole("button", { name: "Save roll numbers" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Roll number 5 of Class 1 is Dev Patel's");
  });

  it("another class is chosen at the top, and a class with sections can be narrowed to one", async () => {
    const { calls, user } = openPage("students");
    await screen.findByRole("table", { name: "Children of Class 1" });
    await user.click(document.getElementById("students-class")!);
    await user.click(await screen.findByRole("option", { name: "Class 2" }));
    const table = await screen.findByRole("table", { name: "Children of Class 2" });
    expect(rowOf(table, "Dev Patel")).toHaveTextContent("A");
    await user.click(document.getElementById("students-section")!);
    await user.click(await screen.findByRole("option", { name: "B" }));
    await waitFor(() => expect(calls.filter((c) => c.path === "/exams/e3/students").map((c) => c.query)).toContain("?classId=c2&sectionId=c2-B"));
  });
});

describe("Exam > Rooms", () => {
  it("each room with its class, roll numbers and how many children; the ones not in a room yet are said on top", async () => {
    const { calls } = openPage("rooms");
    const table = await screen.findByRole("table", { name: "Rooms" });
    const room = rowOf(table, "Room 101");
    expect(room).toHaveTextContent("Class 1");
    expect(room).toHaveTextContent("1 to 30");
    const left = screen.getByRole("region", { name: "Not in a room yet" });
    expect(left).toHaveTextContent("Class 1 · 2 without a roll number");
    expect(left).toHaveTextContent("Class 2 - A · 1 child");
    // The school's sections are read only when a row is written.
    expect(calls.map((c) => c.path)).not.toContain("/academics/structure");
  });

  it("Add room writes a row: the room, the class (and its section), from and to after the class's last run; Save sends it", async () => {
    const { calls, user } = openPage("rooms");
    const table = await screen.findByRole("table", { name: "Rooms" });
    await user.click(screen.getByRole("button", { name: "Add room" }));
    const editing = within(table).getAllByRole("row")[1];
    expect(within(editing).getByLabelText("From roll")).toHaveValue(31);
    expect(within(editing).getByLabelText("To roll")).toHaveValue(60);
    await user.click(within(editing).getByRole("button", { name: "Save" }));
    expect(await within(table).findByText("Enter the room")).toBeInTheDocument();
    expect(writes(calls)).toHaveLength(0);
    await user.type(within(editing).getByLabelText("Room"), "Room 102");
    await user.click(within(editing).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(writes(calls)).toHaveLength(1));
    expect(writes(calls)[0]).toMatchObject({ method: "POST", path: "/exams/e3/rooms", body: { room: "Room 102", classId: "c1", sectionId: null, fromRoll: 31, toRoll: 60 } });
    expect(await screen.findByText("Room 102 is saved.")).toBeInTheDocument();
  });

  it("a class with sections asks for its section; the server's refusal (an overlap) is said in the row, which stays open", async () => {
    const { calls, user } = openPage("rooms", { "POST /exams/e3/rooms": refused("Class 2 - A roll 1 to 30 is in Room 101 already", 409, { code: "ROOM_OVERLAP" }) });
    const table = await screen.findByRole("table", { name: "Rooms" });
    await user.click(screen.getByRole("button", { name: "Add room" }));
    const editing = within(table).getAllByRole("row")[1];
    await user.type(within(editing).getByLabelText("Room"), "Room 101");
    await user.click(document.getElementById("room-class-new")!);
    await user.click(await screen.findByRole("option", { name: "Class 2" }));
    expect(document.getElementById("room-section-new")).not.toBeNull();
    await user.click(within(editing).getByRole("button", { name: "Save" }));
    expect(await within(table).findByText("Class 2 - A roll 1 to 30 is in Room 101 already")).toBeInTheDocument();
    expect(writes(calls)[0]).toMatchObject({ body: { classId: "c2", sectionId: "c2-A" } });
    expect(within(table).getByRole("button", { name: "Save" })).toBeInTheDocument();
  });

  it("a run is changed from its pencil and taken away from its bin", async () => {
    const { calls, user } = openPage("rooms");
    const table = await screen.findByRole("table", { name: "Rooms" });
    await user.click(within(rowOf(table, "Room 101")).getByRole("button", { name: "Change Room 101, Class 1" }));
    const editing = within(table).getAllByRole("row")[1];
    expect(within(editing).getByLabelText("Room")).toHaveValue("Room 101");
    await user.clear(within(editing).getByLabelText("To roll"));
    await user.type(within(editing).getByLabelText("To roll"), "25");
    await user.click(within(editing).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(writes(calls)).toHaveLength(1));
    expect(writes(calls)[0]).toMatchObject({ method: "PATCH", path: "/exams/e3/rooms/r1", body: { room: "Room 101", classId: "c1", sectionId: null, fromRoll: 1, toRoll: 25 } });

    await user.click(await within(table).findByRole("button", { name: "Take Room 101, Class 1 away" }));
    await user.click(within(await screen.findByRole("dialog", { name: "Take Room 101 away?" })).getByRole("button", { name: "Take away" }));
    await waitFor(() => expect(writes(calls)).toHaveLength(2));
    expect(writes(calls)[1]).toMatchObject({ method: "DELETE", path: "/exams/e3/rooms/r1" });
  });

  it("while a run is written its Children cell counts the children whose roll numbers it holds (2026-11-27: it was blank until saved)", async () => {
    const { user } = openPage("rooms", {
      "GET /exams/e3/rooms": () => ({
        ...ROOMS,
        rolls: [
          { classId: "c1", sectionId: null, numbers: [1, 2, 3, 35, 40] },
          { classId: "c2", sectionId: "c2-A", numbers: [4] },
        ],
      }),
    });
    const table = await screen.findByRole("table", { name: "Rooms" });
    await user.click(screen.getByRole("button", { name: "Add room" }));
    const editing = within(table).getAllByRole("row")[1];
    // 31 to 60 of Class 1: roll 35 and 40.
    expect(within(editing).getByLabelText("Children in this run")).toHaveTextContent("2");
    await user.clear(within(editing).getByLabelText("From roll"));
    await user.type(within(editing).getByLabelText("From roll"), "1");
    expect(within(editing).getByLabelText("Children in this run")).toHaveTextContent("5");
    await user.click(document.getElementById("room-class-new")!);
    await user.click(await screen.findByRole("option", { name: "Class 2" }));
    // Class 2 - A, 1 to 30: roll 4.
    expect(within(editing).getByLabelText("Children in this run")).toHaveTextContent("1");
  });
});

describe("Exam > Rooms: who is on duty", () => {
  const TWO_ROOMS: ExamRooms = {
    ...ROOMS,
    items: [...ROOMS.items, { id: "r2", examId: "e3", room: "Room 102", classId: "c2", className: "Class 2", sectionId: "c2-A", sectionName: "A", fromRoll: 1, toRoll: 30, students: 1 }],
    duties: [{ room: "Room 102", teachers: [{ id: "t3", name: "Kiran Rao" }] }],
  };
  const TEACHERS = {
    items: [
      { id: "t2", name: "Dev Patel" },
      { id: "t3", name: "Kiran Rao" },
      { id: "t1", name: "Meena Singh" },
    ],
  };

  it("each room says its teachers; Add teacher picks one or two of the school's teachers (one on duty elsewhere is greyed out) and Save sends them", async () => {
    const { calls, user } = openPage("rooms", {
      "GET /exams/e3/rooms": () => TWO_ROOMS,
      "GET /exams/e3/teachers": () => TEACHERS,
      "PUT /exams/e3/duties": (body) => ({ room: "Room 101", teachers: (body as { teacherIds: string[] }).teacherIds.map((id) => TEACHERS.items.find((t) => t.id === id)) }),
    });
    const table = await screen.findByRole("table", { name: "Rooms" });
    expect(within(table).getByRole("columnheader", { name: "On duty" })).toBeInTheDocument();
    expect(rowOf(table, "Room 102")).toHaveTextContent("Kiran Rao");
    // The teachers are read only when a duty is written.
    expect(calls.map((c) => c.path)).not.toContain("/exams/e3/teachers");

    await user.click(within(rowOf(table, "Room 101")).getByRole("button", { name: "Add teacher to Room 101" }));
    await user.click(document.getElementById("duty-r1")!);
    expect(await screen.findByRole("option", { name: "Kiran Rao · Room 102" })).toHaveAttribute("aria-disabled", "true");
    await user.click(screen.getByRole("option", { name: "Meena Singh" }));
    await user.click(screen.getByRole("option", { name: "Dev Patel" }));
    await user.keyboard("{Escape}");
    await user.click(within(table).getByRole("button", { name: "Save duty" }));
    await waitFor(() => expect(writes(calls)).toHaveLength(1));
    expect(writes(calls)[0]).toMatchObject({ method: "PUT", path: "/exams/e3/duties", body: { room: "Room 101", teacherIds: ["t2", "t1"] } });
    expect(await screen.findByText("Duty in Room 101 is saved.")).toBeInTheDocument();
  });

  it("a room's teachers are changed from its pencil; none picked takes them off; a refusal is said in the room", async () => {
    const { calls, user } = openPage("rooms", {
      "GET /exams/e3/rooms": () => TWO_ROOMS,
      "GET /exams/e3/teachers": () => TEACHERS,
      "PUT /exams/e3/duties": refused("Kiran Rao is on duty in Room 101 already", 409, { code: "DUTY_TAKEN" }),
    });
    const table = await screen.findByRole("table", { name: "Rooms" });
    await user.click(within(rowOf(table, "Room 102")).getByRole("button", { name: "Change duty in Room 102" }));
    await user.click(document.getElementById("duty-r2")!);
    await user.click(await screen.findByRole("option", { name: "Kiran Rao" }));
    await user.keyboard("{Escape}");
    await user.click(within(table).getByRole("button", { name: "Save duty" }));
    await waitFor(() => expect(writes(calls)).toHaveLength(1));
    expect(writes(calls)[0]).toMatchObject({ body: { room: "Room 102", teacherIds: [] } });
    expect(await within(table).findByRole("alert")).toHaveTextContent("Kiran Rao is on duty in Room 101 already");
    expect(within(table).getByRole("button", { name: "Save duty" })).toBeInTheDocument();
  });
});
