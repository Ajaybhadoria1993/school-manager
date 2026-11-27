import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import { Provider } from "react-redux";
import { allApiSlices } from "../../../redux/api/apiRoot";
import store from "../../../redux/store";
import { fakeApi } from "../../../test/fakeApi";
import type { MyExamDuty } from "../../../types";
import { MyExamDuties } from "../MyExamDuties";

/**
 * A teacher's exam duty on their home (2026-11-27, the user: "teacher ko pata chal jaaye ki mujhe is room mein duty hai, aur exam se related time, date,
 * room sab information mil jaaye"): each room they watch, with the exam, who else is there, who sits in it, and each day's time and papers.
 */

const DUTY: MyExamDuty = {
  exam: { id: "e1", name: "Half-Yearly Exam", startDate: "2027-02-15", endDate: "2027-02-26" },
  room: "Room 101",
  with: ["Dev Patel"],
  seats: [
    { place: "Class 1", fromRoll: 1, toRoll: 10, students: 1 },
    { place: "Class 5 - A", fromRoll: 1, toRoll: 30, students: 28 },
  ],
  students: 29,
  days: [
    {
      date: "2027-02-15",
      startTime: "09:00",
      endTime: "12:00",
      papers: [
        { subject: "Mathematics", classes: ["Class 5"], startTime: "09:00", endTime: "12:00" },
        { subject: "English", classes: ["Class 1"], startTime: "10:00", endTime: "11:00" },
      ],
    },
    { date: "2027-02-17", startTime: "09:00", endTime: "11:00", papers: [{ subject: "English", classes: ["Class 5"], startTime: "09:00", endTime: "11:00" }] },
  ],
};

function show(items: MyExamDuty[]) {
  const calls = fakeApi({ "GET /exams/my-duties": () => ({ items }) });
  render(
    <Provider store={store}>
      <MyExamDuties />
    </Provider>
  );
  return { calls };
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  for (const slice of allApiSlices) store.dispatch(slice.util.resetApiState());
});

describe("a teacher on exam duty", () => {
  it("sees the room, the exam and its days, who else is there, who sits in it, and each day's time and papers", async () => {
    show([DUTY]);
    const card = await screen.findByRole("region", { name: "Exam duty in Room 101" });
    expect(card).toHaveTextContent("Room 101");
    expect(card).toHaveTextContent("Half-Yearly Exam");
    expect(card).toHaveTextContent("15 Feb to 26 Feb 2027");
    expect(card).toHaveTextContent("With Dev Patel");
    expect(card).toHaveTextContent("29 children");
    expect(card).toHaveTextContent("Class 1 · roll 1 to 10");
    expect(card).toHaveTextContent("Class 5 - A · roll 1 to 30");

    const days = within(card).getByRole("table", { name: "Days of Room 101" });
    const [first, second] = within(days).getAllByRole("row").slice(1);
    expect(first).toHaveTextContent("Mon, 15 Feb");
    expect(first).toHaveTextContent("9:00 AM to 12:00 PM");
    expect(first).toHaveTextContent("Mathematics · Class 5");
    expect(first).toHaveTextContent("English · Class 1 · 10:00 AM to 11:00 AM");
    expect(second).toHaveTextContent("Wed, 17 Feb");
    expect(second).toHaveTextContent("9:00 AM to 11:00 AM");
  });

  it("a room alone, and one whose classes have no paper yet, say so", async () => {
    show([{ ...DUTY, with: [], days: [] }]);
    const card = await screen.findByRole("region", { name: "Exam duty in Room 101" });
    expect(card).not.toHaveTextContent("With");
    expect(card).toHaveTextContent("No paper yet");
  });
});

describe("a teacher with no exam duty", () => {
  it("sees nothing of it", async () => {
    const { calls } = show([]);
    await waitFor(() => expect(calls.some((c) => c.path === "/exams/my-duties")).toBe(true));
    await waitFor(() => expect(screen.queryByRole("heading", { name: "Exam duty" })).toBeNull());
    expect(screen.queryByRole("region")).toBeNull();
  });
});
