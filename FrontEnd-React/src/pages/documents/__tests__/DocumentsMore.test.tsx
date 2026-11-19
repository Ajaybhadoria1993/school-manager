import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Provider } from "react-redux";
import { RouterProvider, createMemoryRouter } from "react-router";
import { AdmitCardView } from "../../../components/documents/AdmitCardView";
import { CertificateView } from "../../../components/documents/CertificateView";
import { IdCardView } from "../../../components/documents/IdCardView";
import { ReportCardView } from "../../../components/documents/ReportCardView";
import { StudentDocumentsCard } from "../../../components/students/detail/StudentDocumentsCard";
import { ToastProvider } from "../../../components/ui/toast-context";
import { allApiSlices } from "../../../redux/api/apiRoot";
import store from "../../../redux/store";
import { fakeApi, type Call, type Handler } from "../../../test/fakeApi";
import { signInAs, signOut } from "../../../test/session";
import type { AdmitCard, Certificate, CertificateSheet, DocumentOptions, DocumentSettings, IdCard, ReportCard, StudentDetail, UserRole } from "../../../types";
import DocumentsPage from "../Documents";

/**
 * Documents, the second part (2026-11-19): the report card's rank, remark and the school's own scale; the admit card; the certificates (bonafide,
 * character, transfer) and their register; how the school grades; the QR code on the ID card.
 */
const SCHOOL = { name: "Sunrise Public School", address: "12 MG Road, Bhopal", phone: "9876543210", email: null, board: "CBSE", affiliationNumber: "1030123", logoUrl: "" };
const BANDS = [{ min: 91, grade: "A1" }, { min: 81, grade: "A2" }, { min: 71, grade: "B1" }, { min: 61, grade: "B2" }, { min: 51, grade: "C1" }, { min: 41, grade: "C2" }, { min: 33, grade: "D" }, { min: 0, grade: "E" }];
const REPORT: ReportCard = {
  school: SCHOOL,
  year: { name: "2026-2027" },
  exam: { id: "e1", name: "Half-Yearly Exam", kind: "half_yearly", startDate: "2026-09-10", endDate: "2026-09-20" },
  student: { id: "s1", name: "Asha Verma", admissionNumber: "ADM-1", rollNumber: 12, className: "Class 5", sectionName: "A", dateOfBirth: "2018-05-14", gender: "Female", fatherName: "Ravi Verma", motherName: "Neha Verma", photo: null },
  subjects: [{ subject: "Mathematics", marks: 90, outOf: 100, absent: false, percent: 90, grade: "Excellent", passed: true }],
  totals: { marks: 90, outOf: 100, percent: 90, grade: "Excellent", result: "pass" },
  attendance: { present: 0, absent: 0, late: 0, leave: 0, days: 0, percent: null },
  classTeacher: "Meena Singh",
  passPercent: 40,
  gradeBands: [{ min: 80, grade: "Excellent" }, { min: 50, grade: "Good" }, { min: 0, grade: "Needs work" }],
  rank: { position: 2, of: 38 },
  remark: "Works hard. Needs to write neatly.",
  principalName: "Dr. R. Sharma",
  generatedOn: "2026-11-19",
};
const ADMIT: AdmitCard = {
  school: SCHOOL,
  year: { name: "2026-2027" },
  exam: { id: "e1", name: "Half-Yearly Exam", kind: "half_yearly", startDate: "2026-09-10", endDate: "2026-09-20" },
  student: { id: "s1", name: "Asha Verma", admissionNumber: "ADM-1", rollNumber: 12, classLabel: "Class 5 - A", dateOfBirth: "2018-05-14", gender: "Female", fatherName: "Ravi Verma", photo: null },
  papers: [
    { date: "2026-09-15", day: "Tuesday", subject: "Mathematics", start: "09:00", end: "10:00", durationMinutes: 60, maxMarks: 100 },
    { date: "2026-09-16", day: "Wednesday", subject: "English", start: "11:00", end: "12:30", durationMinutes: 90, maxMarks: 50 },
  ],
  principalName: null,
  instructions: ["Bring this admit card to every paper.", "Phones are not allowed in the exam room."],
};
const FACTS = { studentName: "Asha Verma", admissionNumber: "ADM-1", gender: "Female", dateOfBirth: "2018-05-14", fatherName: "Ravi Verma", motherName: "Neha Verma", admissionDate: "2024-04-01", classLabel: "Class 5 - A", leftOn: null, leavingReason: null, goingTo: null };
const CERT: Certificate = { id: "k1", type: "bonafide", number: "BON/2026-2027/0001", studentId: "s1", issuedOn: "2026-11-19", purpose: "opening a bank account", conduct: null, facts: FACTS, issuedBy: "Anita", status: "valid", cancelReason: null, cancelledBy: null };
const sheet = (c: Partial<CertificateSheet> = {}): CertificateSheet => ({ ...CERT, school: SCHOOL, year: "2026-2027", principalName: "Dr. R. Sharma", ...c });
const OPTIONS: DocumentOptions = {
  classes: [{ id: "c5", name: "Class 5", sections: [{ id: "a", name: "A" }] }],
  exams: [{ id: "e1", name: "Half-Yearly Exam", kind: "half_yearly", startDate: "2026-09-10", endDate: "2026-09-20" }],
};
const SETTINGS: DocumentSettings = { passPercent: 33, gradeBands: BANDS, showRank: true, principalName: null, isDefault: true };
const ID: IdCard = {
  school: SCHOOL,
  year: { name: "2026-2027", endDate: "2027-03-31" },
  student: { id: "s1", name: "Asha Verma", admissionNumber: "ADM-1", rollNumber: 12, classLabel: "Class 5 - A", dateOfBirth: "2018-05-14", gender: "Female", bloodGroup: null, address: null, photo: null },
  guardian: null,
};
const refuse = (status: number, message: string, details: object[] = []) => () => new Response(JSON.stringify({ success: false, message, details }), { status, headers: { "Content-Type": "application/json" } });
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
const reset = () => {
  cleanup();
  for (const api of allApiSlices) store.dispatch(api.util.resetApiState());
};

