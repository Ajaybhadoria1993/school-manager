import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Provider } from "react-redux";
import { RouterProvider, createMemoryRouter } from "react-router";
import { IdCardView } from "../../../components/documents/IdCardView";
import { ReportCardView } from "../../../components/documents/ReportCardView";
import { StudentDocumentsCard } from "../../../components/students/detail/StudentDocumentsCard";
import { ToastProvider } from "../../../components/ui/toast-context";
import { allApiSlices } from "../../../redux/api/apiRoot";
import store from "../../../redux/store";
import { fakeApi, type Call, type Handler } from "../../../test/fakeApi";
import { signInAs, signOut } from "../../../test/session";
import type { DocumentOptions, IdCard, ReportCard, StudentDetail, UserRole } from "../../../types";
import { MAX_PHOTO_BYTES, shrinkPhoto } from "../../../utils/image";
import DocumentsPage from "../Documents";

/**
 * Documents (2026-11-19): the ID card and the exam report card, on screen and printed; a whole class at once from the Documents page; one student's from
 * their own page, with their photo; the pieces that lay each document out.
 */
const SCHOOL = { name: "Sunrise Public School", address: "12 MG Road, Bhopal, Madhya Pradesh, 462001", phone: "9876543210", email: "office@sunrise.example", board: "CBSE", affiliationNumber: "1030123", logoUrl: "/public/schools/s1/logo?v=1" };
const ID: IdCard = {
  school: SCHOOL,
  year: { name: "2026-2027", endDate: "2027-03-31" },
  student: { id: "s1", name: "Asha Verma", admissionNumber: "ADM-2026-0001", rollNumber: 12, classLabel: "Class 5 - A", dateOfBirth: "2018-05-14", gender: "Female", bloodGroup: "B+", address: "12 MG Road, Bhopal", photo: null },
  guardian: { name: "Ravi Verma", relation: "Father", mobile: "9811111111" },
};
const REPORT: ReportCard = {
  school: SCHOOL,
  year: { name: "2026-2027" },
  exam: { id: "e1", name: "Half-Yearly Exam", kind: "half_yearly", startDate: "2026-09-10", endDate: "2026-09-20" },
  student: { id: "s1", name: "Asha Verma", admissionNumber: "ADM-2026-0001", rollNumber: 12, className: "Class 5", sectionName: "A", dateOfBirth: "2018-05-14", gender: "Female", fatherName: "Ravi Verma", motherName: "Neha Verma", photo: null },
  subjects: [
    { subject: "English", marks: 40, outOf: 50, absent: false, percent: 80, grade: "B1", passed: true },
    { subject: "Mathematics", marks: 20, outOf: 100, absent: false, percent: 20, grade: "E", passed: false },
    { subject: "Science", marks: null, outOf: 0, absent: true, percent: null, grade: null, passed: null },
    { subject: "Hindi", marks: null, outOf: 0, absent: false, percent: null, grade: null, passed: null },
  ],
  totals: { marks: 60, outOf: 150, percent: 40, grade: "D", result: "fail" },
  attendance: { present: 80, absent: 10, late: 5, leave: 5, days: 100, percent: 85 },
  classTeacher: "Meena Singh",
  passPercent: 33,
  gradeBands: [{ min: 91, grade: "A1" }, { min: 81, grade: "A2" }, { min: 71, grade: "B1" }, { min: 61, grade: "B2" }, { min: 51, grade: "C1" }, { min: 41, grade: "C2" }, { min: 33, grade: "D" }, { min: 0, grade: "E" }],
  rank: null,
  remark: null,
  principalName: null,
  generatedOn: "2026-11-19",
};
const OPTIONS: DocumentOptions = {
  classes: [
    { id: "c5", name: "Class 5", sections: [{ id: "a", name: "A" }, { id: "b", name: "B" }] },
    { id: "c1", name: "Class 1", sections: [] },
  ],
  exams: [
    { id: "e1", name: "Half-Yearly Exam", kind: "half_yearly", startDate: "2026-09-10", endDate: "2026-09-20" },
    { id: "e2", name: "Unit Test 1", kind: "unit_test", startDate: "2026-07-10", endDate: "2026-07-10" },
  ],
};
const MIRA: IdCard = { ...ID, student: { ...ID.student, id: "s2", name: "Kabir Rao", rollNumber: 3, photo: "data:image/png;base64,AAAA" } };
const posted = (calls: Call[], method: string, path: string) => calls.filter((c) => c.method === method && c.path === path);

