import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Provider } from "react-redux";
import { RouterProvider, createMemoryRouter } from "react-router";
import { ToastProvider } from "../../../components/ui/toast-context";
import { allApiSlices } from "../../../redux/api/apiRoot";
import store from "../../../redux/store";
import { sessionStarted, signedOut } from "../../../redux/slices/authSlice";
import { fakeApi, type Call, type Handler } from "../../../test/fakeApi";
import type { ClassTestDetail, ClassTestItem, DiaryDay, MyClass } from "../../../types";
import { todayInIndia } from "../../../utils/students";
import ClassWorkPage from "../ClassWorkPage";

/** A class's diary and tests (docs/parent-teacher-flow.md phases 4 and 5): a window to write, a window to add a test, a window for marks. */

const today = todayInIndia();
const FIVE_A: MyClass = { classId: "c5", sectionId: "c5-A", label: "Class 5 - A", isClassTeacher: false, subjects: [{ id: "maths", name: "Mathematics" }] };
const DAY: DiaryDay = {
  classId: "c5",
  sectionId: "c5-A",
  label: "Class 5 - A",
  date: today,
  subjects: [
    { subjectId: "english", subjectName: "English", canWrite: false, chapters: [], entry: { taught: "Poem: The Kite", homework: "", chapterId: null, writtenBy: { name: "Dev Patel", role: "teacher" } } },
    { subjectId: "maths", subjectName: "Mathematics", canWrite: true, chapters: [], entry: null },
  ],
};
/** Mathematics with its chapters: the first finished, yesterday's entry on the second. */
const CHAPTERS_DAY: DiaryDay = {
  ...DAY,
  subjects: [
    DAY.subjects[0],
    {
      subjectId: "maths",
      subjectName: "Mathematics",
      canWrite: true,
      chapters: [
        { id: "ch1", name: "Numbers", done: true, plannedOn: null, late: false },
        { id: "ch2", name: "Fractions", done: false, plannedOn: "2026-04-10", late: true },
      ],
      entry: null,
    },
  ],
};
const TEST: ClassTestItem = { id: "t1", subjectId: "maths", subjectName: "Mathematics", date: today, topic: "Fractions", maxMarks: 20, marked: 0, average: null, canWrite: true };
const DETAIL: ClassTestDetail = {
  ...TEST,
  label: "Class 5 - A",
  students: [
    { id: "s1", name: "Asha Verma", admissionNumber: "ADM-1", rollNumber: 1, marks: null, absent: false },
    { id: "s2", name: "Kabir Rao", admissionNumber: "ADM-2", rollNumber: 2, marks: null, absent: false },
  ],
};

function openPage(path: string, extra: Record<string, Handler> = {}) {
  store.dispatch(
    sessionStarted({
      user: { id: "u2", name: "Meena Singh", email: null, username: "meena", role: "teacher", tenantId: "t1", emailVerifiedAt: null },
      tenant: { id: "t1", name: "Sunrise Public School", approvalStatus: "approved", isActive: true },
    } as never)
  );
  const calls = fakeApi({
    "GET /classroom/my-classes": () => ({ items: [FIVE_A] }),
    "GET /classroom/diary": () => DAY,
    "PUT /classroom/diary": () => DAY,
    "GET /classroom/tests": () => ({ label: "Class 5 - A", items: [TEST] }),
    "POST /classroom/tests": (body) => ({ ...TEST, id: "t9", ...(body as object) }),
    "GET /classroom/tests/t1": () => DETAIL,
    "PUT /classroom/tests/t1/marks": () => ({ ...DETAIL, marked: 2, average: 75 }),
    ...extra,
  });
  const router = createMemoryRouter([{ path: "/class-work/:classId", element: <ClassWorkPage /> }], { initialEntries: [path] });
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
  store.dispatch(signedOut());
  vi.unstubAllGlobals();
});

const writes = (calls: Call[]) => calls.filter((c) => c.method !== "GET");

