import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Provider } from "react-redux";
import { RouterProvider, createMemoryRouter } from "react-router";
import { ToastProvider } from "../../../components/ui/toast-context";
import { allApiSlices } from "../../../redux/api/apiRoot";
import store from "../../../redux/store";
import { fakeApi, type Call, type Handler } from "../../../test/fakeApi";
import { signInAs, signOut } from "../../../test/session";
import { STRUCTURE } from "../../../test/schoolClass";
import { ALLOTMENT, ART, ENGLISH, MATHS, MEENA } from "../../../test/timetableFixtures";
import type { AcademicStructure, Subject, Teacher } from "../../../types";
import TeacherAssignClassPage from "../TeacherAssignClass";
import TeacherDetailPage from "../TeacherDetail";

/**
 * Assign class (2026-11-13): the Subject box offers what THIS TEACHER can teach (the subjects chosen when they were added, those the class studies
 * first), can be searched, has Other subject (every other subject of the school, a pre-school class kept away from Physics), and adds a new one.
 */
const PHYSICS: Subject = { id: "physics", name: "Physics", code: null, category: "academic", isActive: true, sections: 1 };
const CHEMISTRY: Subject = { id: "chemistry", name: "Chemistry", code: null, category: "academic", isActive: true, sections: 1 };
// Meena teaches Mathematics and English.
const FULL: Teacher = { ...MEENA, subjectIds: ["maths", "english"], login: { username: "meena.singh", isActive: true } };

/** The school's structure with a pre-school class that has no sections and studies nothing yet. */
const WITH_PRE: AcademicStructure = {
  ...STRUCTURE,
  classes: [{ id: "pre", name: "Pre-Nursery", order: 0, departmentId: null, capacity: null, sections: [] }, ...STRUCTURE.classes],
};