let print: ReturnType<typeof vi.fn>;
beforeEach(() => {
  print = vi.fn();
  window.print = print as unknown as typeof window.print;
});
afterEach(() => {
  cleanup();
  signOut();
  vi.unstubAllGlobals();
  for (const api of allApiSlices) store.dispatch(api.util.resetApiState());
});

function openPage(extra: Record<string, Handler> = {}, at = "/documents", who: { role?: UserRole; permissions?: string[] } = {}) {
  signInAs(who.role ?? "school_admin", who.permissions);
  const calls = fakeApi({
    "GET /documents/options": () => OPTIONS,
    "GET /documents/classes/c5/id-cards": () => ({ items: [ID, MIRA] }),
    "GET /documents/classes/c5/report-cards": () => ({ items: [REPORT] }),
    ...extra,
  });
  const router = createMemoryRouter([{ path: "/documents", element: <DocumentsPage /> }], { initialEntries: [at] });
  render(
    <Provider store={store}>
      <ToastProvider>
        <RouterProvider router={router} />
      </ToastProvider>
    </Provider>,
  );
  return { calls, user: userEvent.setup() };
}

describe("the ID card", () => {
  it("front: the school, the student's name, class, roll, admission number, date of birth, blood group; back: the parent to call, the address and the school", () => {
    render(<IdCardView card={ID} />);
    const front = screen.getByRole("article", { name: "Front" });
    expect(within(front).getByText("Sunrise Public School")).toBeInTheDocument();
    expect(within(front).getByText("Asha Verma")).toBeInTheDocument();
    for (const text of ["Class 5 - A", "12", "ADM-2026-0001", "14 May 2018", "B+"]) expect(within(front).getByText(text)).toBeInTheDocument();
    expect(within(front).getByText("Valid till 31 Mar 2027")).toBeInTheDocument();
    // No photo yet: a box to paste one.
    expect(within(front).getByText("Paste photo here")).toBeInTheDocument();
    const back = screen.getByRole("article", { name: "Back" });
    expect(within(back).getByText("Ravi Verma · 9811111111")).toBeInTheDocument();
    expect(within(back).getByText(/12 MG Road, Bhopal, Madhya Pradesh, 462001 · 9876543210/)).toBeInTheDocument();
    expect(within(back).getByText(/please return this card to the school/)).toBeInTheDocument();
  });

  it("shows the photo when there is one; leaves out the roll number and blood group that are not known", () => {
    render(<IdCardView card={{ ...ID, student: { ...ID.student, photo: "data:image/png;base64,AAAA", rollNumber: null, bloodGroup: null } }} />);
    expect(screen.getByAltText("Photo of Asha Verma")).toHaveAttribute("src", "data:image/png;base64,AAAA");
    const front = screen.getByRole("article", { name: "Front" });
    expect(within(front).queryByText("Roll no.")).not.toBeInTheDocument();
    expect(within(front).queryByText("Blood")).not.toBeInTheDocument();
  });
});

