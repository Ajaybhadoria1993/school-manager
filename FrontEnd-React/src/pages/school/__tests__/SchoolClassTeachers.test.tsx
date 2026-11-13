import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Provider } from "react-redux";
import { RouterProvider, createMemoryRouter } from "react-router";
import { ToastProvider } from "../../../components/ui/toast-context";
import { allApiSlices } from "../../../redux/api/apiRoot";
import store from "../../../redux/store";
import { fakeApi, type Call, type Handler } from "../../../test/fakeApi";
import { CLASSES, STRUCTURE, classOverviewFor, studentsFor } from "../../../test/schoolClass";
import { ALLOTMENT, ART, DEV, ENGLISH, GRID, MATHS, MEENA } from "../../../test/timetableFixtures";
import type { AllotmentView, ClassOverview } from "../../../types";
import SchoolClassDetailPage from "../SchoolClassDetail";
import SchoolClassTimetablePage from "../SchoolClassTimetable";

/**
 * The teachers of a class. Its School Class page names the class teacher at the top (N/A when there is none); its Timetable & teachers page
 * gives the section a class teacher and each subject a teacher, from the teachers' list (2026-11-04: the box moved there from the class page).
 */

// Section A of Class 5 has Meena Singh as its class teacher; Class 1 (no sections) has none.
const WITH_HEAD: ClassOverview[] = CLASSES.map((c) =>
  c.id === "c5" ? { ...c, sections: c.sections.map((s) => (s.id === "c5-A" ? { ...s, classTeacher: { id: "meena", name: "Meena Singh" } } : s)) } : c
);

const KIRAN = { ...DEV, id: "kiran", name: "Kiran Rao" };
/** Class 5 - A: Maths taught by Meena with Dev as the other teacher (priority 2); English has no teacher yet. */
const WITH_BACKUP: AllotmentView = { ...ALLOTMENT, rows: [{ ...ALLOTMENT.rows[0], backups: [{ id: "dev", name: "Dev Patel" }] }, ALLOTMENT.rows[1]] };

