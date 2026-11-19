import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { generateDay, DEFAULT_SETUP } from "../../../utils/timings";
import type { SchoolSteps } from "../../../types";
import { StepReview } from "../StepReview";

/** The last screen before the form is sent: two cards (the school and contact; the academics), each part with its own Edit. */

const USUAL = generateDay(DEFAULT_SETUP).slots;
const plan = (medium: string, over: object = {}) => ({
  medium,
  lowestClass: "Nursery",
  highestClass: "2",
  seniorStreams: [] as string[],
  classes: ["Nursery", "LKG", "UKG", "Class 1", "Class 2"].map((name, i) => ({ name, sections: 2, seats: 30, ...(i < 2 ? { room: `10${i + 1}` } : {}) })),
  week: { days: [1, 2, 3, 4, 5, 6], usual: USUAL, saturday: null },
  ...over,
});

const steps = (boards: SchoolSteps[1]["boards"]): SchoolSteps => ({
  1: {
    schoolName: "Ganesha Public School",
    schoolType: "Private",
    boards,
    lowestClass: "Nursery",
    highestClass: "2",
    approxStudents: 600,
    sessionStartMonth: 4,
    academicYear: { name: "2026-2027", startDate: "2026-04-01", endDate: "2027-03-31", status: null },
    udiseCode: "",
    establishedYear: null,
    logoUrl: "",
  },
  2: { addressLine1: "12 MG Road", addressLine2: "", city: "Bhopal", state: "Madhya Pradesh", pincode: "462001", division: "", district: "Bhopal", schoolPhone: "9876543210", schoolEmail: "office@ganesha.in", website: "" },
  3: { adminName: "Anuj", designation: "Principal", designationOther: "", mobile: "9876543211", alternateMobile: "" },
  4: { confirmed: false },
});

const cbse = (...plans: ReturnType<typeof plan>[]) => ({ board: "CBSE", stateBoard: "", otherBoard: "", affiliationNumber: "", mediums: plans.map((p) => p.medium), plans });

function show(boards: unknown[] = [cbse(plan("English"))], over: { confirmed?: boolean; resubmit?: boolean; error?: string | null; missingSteps?: number[] } = {}) {
  const mocks = { onConfirmedChange: vi.fn(), onEdit: vi.fn(), onBack: vi.fn(), onSubmit: vi.fn() };
  render(<StepReview steps={steps(boards as never)} confirmed={false} submitting={false} resubmit={false} error={null} missingSteps={[]} {...over} {...mocks} />);
  return { ...mocks, user: userEvent.setup() };
}

afterEach(() => cleanup());