function openPage(at: string, extra: Record<string, Handler> = {}, who: { role?: UserRole; permissions?: string[] } = {}) {
  signInAs(who.role ?? "school_admin", who.permissions);
  const calls = fakeApi({
    "GET /documents/options": () => OPTIONS,
    "GET /documents/settings": () => SETTINGS,
    "GET /documents/certificates": () => ({ items: [CERT, { ...CERT, id: "k2", type: "transfer", number: "TC/2026-2027/0001", purpose: null, status: "cancelled", cancelReason: "Wrong class" }], limit: 100 }),
    "GET /documents/certificates/k1": () => sheet(),
    "GET /documents/classes/c5/admit-cards": () => ({ items: [ADMIT] }),
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

describe("the pieces", () => {
  it("the report card says the rank, the teacher's remark, the pass mark, the school's own grades and the principal's name", () => {
    render(<ReportCardView card={REPORT} />);
    const card = screen.getByRole("article", { name: "Report card of Asha Verma" });
    expect(within(card).getByText("2 of 38")).toBeInTheDocument();
    expect(within(card).getByText("Works hard. Needs to write neatly.")).toBeInTheDocument();
    expect(within(card).getByText("Pass mark 40%. Grades: Excellent 80+, Good 50+, Needs work below 50.")).toBeInTheDocument();
    expect(within(card).getByText("Principal: Dr. R. Sharma")).toBeInTheDocument();
    const without = render(<ReportCardView card={{ ...REPORT, rank: null, remark: null, principalName: null }} />);
    expect(within(without.container).queryByText(/Rank in class/)).not.toBeInTheDocument();
    expect(within(without.container).queryByText(/remark/)).not.toBeInTheDocument();
  });

  it("the admit card lists the papers with day and time in am/pm, what to bring, and says when no timetable is made", () => {
    const { rerender } = render(<AdmitCardView card={ADMIT} />);
    const card = screen.getByRole("article", { name: "Admit card of Asha Verma" });
    expect(within(card).getByText(/ADMIT CARD · Half-Yearly Exam · 2026-2027/)).toBeInTheDocument();
    const english = within(card).getByRole("row", { name: /English/ });
    expect(within(english).getByText("Wednesday")).toBeInTheDocument();
    expect(within(english).getByText("11:00 am to 12:30 pm")).toBeInTheDocument();
    expect(within(card).getByText("Phones are not allowed in the exam room.")).toBeInTheDocument();
    rerender(<AdmitCardView card={{ ...ADMIT, papers: [] }} />);
    expect(screen.getByText("The timetable of this class is not made yet.")).toBeInTheDocument();
  });

  it("a bonafide says who the student is, the parents, the class, and what it is for; a character certificate says the conduct, good when none is given", () => {
    const { rerender } = render(<CertificateView certificate={sheet()} />);
    const text = () => screen.getByRole("article").textContent ?? "";
    expect(text()).toContain("BONAFIDE CERTIFICATE");
    expect(text()).toContain("Asha Verma, daughter of Mr. Ravi Verma and Mrs. Neha Verma");
    expect(text()).toContain("bonafide student of this school");
    expect(text()).toContain("opening a bank account");
    expect(screen.getByText("BON/2026-2027/0001", { exact: false })).toBeInTheDocument();
    rerender(<CertificateView certificate={sheet({ type: "character", number: "CHR/2026-2027/0001", conduct: null, facts: { ...FACTS, gender: "Male", studentName: "Kabir Rao" } })} />);
    expect(text()).toContain("Kabir Rao, son of");
    expect(text()).toContain("conduct and character have been good");
    rerender(<CertificateView certificate={sheet({ type: "character", conduct: "Excellent" })} />);
    expect(text()).toContain("have been Excellent");
  });

  it("a transfer certificate is a table of what the school kept: the class last studied, the day and reason for leaving, where to; a cancelled one says so", () => {
    render(<CertificateView certificate={sheet({ type: "transfer", number: "TC/2026-2027/0001", purpose: "Fees are clear", status: "cancelled", cancelReason: "Wrong class", facts: { ...FACTS, leftOn: "2026-11-10", leavingReason: "Moved to Indore", goingTo: "DPS Indore" } })} />);
    expect(screen.getByText("TRANSFER CERTIFICATE")).toBeInTheDocument();
    const row = (label: string) => screen.getByRole("row", { name: new RegExp(label) });
    expect(within(row("Class last studied")).getByText("Class 5 - A")).toBeInTheDocument();
    expect(within(row("Date of leaving")).getByText("10 Nov 2026")).toBeInTheDocument();
    expect(within(row("Reason for leaving")).getByText("Moved to Indore")).toBeInTheDocument();
    expect(within(row("Going to")).getByText("DPS Indore")).toBeInTheDocument();
    expect(within(row("Remarks")).getByText("Fees are clear")).toBeInTheDocument();
    expect(screen.getByText("CANCELLED: Wrong class")).toBeInTheDocument();
  });

  it("the ID card has a QR code of the school and the admission number", () => {
    render(<IdCardView card={ID} />);
    expect(screen.getByRole("img", { name: "QR code of ADM-1" }).querySelector("svg")).not.toBeNull();
  });
});

describe("Documents: admit cards, certificates, grading", () => {
  it("admit cards: a class and an exam give one card each, printed one to a page", async () => {
    const { calls, user } = openPage("/documents?kind=admit-cards&classId=c5");
    const section = await screen.findByRole("region", { name: "Admit cards" });
    expect(within(section).getByRole("article", { name: "Admit card of Asha Verma" })).toBeInTheDocument();
    expect(calls.find((c) => c.path === "/documents/classes/c5/admit-cards")!.query).toBe("?examId=e1");
    await user.click(screen.getByRole("button", { name: "Print 1 admit card" }));
    await waitFor(() => expect(print).toHaveBeenCalledTimes(1));
    expect(document.querySelectorAll("body > .print-root .print-page")).toHaveLength(1);
  });

  it("certificates: the register, newest first, with the kind, the date and whether each stands; a kind can be chosen; one opens to print", async () => {
    const { calls, user } = openPage("/documents?kind=certificates");
    const table = await screen.findByRole("table", { name: "Certificates issued" });
    expect(within(within(table).getByRole("row", { name: /TC\/2026-2027\/0001/ })).getByText("Cancelled")).toBeInTheDocument();
    expect(within(table).getByText("Bonafide certificate")).toBeInTheDocument();
    expect(within(table).getByText("opening a bank account")).toBeInTheDocument();
    await user.click(screen.getByLabelText("Character"));
    await waitFor(() => expect(calls.some((c) => c.path === "/documents/certificates" && c.query === "?type=character")).toBe(true));
    await user.click(await screen.findByRole("button", { name: "BON/2026-2027/0001" }));
    const dialog = await screen.findByRole("dialog", { name: "Bonafide certificate" });
    expect(await within(dialog).findByRole("article", { name: /BONAFIDE CERTIFICATE BON/ })).toBeInTheDocument();
  });

  it("issues a certificate: finds the student, chooses the kind, says what it is for; it is numbered and shown to print", async () => {
    const { calls, user } = openPage("/documents?kind=certificates", {
      "GET /documents/students/search": () => ({ items: [{ id: "s1", name: "Asha Verma", admissionNumber: "ADM-1", classLabel: "Class 5 - A" }] }),
      "POST /documents/students/s1/certificates": () => CERT,
    });
    await user.click(await screen.findByRole("button", { name: "Issue a certificate" }));
    const dialog = await screen.findByRole("dialog", { name: "Issue a certificate" });
    expect(within(dialog).getByRole("button", { name: "Issue" })).toBeDisabled();
    await user.type(within(dialog).getByPlaceholderText("Search a student"), "asha");
    await user.click(await within(dialog).findByRole("button", { name: /Asha Verma/ }));
    await user.type(within(dialog).getByLabelText(/What it is needed for/), "opening a bank account");
    await user.click(within(dialog).getByRole("button", { name: "Issue" }));
    await waitFor(() => expect(posted(calls, "POST", "/documents/students/s1/certificates")).toHaveLength(1));
    expect(posted(calls, "POST", "/documents/students/s1/certificates")[0].body).toEqual({ type: "bonafide", purpose: "opening a bank account", conduct: "" });
    expect(await screen.findByRole("dialog", { name: "Bonafide certificate" })).toBeInTheDocument();
  });

  it("says why when the server refuses to issue", async () => {
    const { user } = openPage("/documents?kind=certificates", {
      "GET /documents/students/search": () => ({ items: [{ id: "s1", name: "Asha Verma", admissionNumber: "ADM-1", classLabel: "Class 5 - A" }] }),
      "POST /documents/students/s1/certificates": refuse(409, "This student has left the school. Only a transfer certificate can be issued."),
    });
    await user.click(await screen.findByRole("button", { name: "Issue a certificate" }));
    const dialog = await screen.findByRole("dialog", { name: "Issue a certificate" });
    await user.type(within(dialog).getByPlaceholderText("Search a student"), "asha");
    await user.click(await within(dialog).findByRole("button", { name: /Asha Verma/ }));
    await user.click(within(dialog).getByRole("button", { name: "Issue" }));
    expect(await within(dialog).findByText(/Only a transfer certificate can be issued/)).toBeInTheDocument();
  });

  it("cancels a certificate with a reason, and only one who manages them gets the buttons", async () => {
    const { calls, user } = openPage("/documents?kind=certificates", { "POST /documents/certificates/k1/cancel": () => ({ ...CERT, status: "cancelled" }) });
    await user.click(await screen.findByRole("button", { name: "Cancel BON/2026-2027/0001" }));
    const dialog = await screen.findByRole("dialog", { name: "Cancel BON/2026-2027/0001" });
    await user.click(within(dialog).getByRole("button", { name: "Cancel the certificate" }));
    expect(await within(dialog).findByText("Write why it is cancelled")).toBeInTheDocument();
    await user.type(within(dialog).getByLabelText(/Why is it cancelled/), "Wrong purpose");
    await user.click(within(dialog).getByRole("button", { name: "Cancel the certificate" }));
    await waitFor(() => expect(posted(calls, "POST", "/documents/certificates/k1/cancel")).toHaveLength(1));
    expect(posted(calls, "POST", "/documents/certificates/k1/cancel")[0].body).toEqual({ reason: "Wrong purpose" });
    reset();
    openPage("/documents?kind=certificates", {}, { role: "receptionist", permissions: ["documents.view"] });
    await screen.findByRole("table", { name: "Certificates issued" });
    expect(screen.queryByRole("button", { name: "Issue a certificate" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Cancel BON/ })).not.toBeInTheDocument();
  });

  it("says when nothing was issued yet", async () => {
    openPage("/documents?kind=certificates", { "GET /documents/certificates": () => ({ items: [], limit: 100 }) });
    expect(await screen.findByText("No certificate issued yet")).toBeInTheDocument();
  });

  it("grading: shows the usual scale, saves the school's own (pass mark, grades, principal's name, rank), and goes back to the usual", async () => {
    let saved: DocumentSettings = SETTINGS;
    const { calls, user } = openPage("/documents?kind=grading", {
      "GET /documents/settings": () => saved,
      "PUT /documents/settings": (body) => {
        const b = body as { passPercent: number; gradeBands: { min: number; grade: string }[]; showRank: boolean; principalName: string };
        saved = { ...b, principalName: b.principalName || null, isDefault: false };
        return saved;
      },
      "DELETE /documents/settings": () => (saved = SETTINGS),
    });
    expect(await screen.findByText(/The school has not set its own: the usual scale is in use/)).toBeInTheDocument();
    expect(screen.getByLabelText("Grade 1 name")).toHaveValue("A1");
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
    const pass = screen.getByLabelText(/^Pass mark/);
    await user.clear(pass);
    await user.type(pass, "40");
    await user.type(screen.getByLabelText(/Principal's name/), "Dr. R. Sharma");
    await user.click(screen.getByRole("button", { name: "Add a grade" }));
    await user.type(screen.getByLabelText("Grade 9 starts at (%)"), "10");
    await user.type(screen.getByLabelText("Grade 9 name"), "F");
    await user.click(screen.getByRole("switch"));
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(posted(calls, "PUT", "/documents/settings")).toHaveLength(1));
    const sent = posted(calls, "PUT", "/documents/settings")[0].body as { passPercent: number; gradeBands: unknown[]; showRank: boolean; principalName: string };
    expect(sent).toMatchObject({ passPercent: 40, showRank: false, principalName: "Dr. R. Sharma" });
    expect(sent.gradeBands).toHaveLength(9);
    expect(await screen.findByText(/This is the school's own scale/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Back to the usual grades" }));
    expect(await screen.findByText(/the usual scale is in use/)).toBeInTheDocument();
  });

  it("grading: a pass mark outside 1 to 100 or an empty grade is said before anything is sent; the server's word is shown too; without the right it is read only", async () => {
    const { calls, user } = openPage("/documents?kind=grading", { "PUT /documents/settings": refuse(400, "Invalid request data", [{ path: "gradeBands", message: "The lowest grade must start at 0, so every percentage has a grade" }]) });
    const pass = await screen.findByLabelText(/^Pass mark/);
    await user.clear(pass);
    await user.type(pass, "0");
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText("The pass mark is 1 to 100")).toBeInTheDocument();
    expect(posted(calls, "PUT", "/documents/settings")).toHaveLength(0);
    await user.clear(pass);
    await user.type(pass, "40");
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText("The lowest grade must start at 0, so every percentage has a grade")).toBeInTheDocument();
    reset();
    openPage("/documents?kind=grading", {}, { role: "receptionist", permissions: ["documents.view"] });
    expect(await screen.findByLabelText("Grade 1 name")).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Save" })).not.toBeInTheDocument();
  });
});

describe("one student's page: the remark, the admit card, the transfer certificate", () => {
  const STUDENT = { id: "s1", name: "Asha Verma", status: "active" } as unknown as StudentDetail;
  function openCard(student: StudentDetail, extra: Record<string, Handler> = {}, who: { role?: UserRole; permissions?: string[] } = {}) {
    signInAs(who.role ?? "school_admin", who.permissions);
    const calls = fakeApi({
      "GET /documents/students/s1/photo": () => ({ photo: null }),
      "GET /documents/options": () => OPTIONS,
      "GET /documents/students/s1/report-card": () => REPORT,
      "GET /documents/students/s1/admit-card": () => ADMIT,
      ...extra,
    });
    render(
      <Provider store={store}>
        <ToastProvider>
          <StudentDocumentsCard student={student} readOnlyYear={false} />
        </ToastProvider>
      </Provider>,
    );
    return { calls, user: userEvent.setup() };
  }

  it("the report card has the teacher's remark to write and save, for one who manages documents", async () => {
    const { calls, user } = openCard(STUDENT, { "PUT /documents/remarks": () => ({ remark: "Very good term." }) });
    await user.click(await screen.findByRole("button", { name: "Report card" }));
    const dialog = await screen.findByRole("dialog", { name: "Report card" });
    const box = await within(dialog).findByLabelText(/Class teacher's remark/);
    expect(box).toHaveValue("Works hard. Needs to write neatly.");
    expect(within(dialog).getByRole("button", { name: "Save remark" })).toBeDisabled();
    await user.clear(box);
    await user.type(box, "Very good term.");
    await user.click(within(dialog).getByRole("button", { name: "Save remark" }));
    await waitFor(() => expect(posted(calls, "PUT", "/documents/remarks")).toHaveLength(1));
    expect(posted(calls, "PUT", "/documents/remarks")[0].body).toEqual({ studentId: "s1", examId: "e1", remark: "Very good term." });
  });

  it("one who may only print has no remark box; the admit card opens", async () => {
    const { user } = openCard(STUDENT, {}, { role: "receptionist", permissions: ["documents.view"] });
    await user.click(await screen.findByRole("button", { name: "Report card" }));
    const report = await screen.findByRole("dialog", { name: "Report card" });
    expect(await within(report).findByRole("article", { name: "Report card of Asha Verma" })).toBeInTheDocument();
    expect(within(report).queryByLabelText(/Class teacher's remark/)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Certificate" })).not.toBeInTheDocument();
    await user.click(within(report).getByRole("button", { name: "Done" }));
    await user.click(screen.getByRole("button", { name: "Admit card" }));
    const admit = await screen.findByRole("dialog", { name: "Admit card" });
    expect(await within(admit).findByRole("article", { name: "Admit card of Asha Verma" })).toBeInTheDocument();
  });

  it("a student who is here gets a bonafide or character certificate from their page", async () => {
    const { calls, user } = openCard(STUDENT, { "POST /documents/students/s1/certificates": () => CERT, "GET /documents/certificates/k1": () => sheet() });
    await user.click(await screen.findByRole("button", { name: "Certificate" }));
    const dialog = await screen.findByRole("dialog", { name: "Issue a certificate" });
    expect(within(dialog).getByText("Asha Verma")).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Issue" }));
    await waitFor(() => expect(posted(calls, "POST", "/documents/students/s1/certificates")).toHaveLength(1));
    expect(posted(calls, "POST", "/documents/students/s1/certificates")[0].body).toMatchObject({ type: "bonafide" });
    expect(await screen.findByRole("dialog", { name: "Bonafide certificate" })).toBeInTheDocument();
  });

  it("a student who has left has only the transfer certificate: no photo, no cards", async () => {
    const left = { id: "s1", name: "Asha Verma", status: "inactive" } as unknown as StudentDetail;
    const { calls, user } = openCard(left, { "POST /documents/students/s1/certificates": () => ({ ...CERT, type: "transfer", number: "TC/2026-2027/0001" }), "GET /documents/certificates/k1": () => sheet({ type: "transfer", number: "TC/2026-2027/0001" }) });
    await user.click(await screen.findByRole("button", { name: "Transfer certificate" }));
    expect(screen.queryByRole("button", { name: "ID card" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add photo" })).not.toBeInTheDocument();
    const dialog = await screen.findByRole("dialog", { name: "Issue a certificate" });
    await user.click(within(dialog).getByRole("button", { name: "Issue" }));
    await waitFor(() => expect(posted(calls, "POST", "/documents/students/s1/certificates")).toHaveLength(1));
    expect(posted(calls, "POST", "/documents/students/s1/certificates")[0].body).toMatchObject({ type: "transfer" });
    // The student's photo was never asked for.
    expect(calls.some((c) => c.path === "/documents/students/s1/photo")).toBe(false);
  });
});
