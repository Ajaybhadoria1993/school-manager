import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { Provider } from "react-redux";
import { allApiSlices } from "../../../redux/api/apiRoot";
import store from "../../../redux/store";
import { fakeApi } from "../../../test/fakeApi";
import type { ChildAttendance as ChildAttendanceData } from "../../../types";
import { ChildAttendance } from "../../../components/parent/ChildAttendance";

/** The reason the teacher gave for an absence is the parent's to read too (2026-11-06). */

const tally = { present: 1, absent: 1, late: 1, leave: 0, days: 3, percent: 67 };
const DATA: ChildAttendanceData = {
  month: "2026-11",
  days: [
    { date: "2026-11-03", status: "present", reason: null },
    { date: "2026-11-04", status: "absent", reason: "Fever" },
    { date: "2026-11-05", status: "late", reason: "Bus was late" },
  ],
  monthTally: tally,
  year: tally,
};

function show(data: ChildAttendanceData = DATA) {
  fakeApi({ "GET /parent/children/s1/attendance": () => data });
  render(
    <Provider store={store}>
      <ChildAttendance childId="s1" />
    </Provider>
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  for (const slice of allApiSlices) store.dispatch(slice.util.resetApiState());
});

describe("a child's month, with the reasons", () => {
  it("a day with a reason shows it under the mark; a day without shows none", async () => {
    show();
    const days = await screen.findByRole("list");
    const items = within(days).getAllByRole("listitem");
    expect(items[0]).toHaveTextContent("Present");
    expect(items[0]).not.toHaveTextContent("Fever");
    expect(items[1]).toHaveTextContent("Absent");
    expect(items[1]).toHaveTextContent("Fever");
    expect(items[2]).toHaveTextContent("Late");
    expect(items[2]).toHaveTextContent("Bus was late");
  });

  it("an older answer with no reason field still shows the days", async () => {
    show({ ...DATA, days: [{ date: "2026-11-04", status: "absent" }] });
    const days = await screen.findByRole("list");
    expect(within(days).getByRole("listitem")).toHaveTextContent("Absent");
  });
});