describe("the diary of a class", () => {
  it("a subject teacher opens on the Diary: every subject of the day, theirs with Write", async () => {
    openPage("/class-work/c5?section=c5-A");
    const english = await screen.findByRole("article", { name: "English" });
    expect(english).toHaveTextContent("Poem: The Kite");
    expect(english).toHaveTextContent("Dev Patel");
    expect(within(english).queryByRole("button")).not.toBeInTheDocument();
    expect(within(screen.getByRole("article", { name: "Mathematics" })).getByRole("button", { name: "Write Mathematics" })).toBeInTheDocument();
    // Not the class teacher: no attendance tab.
    expect(screen.queryByRole("tab", { name: "Attendance" })).not.toBeInTheDocument();
  });

  it("Write: what was taught and the homework in a window; saved, a window says so", async () => {
    const { calls, user } = openPage("/class-work/c5?section=c5-A");
    await user.click(within(await screen.findByRole("article", { name: "Mathematics" })).getByRole("button", { name: "Write Mathematics" }));
    const dialog = await screen.findByRole("dialog", { name: "Mathematics, Class 5 - A" });
    await user.type(within(dialog).getByLabelText(/^Taught today/), "Fractions: adding");
    await user.type(within(dialog).getByLabelText(/^Homework/), "Page 42");
    await user.click(within(dialog).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(writes(calls)).toHaveLength(1));
    expect(writes(calls)[0].body).toEqual({ classId: "c5", sectionId: "c5-A", date: today, subjectId: "maths", taught: "Fractions: adding", homework: "Page 42" });
    expect(await screen.findByRole("dialog", { name: "Diary saved" })).toHaveTextContent("parents");
  });
});