describe("two cards to read", () => {
  it("are the school and contact, and the academics", () => {
    show();
    expect(screen.getByRole("region", { name: "School and contact" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Academics" })).toBeInTheDocument();
    expect(screen.getAllByRole("region")).toHaveLength(2);
  });

  it("the first holds the school, its address and contact, and who registers it", () => {
    show();
    const card = within(screen.getByRole("region", { name: "School and contact" }));
    for (const part of ["School", "Address and contact", "Registered by"]) expect(card.getByRole("heading", { name: part })).toBeInTheDocument();
    expect(card.getByText("Ganesha Public School")).toBeInTheDocument();
    expect(card.getByText("12 MG Road")).toBeInTheDocument();
    expect(card.getByText("+91 98765 43210")).toBeInTheDocument();
    expect(card.getByText("Principal")).toBeInTheDocument();
  });

  it("the second holds the year and the boards, and each medium's classes", () => {
    show();
    const card = within(screen.getByRole("region", { name: "Academics" }));
    expect(card.getByRole("heading", { name: "Academic year" })).toBeInTheDocument();
    expect(card.getByText("2026-2027")).toBeInTheDocument();
    expect(card.getByText("CBSE (English)")).toBeInTheDocument();
    expect(card.getByRole("heading", { name: "English Medium" })).toBeInTheDocument();
  });

  it("says a medium's classes, sections, seats, rooms, days and timing, so the school can check them", () => {
    show();
    const card = within(screen.getByRole("region", { name: "Academics" }));
    expect(card.getByText("Nursery to 2nd · 5 classes")).toBeInTheDocument();
    expect(card.getByText("10 sections · 300 seats in all")).toBeInTheDocument();
    expect(card.getByText("2 of 5 classes have a room")).toBeInTheDocument();
    expect(card.getByText("Mon to Sat")).toBeInTheDocument();
    expect(card.getByText(/^\d\d:\d\d to \d\d:\d\d$/)).toBeInTheDocument();
  });

  it("each medium of a school with two boards is its own part, named with its board", () => {
    show([cbse(plan("English")), { board: "State Board", stateBoard: "M.P. Board", otherBoard: "", affiliationNumber: "", mediums: ["Hindi"], plans: [plan("Hindi")] }]);
    const card = within(screen.getByRole("region", { name: "Academics" }));
    expect(card.getByRole("heading", { name: "CBSE · English Medium" })).toBeInTheDocument();
    expect(card.getByRole("heading", { name: "M.P. Board · Hindi Medium" })).toBeInTheDocument();
  });

  it("lists the streams of a medium that has some", () => {
    show([cbse(plan("English", { lowestClass: "11", highestClass: "12", seniorStreams: ["Science", "Arts"], classes: [] }))]);
    expect(within(screen.getByRole("region", { name: "Academics" })).getByText("Science, Arts")).toBeInTheDocument();
  });

  it("says Not provided, in grey, for what was left empty", () => {
    show();
    expect(within(screen.getByRole("region", { name: "School and contact" })).getAllByText("Not provided").length).toBeGreaterThan(0);
  });

  it("a school with no medium yet says so under Classes and timing and sends the person to Class Sections", async () => {
    const { user, onEdit } = show([]);
    await user.click(screen.getByRole("button", { name: "Edit Classes and timing" }));
    expect(onEdit).toHaveBeenCalledWith(3);
  });
});

describe("the Edit buttons", () => {
  it("open the screen of their part: School Details, Academic Year, Class Sections, Your Profile", async () => {
    const { user, onEdit } = show();
    await user.click(screen.getByRole("button", { name: "Edit School" }));
    await user.click(screen.getByRole("button", { name: "Edit Address and contact" }));
    await user.click(screen.getByRole("button", { name: "Edit Academic year" }));
    await user.click(screen.getByRole("button", { name: "Edit English Medium" }));
    await user.click(screen.getByRole("button", { name: "Edit Registered by" }));
    expect(onEdit.mock.calls.map((c) => c[0])).toEqual([1, 1, 2, 3, 4]);
  });
});

describe("sending it", () => {
  it("needs the confirmation first", async () => {
    const { user, onConfirmedChange, onSubmit } = show();
    expect(screen.getByRole("button", { name: "Submit for approval" })).toBeDisabled();
    await user.click(screen.getByRole("checkbox"));
    expect(onConfirmedChange).toHaveBeenCalledWith(true);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("sends when it is confirmed, and says Resubmit after a school was sent back", async () => {
    const { user, onSubmit } = show([cbse(plan("English"))], { confirmed: true, resubmit: true });
    await user.click(screen.getByRole("button", { name: "Resubmit for approval" }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it("Previous goes back, and what the server refused is shown", async () => {
    const { user, onBack } = show([cbse(plan("English"))], { error: "Something is wrong." });
    expect(screen.getByRole("alert")).toHaveTextContent("Something is wrong.");
    await user.click(screen.getByRole("button", { name: "Previous" }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it("names the screens that are not finished, each a button that opens it", async () => {
    const { user, onEdit } = show([cbse(plan("English"))], { missingSteps: [1, 3] });
    const note = screen.getByText(/Some steps are not finished/);
    await user.click(within(note).getByRole("button", { name: "School Details" }));
    await user.click(within(note).getByRole("button", { name: "Your Profile" }));
    expect(onEdit.mock.calls.map((c) => c[0])).toEqual([1, 4]);
  });
});