describe("the report card", () => {
  it("lays out each subject's marks, out of, percentage and grade; Absent and a dash for what is not in; the total, grade and result", () => {
    render(<ReportCardView card={REPORT} />);
    const card = screen.getByRole("article", { name: "Report card of Asha Verma" });
    expect(within(card).getByText(/REPORT CARD · Half-Yearly Exam · 2026-2027/)).toBeInTheDocument();
    expect(within(card).getByText("Ravi Verma")).toBeInTheDocument();
    expect(within(card).getByText("Class 5 - A")).toBeInTheDocument();
    const row = (name: string) => within(card).getByRole("row", { name: new RegExp(name) });
    expect(within(row("English")).getAllByRole("cell").map((c) => c.textContent)).toEqual(["40", "50", "80", "B1"]);
    expect(within(row("Science")).getAllByRole("cell").map((c) => c.textContent)).toEqual(["Absent", "-", "-", "-"]);
    expect(within(row("Hindi")).getAllByRole("cell").map((c) => c.textContent)).toEqual(["-", "-", "-", "-"]);
    expect(within(row("Total")).getAllByRole("cell").map((c) => c.textContent)).toEqual(["60", "150", "40", "D"]);
    expect(within(card).getByText(/Not passed \(below the pass mark in a subject\)/)).toBeInTheDocument();
    expect(within(card).getByText("85 of 100 days (85%)")).toBeInTheDocument();
    expect(within(card).getByText("Class teacher: Meena Singh")).toBeInTheDocument();
    expect(within(card).getByText(/Pass mark 33%/)).toBeInTheDocument();
  });

  it("a pass says Pass; while no mark is in it says so and has no total row; a class with no paper says so", () => {
    const { rerender } = render(<ReportCardView card={{ ...REPORT, totals: { marks: 130, outOf: 150, percent: 87, grade: "A2", result: "pass" } }} />);
    expect(screen.getByText("Pass")).toBeInTheDocument();
    rerender(<ReportCardView card={{ ...REPORT, totals: null, subjects: [] }} />);
    expect(screen.getByText("Marks are not in yet.")).toBeInTheDocument();
    expect(screen.queryByRole("row", { name: /^Total/ })).not.toBeInTheDocument();
    expect(screen.getByText("No paper of this exam is set for this class.")).toBeInTheDocument();
  });
});

describe("Documents (a whole class)", () => {
  it("asks for a class first, then shows the ID cards of its students and offers to print them", async () => {
    const { user } = openPage();
    expect(await screen.findByText("Choose a class to see its documents")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Choose the class/ }));
    await user.click(await screen.findByRole("option", { name: "Class 5" }));
    const section = await screen.findByRole("region", { name: "ID cards" });
    expect(within(section).getAllByRole("group").map((g) => g.getAttribute("aria-label"))).toEqual(["ID card of Asha Verma", "ID card of Kabir Rao"]);
    expect(screen.getByRole("button", { name: "Print 2 ID cards" })).toBeInTheDocument();
  });

  it("printing puts a copy of the documents under the page, opens the print window, and takes the copy away when it closes", async () => {
    const { user } = openPage({}, "/documents?classId=c5");
    await user.click(await screen.findByRole("button", { name: "Print 2 ID cards" }));
    await waitFor(() => expect(print).toHaveBeenCalledTimes(1));
    const root = document.querySelector("body > .print-root") as HTMLElement;
    expect(root).not.toBeNull();
    expect(within(root).getAllByRole("group")).toHaveLength(2);
    act(() => {
      window.dispatchEvent(new Event("afterprint"));
    });
    await waitFor(() => expect(document.querySelector("body > .print-root")).toBeNull());
  });

  it("report cards: the exam is the latest to start with, one card for each student, each on its own page; a section narrows it", async () => {
    const { calls, user } = openPage({ "GET /documents/classes/c5/report-cards": () => ({ items: [REPORT] }) }, "/documents?kind=report-cards&classId=c5");
    const section = await screen.findByRole("region", { name: "Report cards" });
    expect(within(section).getByRole("article", { name: "Report card of Asha Verma" })).toBeInTheDocument();
    expect(calls.find((c) => c.path === "/documents/classes/c5/report-cards")!.query).toBe("?examId=e1");
    await user.click(screen.getByRole("button", { name: /Section/ }));
    await user.click(await screen.findByRole("option", { name: "B" }));
    await waitFor(() => expect(calls.some((c) => c.path === "/documents/classes/c5/report-cards" && c.query === "?examId=e1&sectionId=b")).toBe(true));
    expect(screen.getByRole("button", { name: "Print 1 report card" })).toBeInTheDocument();
  });

  it("says when the school has no exam, and when the class has no student", async () => {
    openPage({ "GET /documents/options": () => ({ ...OPTIONS, exams: [] }) }, "/documents?kind=report-cards&classId=c5");
    expect(await screen.findByText("There is no exam in this session yet")).toBeInTheDocument();
    cleanup();
    for (const api of allApiSlices) store.dispatch(api.util.resetApiState());
    openPage({ "GET /documents/classes/c5/id-cards": () => ({ items: [] }) }, "/documents?classId=c5");
    expect(await screen.findByText("No student in this class")).toBeInTheDocument();
  });

  it("says why when the server refuses", async () => {
    openPage({ "GET /documents/classes/c5/id-cards": () => new Response(JSON.stringify({ success: false, message: "This group has 300 students. Choose a section, up to 200 at a time." }), { status: 400, headers: { "Content-Type": "application/json" } }) }, "/documents?classId=c5");
    expect(await screen.findByText(/Choose a section, up to 200 at a time/)).toBeInTheDocument();
  });
});