describe("the chapters of a subject", () => {
  const withChapters = { "GET /classroom/diary": () => CHAPTERS_DAY, "PUT /classroom/syllabus": () => ({ chapters: [] }) };

  it("a card says how far the subject is, and a day's entry names its chapter", async () => {
    openPage("/class-work/c5?section=c5-A", {
      "GET /classroom/diary": () => ({
        ...CHAPTERS_DAY,
        subjects: [DAY.subjects[0], { ...CHAPTERS_DAY.subjects[1], entry: { taught: "Adding", homework: "", chapterId: "ch2", writtenBy: { name: "Meena Singh", role: "teacher" } } }],
      }),
    });
    const maths = await screen.findByRole("article", { name: "Mathematics" });
    expect(maths).toHaveTextContent("1 of 2 chapters done");
    expect(maths).toHaveTextContent("2. Fractions");
    expect(maths).toHaveTextContent("1 late");
  });

  it("Write: choose the chapter taught and tick it finished", async () => {
    const { calls, user } = openPage("/class-work/c5?section=c5-A", withChapters);
    await user.click(within(await screen.findByRole("article", { name: "Mathematics" })).getByRole("button", { name: "Write Mathematics" }));
    const dialog = await screen.findByRole("dialog", { name: "Mathematics, Class 5 - A" });
    expect(within(dialog).queryByRole("checkbox", { name: "Chapter finished" })).not.toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: /Chapter/ }));
    await user.click(await screen.findByRole("option", { name: "2. Fractions" }));
    await user.click(within(dialog).getByRole("checkbox", { name: "Chapter finished" }));
    await user.click(within(dialog).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(writes(calls)).toHaveLength(1));
    expect(writes(calls)[0].body).toEqual({ classId: "c5", sectionId: "c5-A", date: today, subjectId: "maths", taught: "", homework: "", chapterId: "ch2", chapterDone: true });
  });

  it("Chapters: say how many there are, name them, and save once", async () => {
    const { calls, user } = openPage("/class-work/c5?section=c5-A", { "PUT /classroom/syllabus": () => ({ chapters: [] }) });
    await user.click(within(await screen.findByRole("article", { name: "Mathematics" })).getByRole("button", { name: "Add chapters of Mathematics" }));
    const dialog = await screen.findByRole("dialog", { name: "Chapters of Mathematics" });
    await user.type(within(dialog).getByLabelText(/^Total chapters/), "3");
    await user.type(within(dialog).getByLabelText("Name of chapter 1"), "Numbers");
    await user.click(within(dialog).getByRole("checkbox", { name: "Chapter 1 finished" }));
    await user.click(within(dialog).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(writes(calls)).toHaveLength(1));
    expect(writes(calls)[0]).toMatchObject({
      method: "PUT",
      path: "/classroom/syllabus",
      body: {
        classId: "c5",
        sectionId: "c5-A",
        subjectId: "maths",
        chapters: [
          { name: "Numbers", done: true, plannedOn: null },
          { name: "Chapter 2", done: false, plannedOn: null },
          { name: "Chapter 3", done: false, plannedOn: null },
        ],
      },
    });
    expect(await screen.findByRole("dialog", { name: "Chapters saved" })).toBeInTheDocument();
  });

  it("Chapters already there keep their ids; one can be taken off, and the server's refusal is shown", async () => {
    const { calls, user } = openPage("/class-work/c5?section=c5-A", {
      ...withChapters,
      "PUT /classroom/syllabus": () => new Response(JSON.stringify({ success: false, message: '"Numbers" was already taught, so it cannot be taken off.', code: "CHAPTER_IN_USE" }), { status: 409, headers: { "Content-Type": "application/json" } }),
    });
    await user.click(within(await screen.findByRole("article", { name: "Mathematics" })).getByRole("button", { name: "Chapters of Mathematics" }));
    const dialog = await screen.findByRole("dialog", { name: "Chapters of Mathematics" });
    expect(within(dialog).getByLabelText(/^Total chapters/)).toHaveValue(2);
    await user.click(within(dialog).getByRole("button", { name: "Remove chapter 1" }));
    await user.click(within(dialog).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(writes(calls)).toHaveLength(1));
    expect((writes(calls)[0].body as { chapters: unknown[] }).chapters).toEqual([{ id: "ch2", name: "Fractions", done: false, plannedOn: "2026-04-10" }]);
    expect(await within(dialog).findByText(/already taught/)).toBeInTheDocument();
  });

  it("Finish by: a day typed for a chapter is saved with it; the server's word about a day outside the session is shown", async () => {
    const { calls, user } = openPage("/class-work/c5?section=c5-A", {
      "PUT /classroom/syllabus": () =>
        new Response(JSON.stringify({ success: false, message: "Invalid request data", code: "VALIDATION_ERROR", details: [{ path: "chapters.0.plannedOn", message: "Choose a day of the 2026-2027 session" }] }), { status: 400, headers: { "Content-Type": "application/json" } }),
    });
    await user.click(within(await screen.findByRole("article", { name: "Mathematics" })).getByRole("button", { name: "Add chapters of Mathematics" }));
    const dialog = await screen.findByRole("dialog", { name: "Chapters of Mathematics" });
    await user.type(within(dialog).getByLabelText(/^Total chapters/), "1");
    const day = within(dialog).getByRole("group", { name: /^Finish by day of chapter 1/ });
    await user.click(within(day).getAllByRole("spinbutton")[0]);
    await user.keyboard("20032027");
    await user.click(within(dialog).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(writes(calls)).toHaveLength(1));
    expect((writes(calls)[0].body as { chapters: unknown[] }).chapters).toEqual([{ name: "Chapter 1", done: false, plannedOn: "2027-03-20" }]);
    expect(await within(dialog).findByText("Choose a day of the 2026-2027 session")).toBeInTheDocument();
  });

  it("Copy from: another section's or year's chapters are added to the list, asked only when wanted, saved with the one Save", async () => {
    const { calls, user } = openPage("/class-work/c5?section=c5-A", {
      ...withChapters,
      "GET /classroom/syllabus/sources": () => [
        { id: "p1", label: "Class 5 - B", chapters: [{ name: "fractions", plannedOn: null }, { name: "Shapes", plannedOn: "2027-01-10" }] },
        { id: "p2", label: "Class 5 - A, 2025-2026", chapters: [{ name: "Angles", plannedOn: null }] },
      ],
    });
    await user.click(within(await screen.findByRole("article", { name: "Mathematics" })).getByRole("button", { name: "Chapters of Mathematics" }));
    const dialog = await screen.findByRole("dialog", { name: "Chapters of Mathematics" });
    const asked = () => calls.filter((c) => c.path === "/classroom/syllabus/sources");
    expect(asked()).toHaveLength(0);
    await user.click(within(dialog).getByRole("button", { name: "Copy from another section or year" }));
    await user.click(await within(dialog).findByRole("button", { name: /Copy from$/ }));
    await user.click(await screen.findByRole("option", { name: "Class 5 - B" }));
    expect(asked().map((c) => c.query)).toEqual(["?classId=c5&sectionId=c5-A&subjectId=maths"]);
    expect(within(dialog).getByLabelText(/^Total chapters/)).toHaveValue(3);
    expect(within(dialog).getByLabelText("Name of chapter 3")).toHaveValue("Shapes");
    expect(writes(calls)).toHaveLength(0);
    await user.click(within(dialog).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(writes(calls)).toHaveLength(1));
    expect((writes(calls)[0].body as { chapters: unknown[] }).chapters).toEqual([
      { id: "ch1", name: "Numbers", done: true, plannedOn: null },
      { id: "ch2", name: "Fractions", done: false, plannedOn: "2026-04-10" },
      { name: "Shapes", done: false, plannedOn: "2027-01-10" },
    ]);
  });

  it("Copy from: says so when there is nothing to copy", async () => {
    const { user } = openPage("/class-work/c5?section=c5-A", { "GET /classroom/syllabus/sources": () => [] });
    await user.click(within(await screen.findByRole("article", { name: "Mathematics" })).getByRole("button", { name: "Add chapters of Mathematics" }));
    const dialog = await screen.findByRole("dialog", { name: "Chapters of Mathematics" });
    await user.click(within(dialog).getByRole("button", { name: "Copy from another section or year" }));
    expect(await within(dialog).findByText("No other chapters to copy")).toBeInTheDocument();
  });
});

