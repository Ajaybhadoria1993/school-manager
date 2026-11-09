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
    { subjectId: "english", subjectName: "English", canWrite: false, entry: { taught: "Poem: The Kite", homework: "", writtenBy: { name: "Dev Patel", role: "teacher" } } },
    { subjectId: "maths", subjectName: "Mathematics", canWrite: true, entry: null },
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