function openPage(extra: Record<string, Handler> = {}, subjects: Subject[] = [MATHS, ENGLISH, ART, PHYSICS, CHEMISTRY], teacher: Teacher = FULL) {
  signInAs("school_admin");
  const calls = fakeApi({
    [`GET /staff/teachers/${FULL.id}`]: () => teacher,
    [`GET /staff/teachers/${FULL.id}/classes`]: () => ({ classTeacherOf: [], subjects: [] }),
    "GET /subjects": () => ({ items: subjects }),
    "GET /academics/structure": () => WITH_PRE,
    // Class 5 - A studies Mathematics and English; the pre-school class studies nothing.
    "GET /subjects/allotments": (_body, query) => (query.get("classId") === "pre" ? { ...ALLOTMENT, rows: [] } : ALLOTMENT),
    "PUT /subjects/allotments/teacher": () => ALLOTMENT,
    "POST /subjects": (body) => ({ id: "rhymes", name: (body as { name: string }).name, code: null, category: "academic", isActive: true, sections: 0 }),
    ...extra,
  });
  const router = createMemoryRouter([{ path: "/teachers/:id", element: <TeacherDetailPage /> }, { path: "/teachers/:id/assign-class", element: <TeacherAssignClassPage /> }, { path: "/teachers", element: <p>The teachers</p> }], { initialEntries: [`/teachers/${FULL.id}`] });
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

type U = ReturnType<typeof userEvent.setup>;
const writes = (calls: Call[]) => calls.filter((c) => c.method !== "GET");
const optionNames = () => screen.getAllByRole("option").map((o) => o.textContent);

async function open(user: U) {
  await user.click(await screen.findByRole("button", { name: "Assign class" }));
  // Assign class is a page of its own: its form (with the class's timetable beside it and the buttons under it) is what the tests work in.
  return screen.findByRole("form", { name: "Assign a class to Meena Singh" });
}
async function pickClass(user: U, d: HTMLElement, name: string, section?: string) {
  await user.click(within(d).getByRole("button", { name: /(^|\s)Class$/ }));
  await user.click(await screen.findByRole("option", { name }));
  if (section) {
    await user.click(within(d).getByRole("button", { name: /(^|\s)Section$/ }));
    await user.click(await screen.findByRole("option", { name: section }));
  }
}
const box = (d: HTMLElement, name = /^Subject$/) => within(d).getByRole("combobox", { name });

describe("Assign class: the subject, class by class", () => {
  it("waits for the class, then offers only the subjects this teacher can teach (not every subject of the school)", async () => {
    const { user } = openPage();
    const d = await open(user);
    expect(box(d)).toBeDisabled();
    await pickClass(user, d, "Class 5", "A");
    await user.click(box(d));
    // Meena teaches Mathematics and English: Art, Physics and Chemistry are not hers.
    expect(optionNames()).toEqual(["No subject (class teacher only)", "Mathematics", "English", "Other subject…"]);
  });

  it("a subject of the class that this teacher cannot teach is not in the first list: it is under Other subject, where anything can be given", async () => {
    const onlyEnglish: Teacher = { ...FULL, subjectIds: ["english"] };
    const { user } = openPage({}, undefined, onlyEnglish);
    const d = await open(user);
    await pickClass(user, d, "Class 5", "A");
    await user.click(box(d));
    // Class 5 - A studies Mathematics too, but it is not one of this teacher's.
    expect(optionNames()).toEqual(["No subject (class teacher only)", "English", "Other subject…"]);
    await user.click(await screen.findByRole("option", { name: "Other subject…" }));
    await user.click(box(d, /^Other subject$/));
    // Mathematics (the class's own) is there at once; the others that fit Class 5 with it.
    expect(optionNames()).toEqual(["Mathematics", "Art & Craft", "Add a new subject…"]);
    await user.click(screen.getByRole("option", { name: "Mathematics" }));
    expect(box(d, /^Other subject$/)).toHaveValue("Mathematics");
    // And back to the teacher's own.
    await user.click(within(d).getByRole("button", { name: "Only Meena Singh's subjects" }));
    expect(box(d)).toHaveValue("");
  });

  it("a subject this teacher can teach that the class does not study yet is offered after the class's own, and asks its periods a week", async () => {
    const withArt: Teacher = { ...FULL, subjectIds: ["art", "maths"] };
    const { user } = openPage({}, undefined, withArt);
    const d = await open(user);
    await pickClass(user, d, "Class 5", "A");
    await user.click(box(d));
    expect(optionNames()).toEqual(["No subject (class teacher only)", "Mathematics", "Art & Craft", "Other subject…"]);
    await user.click(screen.getByRole("option", { name: "Art & Craft" }));
    expect(await within(d).findByLabelText(/^Periods a week/)).toBeInTheDocument();
  });

  it("a teacher with no subject set starts on the Other list (every subject of the school that fits), with no way back to an empty list", async () => {
    const none: Teacher = { ...FULL, subjectIds: [] };
    const { user } = openPage({}, undefined, none);
    const d = await open(user);
    await pickClass(user, d, "Class 5", "A");
    expect(within(d).getByText("Other subject")).toBeInTheDocument();
    expect(within(d).queryByRole("button", { name: /^Only .* subjects$/ })).not.toBeInTheDocument();
    await user.click(box(d, /^Other subject$/));
    // The class's own subjects are in it, and the ones that fit the class.
    expect(optionNames()).toEqual(["Mathematics", "English", "Art & Craft", "Add a new subject…"]);
  });

  it("takes the section by itself when the class has only one (Class 6 has A), and asks for it when there are several (Class 5)", async () => {
    const { user } = openPage();
    const d = await open(user);
    await pickClass(user, d, "Class 6");
    expect(within(d).getByRole("button", { name: /(^|\s)Section$/ })).toHaveTextContent("A");
    // Nothing more to choose before the subject.
    expect(box(d)).toBeEnabled();
    expect(within(d).queryByText("Choose the section")).not.toBeInTheDocument();

    await pickClass(user, d, "Class 5");
    expect(within(d).getByRole("button", { name: /(^|\s)Section$/ })).toHaveTextContent("Select the section");
    expect(box(d)).toBeDisabled();
  });

  it("can be searched: typing narrows the class's subjects", async () => {
    const { user } = openPage();
    const d = await open(user);
    await pickClass(user, d, "Class 5", "A");
    await user.type(box(d), "eng");
    expect(optionNames()).toEqual(["English", "Add “eng” as a new subject"]);
    await user.click(screen.getByRole("option", { name: "English" }));
    expect(box(d)).toHaveValue("English");
  });

  it("has Other subject: the school's other subjects, and a way back to the class's own", async () => {
    const { user } = openPage();
    const d = await open(user);
    await pickClass(user, d, "Class 5", "A");
    await user.click(box(d));
    await user.click(await screen.findByRole("option", { name: "Other subject…" }));
    // The school's other subjects that fit Class 5 (Mathematics and English are hers, on the first list); Physics and Chemistry are for older classes, one click away.
    await user.click(box(d, /^Other subject$/));
    expect(optionNames()).toEqual(["Art & Craft", "Add a new subject…"]);
    await user.keyboard("{Escape}");
    expect(within(d).getByRole("button", { name: "Show all subjects (2 more)" })).toBeInTheDocument();
    await user.click(within(d).getByRole("button", { name: "Only Meena Singh's subjects" }));
    expect(box(d)).toBeInTheDocument();
    expect(within(d).queryByRole("button", { name: /Only subjects of/ })).not.toBeInTheDocument();
  });

  it("adds a subject the school does not have: typed, one click, chosen, and given to the class with its periods", async () => {
    const { calls, user } = openPage();
    const d = await open(user);
    await pickClass(user, d, "Class 5", "A");
    await user.type(box(d), "Rhymes");
    await user.click(await screen.findByRole("option", { name: "Add “Rhymes” as a new subject" }));
    await waitFor(() => expect(calls.filter((c) => c.method === "POST" && c.path === "/subjects")).toHaveLength(1));
    expect(calls.find((c) => c.method === "POST")!.body).toEqual({ name: "Rhymes" });
    // It is the chosen subject (the class does not study it yet, so its periods are asked).
    expect(await within(d).findByLabelText(/^Periods a week/)).toBeInTheDocument();
    expect(box(d, /^Other subject$/)).toHaveValue("Rhymes");
    await user.type(within(d).getByLabelText(/^Periods a week/), "3");
    await user.click(within(d).getByRole("button", { name: "Assign" }));
    await waitFor(() => expect(writes(calls).filter((c) => c.path === "/subjects/allotments/teacher")).toHaveLength(1));
    expect(writes(calls).find((c) => c.path === "/subjects/allotments/teacher")!.body).toEqual({ classId: "c5", sectionId: "c5-A", subjectId: "rhymes", teacherId: "meena", periodsPerWeek: 3 });
  });

  it("uses a subject the school already has when its name is typed (any capitals), without making it again", async () => {
    const { calls, user } = openPage();
    const d = await open(user);
    await pickClass(user, d, "Class 5", "A");
    await user.type(box(d), "PHYSICS");
    await user.click(await screen.findByRole("option", { name: "Use “Physics”" }));
    expect(calls.filter((c) => c.method === "POST")).toHaveLength(0);
    expect(box(d, /^Other subject$/)).toHaveValue("Physics");
    expect(await within(d).findByLabelText(/^Periods a week/)).toBeInTheDocument();
  });

  it("says why a subject could not be added, and keeps the window", async () => {
    const refused = () => new Response(JSON.stringify({ success: false, message: "Could not add the subject", details: [{ path: "name", message: "A subject called Rhymes exists but is switched off" }] }), { status: 409, headers: { "Content-Type": "application/json" } });
    const { user } = openPage({ "POST /subjects": refused });
    const d = await open(user);
    await pickClass(user, d, "Class 5", "A");
    await user.type(box(d), "Rhymes");
    await user.click(await screen.findByRole("option", { name: "Add “Rhymes” as a new subject" }));
    expect(await within(d).findByText("A subject called Rhymes exists but is switched off")).toBeInTheDocument();
  });

  it("keeps a pre-school class away from Physics and Chemistry in the Other list: a class that studies nothing yet is offered the subjects that fit it", async () => {
    const { user } = openPage();
    const d = await open(user);
    await pickClass(user, d, "Pre-Nursery");
    // The teacher's own subjects first (the class studies nothing yet, so all of them are new to it).
    await user.click(box(d));
    expect(optionNames()).toEqual(["No subject (class teacher only)", "Mathematics", "English", "Other subject…"]);
    await user.click(await screen.findByRole("option", { name: "Other subject…" }));
    // The others: the senior ones are not in it.
    await user.click(box(d, /^Other subject$/));
    expect(optionNames()).toEqual(["Art & Craft", "Add a new subject…"]);
    await user.keyboard("{Escape}");
    await user.click(within(d).getByRole("button", { name: "Show all subjects (2 more)" }));
    await user.click(box(d, /^Other subject$/));
    expect(optionNames()).toEqual(["Art & Craft", "Physics", "Chemistry", "Add a new subject…"]);
  });

  it("asks first when the subject has another teacher: the window says who is replaced, Back keeps the boxes, nothing is sent until it is agreed", async () => {
    const taught = { ...ALLOTMENT, rows: [ALLOTMENT.rows[0], { ...ALLOTMENT.rows[1], teacherId: "dev", teacherName: "Dev Patel" }] };
    const { calls, user } = openPage({ "GET /subjects/allotments": () => taught });
    const d = await open(user);
    await pickClass(user, d, "Class 5", "A");
    await user.click(box(d));
    await user.click(await screen.findByRole("option", { name: "English" }));
    // Said under the box before anything is pressed.
    expect(within(d).getByText("English of Class 5 - A is taught by Dev Patel now. Assigning it to Meena Singh replaces them.")).toBeInTheDocument();

    await user.click(within(d).getByRole("button", { name: "Assign" }));
    expect(await within(d).findByText("English of Class 5 - A is taught by Dev Patel now.")).toBeInTheDocument();
    expect(within(d).getByText(/Dev Patel no longer does/)).toBeInTheDocument();
    expect(writes(calls)).toHaveLength(0);

    await user.click(within(d).getByRole("button", { name: "Back" }));
    expect(box(d)).toHaveValue("English");
    expect(writes(calls)).toHaveLength(0);

    await user.click(within(d).getByRole("button", { name: "Assign" }));
    await user.click(await within(d).findByRole("button", { name: "Replace and assign" }));
    await waitFor(() => expect(writes(calls)).toHaveLength(1));
    expect(writes(calls)[0]).toMatchObject({ path: "/subjects/allotments/teacher", body: { classId: "c5", sectionId: "c5-A", subjectId: "english", teacherId: "meena" } });
  });

  it("does not ask when the subject has no teacher, or is already theirs", async () => {
    const { calls, user } = openPage();
    const d = await open(user);
    await pickClass(user, d, "Class 5", "A");
    await user.click(box(d));
    await user.click(await screen.findByRole("option", { name: "Mathematics" }));
    expect(within(d).queryByText(/is taught by/)).not.toBeInTheDocument();
    await user.click(within(d).getByRole("button", { name: "Assign" }));
    await waitFor(() => expect(writes(calls)).toHaveLength(1));
    expect(screen.queryByRole("button", { name: "Replace and assign" })).not.toBeInTheDocument();
  });

  it("says who the class teacher is before anything is pressed, and asks before another teacher is put in their place (Back keeps the boxes, nothing is sent until agreed)", async () => {
    const { calls, user } = openPage({
      "GET /subjects/allotments": () => ({ ...ALLOTMENT, classTeacher: { id: "dev", name: "Dev Patel" } }),
      "PUT /staff/class-teachers": (body) => ({ ...(body as object), label: "Class 5 - A", teacher: { id: "meena", name: "Meena Singh" } }),
    });
    const d = await open(user);
    await pickClass(user, d, "Class 5", "A");
    // Said under the tick, before it is ticked.
    expect(await within(d).findByText("Class 5 - A already has a class teacher: Dev Patel. Ticking this makes Meena Singh the class teacher instead.")).toBeInTheDocument();
    await user.click(within(d).getByRole("checkbox", { name: "Class teacher of Class 5 - A" }));

    await user.click(within(d).getByRole("button", { name: "Assign" }));
    expect(await within(d).findByText("Class 5 - A already has a class teacher: Dev Patel.")).toBeInTheDocument();
    expect(within(d).getByText(/Meena Singh becomes the class teacher instead and Dev Patel no longer is/)).toBeInTheDocument();
    expect(writes(calls)).toHaveLength(0);

    await user.click(within(d).getByRole("button", { name: "Back" }));
    expect(within(d).getByRole("checkbox", { name: "Class teacher of Class 5 - A" })).toBeChecked();
    expect(writes(calls)).toHaveLength(0);

    await user.click(within(d).getByRole("button", { name: "Assign" }));
    await user.click(await within(d).findByRole("button", { name: "Replace and assign" }));
    await waitFor(() => expect(writes(calls)).toHaveLength(1));
    expect(writes(calls)[0]).toMatchObject({ path: "/staff/class-teachers", body: { classId: "c5", sectionId: "c5-A", teacherId: "meena" } });
  });

  it("one question when both a subject and the class teacher post have someone: both are named, one Replace and assign does both", async () => {
    const taught = { ...ALLOTMENT, classTeacher: { id: "dev", name: "Dev Patel" }, rows: [ALLOTMENT.rows[0], { ...ALLOTMENT.rows[1], teacherId: "kiran", teacherName: "Kiran Rao" }] };
    const { calls, user } = openPage({
      "GET /subjects/allotments": () => taught,
      "PUT /staff/class-teachers": (body) => ({ ...(body as object), label: "Class 5 - A", teacher: { id: "meena", name: "Meena Singh" } }),
    });
    const d = await open(user);
    await pickClass(user, d, "Class 5", "A");
    await user.click(box(d));
    await user.click(await screen.findByRole("option", { name: "English" }));
    await user.click(within(d).getByRole("checkbox", { name: "Class teacher of Class 5 - A" }));
    await user.click(within(d).getByRole("button", { name: "Assign" }));
    expect(await within(d).findByText("English of Class 5 - A is taught by Kiran Rao now.")).toBeInTheDocument();
    expect(within(d).getByText("Class 5 - A already has a class teacher: Dev Patel.")).toBeInTheDocument();
    expect(writes(calls)).toHaveLength(0);
    await user.click(within(d).getByRole("button", { name: "Replace and assign" }));
    await waitFor(() => expect(writes(calls)).toHaveLength(2));
  });

  it("does not ask when the tick is off: a subject alone leaves the class teacher as they are", async () => {
    const { calls, user } = openPage({ "GET /subjects/allotments": () => ({ ...ALLOTMENT, classTeacher: { id: "dev", name: "Dev Patel" } }) });
    const d = await open(user);
    await pickClass(user, d, "Class 5", "A");
    await user.click(box(d));
    await user.click(await screen.findByRole("option", { name: "Mathematics" }));
    // Not ticked: the class teacher stays as he is, and nothing is asked.
    await user.click(within(d).getByRole("button", { name: "Assign" }));
    await waitFor(() => expect(writes(calls)).toHaveLength(1));
    expect(writes(calls)[0].path).toBe("/subjects/allotments/teacher");
    expect(screen.queryByRole("button", { name: "Replace and assign" })).not.toBeInTheDocument();
  });

  it("when the teacher is the class teacher of that class already, it says so and has no tick to make", async () => {
    const { user } = openPage({ "GET /subjects/allotments": () => ({ ...ALLOTMENT, classTeacher: { id: "meena", name: "Meena Singh" } }) });
    const d = await open(user);
    await pickClass(user, d, "Class 5", "A");
    expect(await within(d).findByText("Meena Singh is the class teacher of Class 5 - A already.")).toBeInTheDocument();
    expect(within(d).queryByRole("checkbox")).not.toBeInTheDocument();
  });

  it("makes the class teacher post alone possible without a subject", async () => {
    const { calls, user } = openPage({ "PUT /staff/class-teachers": (body) => ({ ...(body as object), label: "Pre-Nursery", teacher: null }) });
    const d = await open(user);
    await pickClass(user, d, "Pre-Nursery");
    await user.click(within(d).getByRole("checkbox", { name: "Class teacher of Pre-Nursery" }));
    await user.click(within(d).getByRole("button", { name: "Assign" }));
    await waitFor(() => expect(writes(calls)).toHaveLength(1));
    expect(writes(calls)[0]).toMatchObject({ path: "/staff/class-teachers", body: { classId: "pre", sectionId: null, teacherId: "meena" } });
  });
});