describe("the tests of a class", () => {
  it("Add a test: subject, day, topic and marks out of in a window; added, a window says parents see it", async () => {
    const { calls, user } = openPage("/class-work/c5?section=c5-A&tab=tests");
    await user.click(await screen.findByRole("button", { name: "Add a test" }));
    const dialog = await screen.findByRole("dialog", { name: "Add a test" });
    await user.click(within(dialog).getByRole("button", { name: "Tomorrow" }));
    await user.type(within(dialog).getByLabelText(/^Topic/), "Decimals");
    await user.type(within(dialog).getByLabelText(/^Out of/), "25");
    await user.click(within(dialog).getByRole("button", { name: "Add test" }));
    await waitFor(() => expect(writes(calls)).toHaveLength(1));
    expect(writes(calls)[0].body).toMatchObject({ classId: "c5", sectionId: "c5-A", subjectId: "maths", topic: "Decimals", maxMarks: 25 });
    expect(await screen.findByRole("dialog", { name: "Test added" })).toBeInTheDocument();
  });

  it("Enter marks: each child's marks (or absent) in a window; saved, a window gives the average", async () => {
    const { calls, user } = openPage("/class-work/c5?section=c5-A&tab=tests");
    const test = await screen.findByRole("article", { name: /Mathematics: Fractions/ });
    await user.click(within(test).getByRole("button", { name: "Enter marks" }));
    const dialog = await screen.findByRole("dialog", { name: "Marks of Mathematics: Fractions" });
    await user.type(within(dialog).getByLabelText("Marks of Asha Verma"), "15");
    await user.click(within(dialog).getByRole("checkbox", { name: "Kabir Rao was absent" }));
    await user.click(within(dialog).getByRole("button", { name: "Save marks" }));
    await waitFor(() => expect(writes(calls)).toHaveLength(1));
    expect(writes(calls)[0]).toMatchObject({
      method: "PUT",
      path: "/classroom/tests/t1/marks",
      body: { marks: [{ studentId: "s1", marks: 15, absent: false }, { studentId: "s2", marks: null, absent: true }] },
    });
    expect(await screen.findByRole("dialog", { name: "Marks saved" })).toHaveTextContent("75%");
  });
});