function openPage(path: string, extra: Record<string, Handler> = {}) {
  const calls = fakeApi({
    "GET /academics/structure": () => STRUCTURE,
    "GET /students/class-overview": (_body, query) => classOverviewFor(query, WITH_HEAD),
    "GET /students": (_body, query) => studentsFor(query),
    "GET /subjects/allotments": (_body, query) => (query.get("sectionId") === "c5-A" ? WITH_BACKUP : { ...ALLOTMENT, rows: [] }),
    "GET /timetable/grid": () => GRID,
    "GET /staff/teachers": () => ({ items: [MEENA, DEV, KIRAN] }),
    "GET /subjects": () => ({ items: [MATHS, ENGLISH, ART] }),
    "PUT /staff/class-teachers": (body) => ({ ...(body as object), label: "Class 5 - A", teacher: { id: "dev", name: "Dev Patel" } }),
    "PUT /subjects/allotments/teacher": () => ALLOTMENT,
    "PUT /subjects/allotments/teachers": () => ({ ...WITH_BACKUP, classTeacher: { id: "dev", name: "Dev Patel" } }),
    ...extra,
  });
  const router = createMemoryRouter(
    [
      { path: "/school-class", element: <p>All classes</p> },
      { path: "/school-class/:classId", element: <SchoolClassDetailPage /> },
      { path: "/school-class/:classId/timetable", element: <SchoolClassTimetablePage /> },
    ],
    { initialEntries: [path] }
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
type U = ReturnType<typeof userEvent.setup>;
async function choose(user: U, scope: HTMLElement, label: string, option: string) {
  await user.click(within(scope).getByRole("button", { name: new RegExp(`(^|\\s)${label}$`) }));
  await user.click(await screen.findByRole("option", { name: option }));
}
const panel = () => screen.findByRole("region", { name: "Teachers of Class 5 - A" });

describe("the class teacher, on the class's School Class page", () => {
  it("is named at the top, N/A when there is none, and the teachers box is not on this page", async () => {
    openPage("/school-class/c1");
    expect(await screen.findByText("Class teacher: N/A")).toBeInTheDocument();
    await screen.findByRole("region", { name: /Students of Class 1/ });
    expect(screen.queryByRole("region", { name: /^Teachers of/ })).not.toBeInTheDocument();
  });

  it("is the picked section's; with no section picked each section's card says its own", async () => {
    openPage("/school-class/c5?section=c5-A");
    expect(await screen.findByText("Class teacher: Meena Singh")).toBeInTheDocument();
    cleanup();
    for (const api of allApiSlices) store.dispatch(api.util.resetApiState());

    openPage("/school-class/c5");
    const card = await screen.findByRole("link", { name: /Section A/ });
    expect(card).toHaveTextContent("Meena Singh");
    expect(screen.queryByText(/^Class teacher:/)).not.toBeInTheDocument();
  });

  it("Timetable & teachers opens the class's own page, on the picked section", async () => {
    openPage("/school-class/c5?section=c5-B");
    expect(await screen.findByRole("link", { name: "Timetable & teachers" })).toHaveAttribute("href", "/school-class/c5/timetable?section=c5-B");
    // The class's work (attendance, diary, tests), 2026-11-04.
    expect(screen.getByRole("link", { name: "Class work" })).toHaveAttribute("href", "/class-work/c5?section=c5-B");
    cleanup();
    for (const api of allApiSlices) store.dispatch(api.util.resetApiState());
    openPage("/school-class/c1");
    expect(await screen.findByRole("link", { name: "Timetable & teachers" })).toHaveAttribute("href", "/school-class/c1/timetable");
  });
});

describe("the teachers of a class, on its Timetable & teachers page (2026-11-06: one Save; 2026-11-07: tiles, other teachers in one dropdown)", () => {
  const save = (box: HTMLElement) => within(box).getByRole("button", { name: "Save" });
  /** The "Other teachers" dropdown of a subject: open it, tick each name in this order (the order is the priority), close it. */
  async function pickOthers(user: U, box: HTMLElement, subject: string, names: string[]) {
    await user.click(within(box).getByRole("button", { name: new RegExp(`(^|\\s)${subject} other teachers$`) }));
    for (const name of names) await user.click(await screen.findByRole("option", { name }));
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("listbox")).not.toBeInTheDocument());
  }
  const others = (box: HTMLElement, subject: string) => within(box).queryByRole("list", { name: `Other teachers of ${subject}` });
  const names = (list: HTMLElement | null) => (list ? within(list).getAllByRole("listitem").map((li) => li.textContent) : []);

  it("shows the class teacher, and each subject with its main teacher (1) and its other teachers in order of priority (2, 3...)", async () => {
    const { calls } = openPage("/school-class/c5/timetable?section=c5-A");
    const box = await panel();
    expect(within(box).getByRole("button", { name: /(^|\s)Class teacher$/ })).toHaveTextContent("Meena Singh");
    expect(await within(box).findByRole("button", { name: /(^|\s)Mathematics teacher$/ })).toHaveTextContent("Meena Singh");
    expect(names(others(box, "Mathematics"))).toEqual(["2Dev Patel"]);
    expect(within(box).getByRole("button", { name: /(^|\s)Mathematics other teachers$/ })).toHaveTextContent("1 other teacher");
    expect(within(box).getByRole("button", { name: /(^|\s)English teacher$/ })).toHaveTextContent("No teacher");
    // Nobody to back up when there is no main teacher: the dropdown is there but waits.
    expect(within(box).getByRole("button", { name: /(^|\s)English other teachers$/ })).toBeDisabled();
    expect(others(box, "English")).toBeNull();
    expect(within(box).getByText("6 periods a week")).toBeInTheDocument();
    expect(calls.find((c) => c.path === "/subjects/allotments")?.query).toBe("?classId=c5&sectionId=c5-A");
  });

  it("puts the class teacher and the subjects in tiles, 2 to 4 to a line, not one long list down the page", async () => {
    openPage("/school-class/c5/timetable?section=c5-A");
    const box = await panel();
    const tiles = await within(box).findByRole("list", { name: "Class teacher and subjects" });
    expect(tiles.className).toMatch(/@3xl:grid-cols-3/);
    expect(tiles.className).toMatch(/@6xl:grid-cols-4/);
    // The class teacher is the first tile, then a tile per subject.
    const each = within(tiles).getAllByRole("listitem").filter((li) => li.parentElement === tiles);
    expect(each).toHaveLength(3);
    expect(each[0]).toHaveTextContent("Class teacher");
    expect(each[1]).toHaveTextContent("Mathematics");
    expect(each[2]).toHaveTextContent("English");
  });

  it("has a Save button that waits for a change; picking a teacher sends nothing until Save", async () => {
    const { calls, user } = openPage("/school-class/c5/timetable?section=c5-A");
    const box = await panel();
    await within(box).findByRole("button", { name: /(^|\s)English teacher$/ });
    expect(save(box)).toBeDisabled();
    expect(within(box).queryByRole("button", { name: "Cancel" })).not.toBeInTheDocument();
    await choose(user, box, "English teacher", "Dev Patel");
    await choose(user, box, "Class teacher", "Kiran Rao");
    expect(writes(calls)).toHaveLength(0);
    expect(save(box)).toBeEnabled();
    expect(within(box).getByRole("button", { name: "Cancel" })).toBeInTheDocument();
  });

  it("Save asks before another teacher takes the class teacher's place: it names who is there now, Cancel sends nothing and keeps the boxes", async () => {
    const { calls, user } = openPage("/school-class/c5/timetable?section=c5-A");
    const box = await panel();
    await within(box).findByRole("button", { name: /(^|\s)English teacher$/ });
    await choose(user, box, "Class teacher", "Dev Patel");
    await choose(user, box, "English teacher", "Kiran Rao");
    await user.click(save(box));
    const ask = await screen.findByRole("dialog", { name: "Class 5 - A already has a class teacher" });
    expect(ask).toHaveTextContent("Meena Singh is the class teacher of Class 5 - A now.");
    expect(ask).toHaveTextContent("Dev Patel becomes the class teacher instead and Meena Singh no longer is.");
    expect(writes(calls)).toHaveLength(0);

    await user.click(within(ask).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Class 5 - A already has a class teacher" })).not.toBeInTheDocument());
    expect(writes(calls)).toHaveLength(0);
    // Everything picked is still there, not saved.
    expect(within(box).getByRole("button", { name: /(^|\s)Class teacher$/ })).toHaveTextContent("Dev Patel");
    expect(within(box).getByRole("button", { name: /(^|\s)English teacher$/ })).toHaveTextContent("Kiran Rao");
    expect(save(box)).toBeEnabled();

    await user.click(save(box));
    await user.click(within(await screen.findByRole("dialog", { name: "Class 5 - A already has a class teacher" })).getByRole("button", { name: "Change class teacher" }));
    await waitFor(() => expect(writes(calls)).toHaveLength(1));
    expect(writes(calls)[0].body).toMatchObject({ classId: "c5", sectionId: "c5-A", classTeacherId: "dev" });
    expect(await screen.findByRole("dialog", { name: "Teachers saved" })).toBeInTheDocument();
  });

  it("taking the class teacher away (No class teacher) asks too, and says the subjects stay; a section with nobody asks nothing", async () => {
    const { calls, user } = openPage("/school-class/c5/timetable?section=c5-A");
    const box = await panel();
    await within(box).findByRole("button", { name: /(^|\s)English teacher$/ });
    await choose(user, box, "Class teacher", "No class teacher");
    await user.click(save(box));
    const ask = await screen.findByRole("dialog", { name: "Take Meena Singh off as class teacher of Class 5 - A?" });
    expect(ask).toHaveTextContent("Class 5 - A will have no class teacher until you choose one.");
    expect(writes(calls)).toHaveLength(0);
    await user.click(within(ask).getByRole("button", { name: "Take off" }));
    await waitFor(() => expect(writes(calls)).toHaveLength(1));
    expect(writes(calls)[0].body).toMatchObject({ classTeacherId: null });
  });

  it("a section with no class teacher yet is given one without being asked", async () => {
    const { calls, user } = openPage("/school-class/c5/timetable?section=c5-B");
    const box = await screen.findByRole("region", { name: "Teachers of Class 5 - B" });
    await within(box).findByRole("button", { name: /(^|\s)Class teacher$/ });
    await choose(user, box, "Class teacher", "Dev Patel");
    await user.click(save(box));
    await waitFor(() => expect(writes(calls)).toHaveLength(1));
    expect(screen.queryByRole("dialog", { name: /already has a class teacher/ })).not.toBeInTheDocument();
    expect(writes(calls)[0].body).toMatchObject({ classId: "c5", sectionId: "c5-B", classTeacherId: "dev" });
  });

  it("only the subjects changed: the class teacher is left alone, so nothing is asked", async () => {
    const { calls, user } = openPage("/school-class/c5/timetable?section=c5-A");
    const box = await panel();
    await within(box).findByRole("button", { name: /(^|\s)English teacher$/ });
    await choose(user, box, "English teacher", "Kiran Rao");
    await user.click(save(box));
    await waitFor(() => expect(writes(calls)).toHaveLength(1));
    expect(screen.queryByRole("dialog", { name: /class teacher/i })).not.toBeInTheDocument();
  });

  it("Save sends the class teacher and the subjects that changed in ONE request, then a window says it is saved", async () => {
    const { calls, user } = openPage("/school-class/c5/timetable?section=c5-A");
    const box = await panel();
    await within(box).findByRole("button", { name: /(^|\s)English teacher$/ });
    await choose(user, box, "Class teacher", "Dev Patel");
    await choose(user, box, "English teacher", "Kiran Rao");
    await user.click(save(box));
    await user.click(within(await screen.findByRole("dialog", { name: "Class 5 - A already has a class teacher" })).getByRole("button", { name: "Change class teacher" }));
    await waitFor(() => expect(writes(calls)).toHaveLength(1));
    expect(writes(calls)[0]).toMatchObject({ method: "PUT", path: "/subjects/allotments/teachers" });
    expect(writes(calls)[0].body).toEqual({ classId: "c5", sectionId: "c5-A", classTeacherId: "dev", subjects: [{ subjectId: "english", teacherId: "kiran", backupTeacherIds: [] }] });
    const done = await screen.findByRole("dialog", { name: "Teachers saved" });
    expect(done).toHaveTextContent("Teachers of Class 5 - A are saved.");
  });

  it("after Save the week below is read again, so its periods show the new teachers (and nothing else is read twice)", async () => {
    const { calls, user } = openPage("/school-class/c5/timetable?section=c5-A");
    const box = await panel();
    await within(box).findByRole("button", { name: /(^|\s)English teacher$/ });
    await screen.findByRole("region", { name: "Week" });
    const gridReads = () => calls.filter((c) => c.method === "GET" && c.path === "/timetable/grid").length;
    expect(gridReads()).toBe(1);
    await choose(user, box, "English teacher", "Dev Patel");
    await user.click(save(box));
    await screen.findByRole("dialog", { name: "Teachers saved" });
    await waitFor(() => expect(gridReads()).toBe(2));
    // The list itself came back in the answer of the save: it is not asked for again.
    expect(calls.filter((c) => c.method === "GET" && c.path === "/subjects/allotments")).toHaveLength(1);
  });

  it("only what changed is sent: a class teacher left alone is not, nor a subject nobody touched", async () => {
    const { calls, user } = openPage("/school-class/c5/timetable?section=c5-A");
    const box = await panel();
    await within(box).findByRole("button", { name: /(^|\s)English teacher$/ });
    await choose(user, box, "English teacher", "Dev Patel");
    await user.click(save(box));
    await waitFor(() => expect(writes(calls)).toHaveLength(1));
    expect(writes(calls)[0].body).toEqual({ classId: "c5", sectionId: "c5-A", subjects: [{ subjectId: "english", teacherId: "dev", backupTeacherIds: [] }] });
  });

  it("picking the same teacher again is no change: Save stays off", async () => {
    const { user } = openPage("/school-class/c5/timetable?section=c5-A");
    const box = await panel();
    await within(box).findByRole("button", { name: /(^|\s)English teacher$/ });
    await choose(user, box, "English teacher", "Dev Patel");
    expect(save(box)).toBeEnabled();
    await choose(user, box, "English teacher", "No teacher");
    expect(save(box)).toBeDisabled();
  });

  it("Cancel puts everything back as it was saved, and sends nothing", async () => {
    const { calls, user } = openPage("/school-class/c5/timetable?section=c5-A");
    const box = await panel();
    await within(box).findByRole("button", { name: /(^|\s)English teacher$/ });
    await choose(user, box, "English teacher", "Dev Patel");
    await choose(user, box, "Class teacher", "Kiran Rao");
    await user.click(within(box).getByRole("button", { name: "Cancel" }));
    expect(within(box).getByRole("button", { name: /(^|\s)English teacher$/ })).toHaveTextContent("No teacher");
    expect(within(box).getByRole("button", { name: /(^|\s)Class teacher$/ })).toHaveTextContent("Meena Singh");
    expect(save(box)).toBeDisabled();
    expect(writes(calls)).toHaveLength(0);
  });

  it("other teachers are picked in one dropdown, many at a time; the order they are picked in is their priority, and is sent in that order", async () => {
    const { calls, user } = openPage("/school-class/c5/timetable?section=c5-A");
    const box = await panel();
    await within(box).findByRole("button", { name: /(^|\s)English teacher$/ });
    await choose(user, box, "English teacher", "Dev Patel");
    expect(within(box).getByRole("button", { name: /(^|\s)English other teachers$/ })).toBeEnabled();
    // Kiran first, then Meena (the school's list has Meena first: the order picked is what counts).
    await pickOthers(user, box, "English", ["Kiran Rao", "Meena Singh"]);
    expect(names(others(box, "English"))).toEqual(["2Kiran Rao", "3Meena Singh"]);
    expect(save(box)).toBeEnabled();
    await user.click(save(box));
    await waitFor(() => expect(writes(calls)).toHaveLength(1));
    expect(writes(calls)[0].body).toEqual({ classId: "c5", sectionId: "c5-A", subjects: [{ subjectId: "english", teacherId: "dev", backupTeacherIds: ["kiran", "meena"] }] });
  });

  it("an other teacher is taken off with the cross on its chip; the rest keep their order and move up", async () => {
    const { calls, user } = openPage("/school-class/c5/timetable?section=c5-A");
    const box = await panel();
    await within(box).findByRole("button", { name: /(^|\s)Mathematics teacher$/ });
    await pickOthers(user, box, "Mathematics", ["Kiran Rao"]);
    expect(names(others(box, "Mathematics"))).toEqual(["2Dev Patel", "3Kiran Rao"]);
    await user.click(within(box).getByRole("button", { name: "Take off Dev Patel from Mathematics" }));
    expect(names(others(box, "Mathematics"))).toEqual(["2Kiran Rao"]);
    await user.click(within(box).getByRole("button", { name: "Take off Kiran Rao from Mathematics" }));
    expect(others(box, "Mathematics")).toBeNull();
    expect(within(box).getByRole("button", { name: /(^|\s)Mathematics other teachers$/ })).toHaveTextContent("Other teachers (optional)");
    await user.click(save(box));
    await waitFor(() => expect(writes(calls)).toHaveLength(1));
    expect(writes(calls)[0].body).toEqual({ classId: "c5", sectionId: "c5-A", subjects: [{ subjectId: "maths", teacherId: "meena", backupTeacherIds: [] }] });
  });

  it("unticking a name in the open dropdown takes it off too", async () => {
    const { user } = openPage("/school-class/c5/timetable?section=c5-A");
    const box = await panel();
    await within(box).findByRole("button", { name: /(^|\s)Mathematics teacher$/ });
    await pickOthers(user, box, "Mathematics", ["Dev Patel"]);
    expect(others(box, "Mathematics")).toBeNull();
    expect(save(box)).toBeEnabled();
  });

  it("a teacher already on a subject is not offered again in it (the main teacher is not in its other teachers)", async () => {
    const { user } = openPage("/school-class/c5/timetable?section=c5-A");
    const box = await panel();
    await user.click(await within(box).findByRole("button", { name: /(^|\s)Mathematics other teachers$/ }));
    const options = (await screen.findAllByRole("option")).map((o) => o.textContent);
    expect(options).toContain("Dev Patel"); // already one of them: ticked
    expect(options).toContain("Kiran Rao");
    expect(options).not.toContain("Meena Singh"); // the main teacher
  });

  it("picking one of the other teachers as the main teacher takes it from them; clearing the main teacher takes them all away", async () => {
    const { calls, user } = openPage("/school-class/c5/timetable?section=c5-A");
    const box = await panel();
    await within(box).findByRole("button", { name: /(^|\s)Mathematics teacher$/ });
    await choose(user, box, "Mathematics teacher", "Dev Patel");
    expect(others(box, "Mathematics")).toBeNull();
    await choose(user, box, "Mathematics teacher", "No teacher");
    expect(within(box).getByRole("button", { name: /(^|\s)Mathematics other teachers$/ })).toBeDisabled();
    await user.click(save(box));
    await waitFor(() => expect(writes(calls)).toHaveLength(1));
    expect(writes(calls)[0].body).toEqual({ classId: "c5", sectionId: "c5-A", subjects: [{ subjectId: "maths", teacherId: null, backupTeacherIds: [] }] });
  });

  it("at most four other teachers: the rest of the names are greyed out once four are ticked", async () => {
    const more = ["t4", "t5", "t6"].map((id, i) => ({ ...DEV, id, name: `Teacher ${i + 4}` }));
    const { user } = openPage("/school-class/c5/timetable?section=c5-A", { "GET /staff/teachers": () => ({ items: [MEENA, DEV, KIRAN, ...more] }) });
    const box = await panel();
    await within(box).findByRole("button", { name: /(^|\s)Mathematics teacher$/ });
    await pickOthers(user, box, "Mathematics", ["Kiran Rao", "Teacher 4", "Teacher 5"]);
    expect(names(others(box, "Mathematics"))).toEqual(["2Dev Patel", "3Kiran Rao", "4Teacher 4", "5Teacher 5"]);
    await user.click(within(box).getByRole("button", { name: /(^|\s)Mathematics other teachers$/ }));
    expect(await screen.findByRole("option", { name: "Teacher 6" })).toHaveAttribute("aria-disabled", "true");
    expect(screen.getByRole("option", { name: "Teacher 5" })).not.toHaveAttribute("aria-disabled", "true");
  });

  it("Cancel also puts back the other teachers", async () => {
    const { calls, user } = openPage("/school-class/c5/timetable?section=c5-A");
    const box = await panel();
    await within(box).findByRole("button", { name: /(^|\s)Mathematics teacher$/ });
    await pickOthers(user, box, "Mathematics", ["Kiran Rao"]);
    await user.click(within(box).getByRole("button", { name: "Take off Dev Patel from Mathematics" }));
    await user.click(within(box).getByRole("button", { name: "Cancel" }));
    expect(names(others(box, "Mathematics"))).toEqual(["2Dev Patel"]);
    expect(save(box)).toBeDisabled();
    expect(writes(calls)).toHaveLength(0);
  });

  it("when the server refuses, a window says why, the changes are kept and Save can be tried again", async () => {
    const message = "Dev Patel is teaching Class 5 - B (English) at the same time";
    const { user } = openPage("/school-class/c5/timetable?section=c5-A", {
      "PUT /subjects/allotments/teachers": () => new Response(JSON.stringify({ success: false, message, code: "TIMETABLE_CLASHES" }), { status: 409, headers: { "Content-Type": "application/json" } }),
    });
    const box = await panel();
    await within(box).findByRole("button", { name: /(^|\s)English teacher$/ });
    await choose(user, box, "English teacher", "Dev Patel");
    await user.click(save(box));
    const failed = await screen.findByRole("dialog", { name: "Teachers not saved" });
    expect(failed).toHaveTextContent(message);
    await user.click(within(failed).getByRole("button", { name: "OK" }));
    expect(within(box).getByRole("button", { name: /(^|\s)English teacher$/ })).toHaveTextContent("Dev Patel");
    expect(save(box)).toBeEnabled();
  });

  it("while it saves the button waits (two taps are one request)", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const { calls, user } = openPage("/school-class/c5/timetable?section=c5-A", {
      "PUT /subjects/allotments/teachers": async () => {
        await gate;
        return { ...WITH_BACKUP, classTeacher: { id: "meena", name: "Meena Singh" } };
      },
    });
    const box = await panel();
    await within(box).findByRole("button", { name: /(^|\s)English teacher$/ });
    await choose(user, box, "English teacher", "Dev Patel");
    await user.click(save(box));
    await user.click(save(box));
    release();
    await screen.findByRole("dialog", { name: "Teachers saved" });
    expect(writes(calls)).toHaveLength(1);
  });

  it("after Save the page is clean: Save is off again and what was saved is shown", async () => {
    let state = WITH_BACKUP;
    const { user } = openPage("/school-class/c5/timetable?section=c5-A", {
      "GET /subjects/allotments": () => state,
      "PUT /subjects/allotments/teachers": () => {
        state = { ...WITH_BACKUP, rows: [WITH_BACKUP.rows[0], { ...WITH_BACKUP.rows[1], teacherId: "kiran", teacherName: "Kiran Rao" }] };
        return { ...state, classTeacher: { id: "meena", name: "Meena Singh" } };
      },
    });
    const box = await panel();
    await within(box).findByRole("button", { name: /(^|\s)English teacher$/ });
    await choose(user, box, "English teacher", "Kiran Rao");
    await user.click(save(box));
    await user.click(within(await screen.findByRole("dialog", { name: "Teachers saved" })).getByRole("button", { name: "OK" }));
    await waitFor(() => expect(save(box)).toBeDisabled());
    expect(within(box).getByRole("button", { name: /(^|\s)English teacher$/ })).toHaveTextContent("Kiran Rao");
  });

  it("leaving with changes not saved asks first; staying keeps them", async () => {
    const { router, user } = openPage("/school-class/c5/timetable?section=c5-A");
    const box = await panel();
    await within(box).findByRole("button", { name: /(^|\s)English teacher$/ });
    await choose(user, box, "English teacher", "Dev Patel");
    await user.click(screen.getByRole("link", { name: "Section B" }));
    const ask = await screen.findByRole("dialog", { name: "Leave without saving?" });
    await user.click(within(ask).getByRole("button", { name: /^Cancel$|^Stay/ }));
    expect(router.state.location.search).toBe("?section=c5-A");
    expect(within(box).getByRole("button", { name: /(^|\s)English teacher$/ })).toHaveTextContent("Dev Patel");
  });

  it("a page with nothing changed leaves without asking", async () => {
    const { router, user } = openPage("/school-class/c5/timetable?section=c5-A");
    await panel();
    await user.click(await screen.findByRole("link", { name: "Section B" }));
    await waitFor(() => expect(router.state.location.search).toBe("?section=c5-B"));
    expect(screen.queryByRole("dialog", { name: "Leave without saving?" })).not.toBeInTheDocument();
  });

  it("adds a subject with its periods a week and its teacher (it is its own action: it is saved at once)", async () => {
    const { calls, user } = openPage("/school-class/c5/timetable?section=c5-A");
    const box = await panel();
    await user.click(await within(box).findByRole("button", { name: "Add subject" }));
    await choose(user, box, "New subject", "Art & Craft");
    await user.type(within(box).getByLabelText(/^Periods a week/), "2");
    await choose(user, box, "Teacher", "Dev Patel");
    await user.click(within(box).getByRole("button", { name: "Add" }));
    await waitFor(() => expect(writes(calls)).toHaveLength(1));
    expect(writes(calls)[0]).toMatchObject({ path: "/subjects/allotments/teacher" });
    expect(writes(calls)[0].body).toEqual({ classId: "c5", sectionId: "c5-A", subjectId: "art", teacherId: "dev", periodsPerWeek: 2 });
  });

  it("changes not yet saved survive adding a subject", async () => {
    let state = WITH_BACKUP;
    const { user } = openPage("/school-class/c5/timetable?section=c5-A", {
      "GET /subjects/allotments": () => state,
      "PUT /subjects/allotments/teacher": () => {
        state = { ...WITH_BACKUP, rows: [...WITH_BACKUP.rows, { ...WITH_BACKUP.rows[0], subjectId: "art", subjectName: "Art & Craft", periodsPerWeek: 2, teacherId: "dev", teacherName: "Dev Patel", backups: [] }] };
        return state;
      },
    });
    const box = await panel();
    await within(box).findByRole("button", { name: /(^|\s)English teacher$/ });
    await choose(user, box, "English teacher", "Kiran Rao");
    await user.click(within(box).getByRole("button", { name: "Add subject" }));
    await choose(user, box, "New subject", "Art & Craft");
    await user.type(within(box).getByLabelText(/^Periods a week/), "2");
    await user.click(within(box).getByRole("button", { name: "Add" }));
    const added = await screen.findByRole("dialog", { name: "Subject added" });
    expect(added).toHaveTextContent("Art & Craft is added to Class 5 - A.");
    await user.click(within(added).getByRole("button", { name: "OK" }));
    expect(await within(box).findByRole("button", { name: /(^|\s)Art & Craft teacher$/ })).toBeInTheDocument();
    expect(within(box).getByRole("button", { name: /(^|\s)English teacher$/ })).toHaveTextContent("Kiran Rao");
    expect(save(box)).toBeEnabled();
  });

  it("a class with sections opens on its first section when none is named; a class without sections shows the box at once", async () => {
    openPage("/school-class/c5/timetable");
    expect(await panel()).toBeInTheDocument();
    cleanup();
    for (const api of allApiSlices) store.dispatch(api.util.resetApiState());
    openPage("/school-class/c1/timetable");
    expect(await screen.findByRole("region", { name: "Teachers of Class 1" })).toBeInTheDocument();
  });
});