describe("one student's page", () => {
  const STUDENT = { id: "s1", name: "Asha Verma", status: "active" } as unknown as StudentDetail;
  function openCard(extra: Record<string, Handler> = {}, who: { role?: UserRole; permissions?: string[] } = {}, readOnlyYear = false) {
    signInAs(who.role ?? "school_admin", who.permissions);
    const calls = fakeApi({
      "GET /documents/students/s1/photo": () => ({ photo: null }),
      "GET /documents/students/s1/id-card": () => ID,
      "GET /documents/options": () => OPTIONS,
      "GET /documents/students/s1/report-card": (_b, q) => ({ ...REPORT, exam: { ...REPORT.exam, id: q.get("examId") ?? "" } }),
      ...extra,
    });
    render(
      <Provider store={store}>
        <ToastProvider>
          <StudentDocumentsCard student={STUDENT} readOnlyYear={readOnlyYear} />
        </ToastProvider>
      </Provider>,
    );
    return { calls, user: userEvent.setup() };
  }

  it("opens the ID card to read and print, and the report card of an exam of the school's choice", async () => {
    const { calls, user } = openCard();
    await user.click(await screen.findByRole("button", { name: "ID card" }));
    const dialog = await screen.findByRole("dialog", { name: "ID card" });
    expect(await within(dialog).findByRole("group", { name: "ID card of Asha Verma" })).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Print" }));
    await waitFor(() => expect(print).toHaveBeenCalled());
    act(() => {
      window.dispatchEvent(new Event("afterprint"));
    });
    await user.click(within(dialog).getByRole("button", { name: "Done" }));

    await user.click(screen.getByRole("button", { name: "Report card" }));
    const report = await screen.findByRole("dialog", { name: "Report card" });
    expect(await within(report).findByRole("article", { name: "Report card of Asha Verma" })).toBeInTheDocument();
    // The latest exam to start with; the other can be chosen.
    expect(calls.filter((c) => c.path === "/documents/students/s1/report-card").map((c) => c.query)).toEqual(["?examId=e1"]);
    await user.click(within(report).getByRole("button", { name: /Exam/ }));
    await user.click(await screen.findByRole("option", { name: "Unit Test 1" }));
    await waitFor(() => expect(calls.some((c) => c.query === "?examId=e2")).toBe(true));
  });

  it("a student's photo is added by one who may edit students: it is made small, sent as a file, and shows", async () => {
    let saved: string | null = null;
    const { calls, user } = openCard({
      "POST /documents/students/s1/photo": () => ({ photo: saved }),
      "PUT /documents/students/s1/photo": () => {
        saved = "data:image/jpeg;base64,BBBB";
        return { photo: saved };
      },
      "GET /documents/students/s1/photo": () => ({ photo: saved }),
    });
    await user.click(await screen.findByRole("button", { name: "Add photo" }));
    const input = screen.getByLabelText("Choose a photo") as HTMLInputElement;
    const file = new File([new Uint8Array(1000)], "asha.png", { type: "image/png" });
    await user.upload(input, file);
    await waitFor(() => expect(posted(calls, "PUT", "/documents/students/s1/photo")).toHaveLength(1));
    expect(posted(calls, "PUT", "/documents/students/s1/photo")[0].body).toBe("(a file)");
    expect(await screen.findByAltText("Photo of Asha Verma")).toHaveAttribute("src", "data:image/jpeg;base64,BBBB");
    expect(screen.getByRole("button", { name: "Change photo" })).toBeInTheDocument();
  });

  it("a picture that is too big even after it is made small is refused before it is sent; the server's word is shown too", async () => {
    const { calls, user } = openCard({ "PUT /documents/students/s1/photo": () => new Response(JSON.stringify({ success: false, message: "The photo must be a PNG, JPG or WebP picture." }), { status: 400, headers: { "Content-Type": "application/json" } }) });
    await user.click(await screen.findByRole("button", { name: "Add photo" }));
    const input = screen.getByLabelText("Choose a photo") as HTMLInputElement;
    await user.upload(input, new File([new Uint8Array(MAX_PHOTO_BYTES + 1)], "big.png", { type: "image/png" }));
    expect(await screen.findByText("The photo is too big. Choose a smaller picture.")).toBeInTheDocument();
    expect(posted(calls, "PUT", "/documents/students/s1/photo")).toHaveLength(0);
    await user.upload(input, new File([new Uint8Array(10)], "x.png", { type: "image/png" }));
    expect(await screen.findByText("The photo must be a PNG, JPG or WebP picture.")).toBeInTheDocument();
  });

  it("the photo can be taken away", async () => {
    const { calls, user } = openCard({ "GET /documents/students/s1/photo": () => ({ photo: "data:image/png;base64,AAAA" }), "DELETE /documents/students/s1/photo": () => ({ photo: null }) });
    await user.click(await screen.findByRole("button", { name: "Remove the photo" }));
    await waitFor(() => expect(posted(calls, "DELETE", "/documents/students/s1/photo")).toHaveLength(1));
  });

  it("who may print gets the buttons; who may only edit gets the photo; a past year or no right at all gets none", async () => {
    openCard({}, { role: "receptionist", permissions: ["documents.view"] });
    expect(await screen.findByRole("button", { name: "ID card" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add photo" })).not.toBeInTheDocument();
    cleanup();
    for (const api of allApiSlices) store.dispatch(api.util.resetApiState());
    openCard({}, { role: "receptionist", permissions: ["students.edit"] });
    expect(await screen.findByRole("button", { name: "Add photo" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "ID card" })).not.toBeInTheDocument();
    cleanup();
    for (const api of allApiSlices) store.dispatch(api.util.resetApiState());
    openCard({}, { role: "receptionist", permissions: ["calendar.view"] });
    expect(screen.queryByRole("group", { name: "Photo and documents" })).not.toBeInTheDocument();
    cleanup();
    for (const api of allApiSlices) store.dispatch(api.util.resetApiState());
    openCard({}, {}, true);
    await screen.findByRole("button", { name: "ID card" });
    expect(screen.queryByRole("button", { name: "Add photo" })).not.toBeInTheDocument();
  });
});

describe("making a photo small", () => {
  it("leaves the picture as it is when the browser cannot shrink it (the server's size check still decides)", async () => {
    const file = new File([new Uint8Array(500)], "a.png", { type: "image/png" });
    expect(await shrinkPhoto(file)).toBe(file);
  });
});
