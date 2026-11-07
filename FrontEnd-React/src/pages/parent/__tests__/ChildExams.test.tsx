import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { Provider } from "react-redux";
import { allApiSlices } from "../../../redux/api/apiRoot";
import store from "../../../redux/store";
import { fakeApi, type Handler } from "../../../test/fakeApi";
import type { ChildExam, ChildExams, ChildPaper } from "../../../types";
import { ChildExamsSection } from "../../../components/parent/ChildExams";

/** A child's exams for their parent (2026-11-06): the exams of the child's class, the papers, the child's own marks, the total. */

const MATHS = { id: "maths", name: "Mathematics" };
const ENGLISH = { id: "english", name: "English" };

const paper = (id: string, over: Partial<ChildPaper> = {}): ChildPaper => ({
  id,
  subject: MATHS,
  date: "2026-09-15",
  startTime: "09:00",
  endTime: "10:00",
  durationMinutes: 60,
  topic: "Fractions",
  maxMarks: 50,
  result: null,
  ...over,
});

const exam = (over: Partial<ChildExam> = {}): ChildExam => ({
  id: "e1",
  name: "Half-Yearly Exam",
  type: "half_yearly",
  typeLabel: "Half-yearly exam",
  full: true,
  startDate: "2026-09-14",
  endDate: "2026-09-30",
  schoolHours: { start: "08:00", end: "12:30" },
  note: null,
  status: "running",
  paperCount: 3,
  classCount: 1,
  papers: [
    paper("p1", { result: { marks: 45, absent: false, percent: 90 } }),
    paper("p2", { subject: ENGLISH, date: "2026-09-16", startTime: "11:00", endTime: "12:30", durationMinutes: 90, topic: null, maxMarks: 100, result: { marks: null, absent: true, percent: null } }),
    paper("p3", { subject: ENGLISH, date: "2027-03-18", maxMarks: null, topic: "Grammar" }),
  ],
  summary: { marks: 45, outOf: 50, percent: 90, papers: 1 },
  ...over,
});

const EXAMS = (items: ChildExam[] = [exam()]): ChildExams => ({ items, week: { from: "2026-09-14", to: "2026-09-20", days: [] } });

function show(extra: Record<string, Handler> = {}) {
  const calls = fakeApi({ "GET /parent/children/k1/exams": () => EXAMS(), ...extra });
  render(
    <Provider store={store}>
      <ChildExamsSection childId="k1" />
    </Provider>
  );
  return calls;
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  for (const slice of allApiSlices) store.dispatch(slice.util.resetApiState());
});

describe("a child's exams", () => {
  it("each exam with its status, days and the school's hours (one read for the child)", async () => {
    const calls = show();
    const card = await screen.findByRole("article", { name: "Half-Yearly Exam" });
    expect(within(card).getByText("Running")).toBeInTheDocument();
    expect(card).toHaveTextContent("Half-yearly exam");
    expect(card).toHaveTextContent("14 Sep to 30 Sep");
    expect(card).toHaveTextContent("School 8:00 AM to 12:30 PM");
    expect(calls.filter((c) => c.path === "/parent/children/k1/exams")).toHaveLength(1);
  });

  it("the papers in date order: subject, topic, day, time, what each is out of", async () => {
    show();
    const card = await screen.findByRole("article", { name: "Half-Yearly Exam" });
    const rows = within(card).getAllByRole("listitem");
    expect(rows.map((r) => r.getAttribute("aria-label"))).toEqual(["Mathematics, Tue, 15 Sep", "English, Wed, 16 Sep", "English, Thu, 18 Mar"]);
    expect(rows[0]).toHaveTextContent("Fractions");
    expect(rows[0]).toHaveTextContent("9:00 AM to 10:00 AM");
    expect(rows[0]).toHaveTextContent("out of 50");
    expect(rows[1]).toHaveTextContent("11:00 AM to 12:30 PM");
  });

  it("the child's own marks and percentage, Absent said so, and the total of the papers with marks", async () => {
    show();
    const card = await screen.findByRole("article", { name: "Half-Yearly Exam" });
    const rows = within(card).getAllByRole("listitem");
    expect(rows[0]).toHaveTextContent("45 / 50 · 90%");
    expect(rows[1]).toHaveTextContent("Absent");
    expect(within(card).getByText("Total 45 / 50 · 90%")).toBeInTheDocument();
  });

  it("a paper that was held but has no marks yet says so; a paper to come says nothing about marks", async () => {
    show({ "GET /parent/children/k1/exams": () => EXAMS([exam({ papers: [paper("p1"), paper("p3", { date: "2027-03-18" })], summary: null })]) });
    const card = await screen.findByRole("article", { name: "Half-Yearly Exam" });
    const rows = within(card).getAllByRole("listitem");
    expect(rows[0]).toHaveTextContent("Marks not in yet");
    expect(rows[1]).not.toHaveTextContent(/Marks not in yet|\//);
    expect(within(card).queryByText(/^Total /)).not.toBeInTheDocument();
  });

  it("an exam with no paper for the child's class says its timetable is not made yet", async () => {
    show({ "GET /parent/children/k1/exams": () => EXAMS([exam({ papers: [], summary: null, status: "upcoming", paperCount: 0 })]) });
    const card = await screen.findByRole("article", { name: "Half-Yearly Exam" });
    expect(card).toHaveTextContent("Timetable not made yet");
  });

  it("no exam at all says so", async () => {
    show({ "GET /parent/children/k1/exams": () => EXAMS([]) });
    expect(await screen.findByText("No exam or test yet")).toBeInTheDocument();
  });

  it("a read that fails says it could not load, with the server's words", async () => {
    show({ "GET /parent/children/k1/exams": () => new Response(JSON.stringify({ success: false, message: "Student not found" }), { status: 404, headers: { "Content-Type": "application/json" } }) });
    expect(await screen.findByText("Student not found")).toBeInTheDocument();
  });

  it("the exams that are on come in the order the server gave (running first), each its own card", async () => {
    show({ "GET /parent/children/k1/exams": () => EXAMS([exam(), exam({ id: "e2", name: "Unit test 1", typeLabel: "Unit test", full: false, schoolHours: null, status: "over", papers: [], summary: null, startDate: "2026-05-04", endDate: "2026-05-04" })]) });
    const cards = await screen.findAllByRole("article");
    expect(cards.map((c) => c.getAttribute("aria-label"))).toEqual(["Half-Yearly Exam", "Unit test 1"]);
    expect(cards[1]).toHaveTextContent("4 May 2026");
  });
});
