import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Provider } from "react-redux";
import { allApiSlices } from "../../../redux/api/apiRoot";
import store from "../../../redux/store";
import { generateDay, DEFAULT_SETUP } from "../../../utils/timings";
import { plannedClassNames } from "../../../utils/mediumPlans";
import type { MediumPlan, SchoolSteps } from "../../../types";
import { StageProvider, useSlotRef } from "../stage";
import { StepClasses } from "../steps";

/**
 * Screen 3 of the sign-up form, Class Sections: a bar with the academic year, the class range, how many classes are chosen and Quick Fill;
 * a pastel card for each class (sections, seats, room); and a card that says all is set.
 */

const USUAL = generateDay(DEFAULT_SETUP).slots;

const savedPlan = (medium = "English", lowest = "Nursery", highest = "2"): MediumPlan => ({
  medium,
  lowestClass: lowest,
  highestClass: highest,
  seniorStreams: [],
  classes: plannedClassNames(lowest, highest, []).map((name) => ({ name, sections: 1, seats: 40 })),
  week: { days: [1, 2, 3, 4, 5], usual: USUAL, saturday: null },
});

const initial = (plans: MediumPlan[] = [savedPlan()], over: Partial<SchoolSteps[1]> = {}): SchoolSteps[1] => ({
  schoolName: "Ganesha Public School",
  schoolType: "Private",
  boards: [{ board: "CBSE", stateBoard: "", otherBoard: "", affiliationNumber: "", mediums: plans.map((p) => p.medium), plans }],
  lowestClass: null,
  highestClass: null,
  approxStudents: 300,
  sessionStartMonth: 4,
  academicYear: { name: "2026-2027", startDate: "2026-04-01", endDate: "2027-03-31", status: null },
  udiseCode: "",
  establishedYear: null,
  logoUrl: "",
  ...over,
});

function show(values: SchoolSteps[1], onSubmit: Mock = vi.fn(async () => null)) {
  const onFixAcademic = vi.fn();
  const onEditYear = vi.fn();
  render(
    <Provider store={store}>
      <StepClasses initial={values} onSubmit={onSubmit} onBack={vi.fn()} saving={false} onFixAcademic={onFixAcademic} onEditYear={onEditYear} />
    </Provider>
  );
  return { onSubmit, onFixAcademic, onEditYear, user: userEvent.setup() };
}
const save = (user: ReturnType<typeof userEvent.setup>) => user.click(screen.getByRole("button", { name: /save & continue/i }));
const sent = (onSubmit: Mock) => (onSubmit.mock.calls[0] as unknown[])[0] as { boards: { plans: MediumPlan[] }[] };

beforeEach(() => {
  for (const api of allApiSlices) store.dispatch(api.util.resetApiState());
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("the bar above the cards", () => {
  it("shows the academic year, which goes back to the Academic Year screen when pressed", async () => {
    const { user, onEditYear } = show(initial());
    await user.click(screen.getByRole("button", { name: /2026-2027/ }));
    expect(onEditYear).toHaveBeenCalledTimes(1);
  });

  it("says how many classes are chosen and which, with the numbered ones as a run", () => {
    show(initial([savedPlan("English", "Nursery", "10")]));
    expect(screen.getByText("13 Classes Selected")).toBeInTheDocument();
    expect(screen.getByText("Nursery, LKG, UKG, Class 1 to 10")).toBeInTheDocument();
  });

  it("says the range in one box, 'Nursery to 10th'", () => {
    show(initial([savedPlan("English", "Nursery", "10")]));
    expect(screen.getByRole("button", { name: "Class range" })).toHaveTextContent("Nursery to 10th");
  });
});

describe("a medium with no classes yet", () => {
  const empty = () => ({ ...savedPlan(), lowestClass: "", highestClass: "", classes: [] }) as unknown as MediumPlan;

  it("offers the usual ranges, and one click makes a card for every class", async () => {
    const { user } = show(initial([empty()]));
    expect(screen.queryByLabelText("Nursery: sections")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Nursery to 10th" }));
    expect(screen.getByLabelText("Nursery: sections")).toHaveValue(1);
    expect(screen.getByLabelText("Class 10: seats")).toHaveValue(40);
    expect(screen.getByText("13 Classes Selected")).toBeInTheDocument();
    expect(screen.getByText("All Set!")).toBeInTheDocument();
  });
});

describe("the cards", () => {
  it("each class has its sections, its seats and its room", () => {
    show(initial());
    for (const name of ["Nursery", "LKG", "UKG", "Class 1", "Class 2"]) {
      expect(screen.getByLabelText(`${name}: sections`)).toBeInTheDocument();
      expect(screen.getByLabelText(`${name}: seats`)).toBeInTheDocument();
      expect(screen.getByLabelText(`${name}: room`)).toBeInTheDocument();
    }
  });

  it("a room is typed, and sent with its class only when it was typed", async () => {
    const { user, onSubmit } = show(initial());
    await user.type(screen.getByLabelText("Class 1: room"), "104");
    await save(user);
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    const classes = sent(onSubmit).boards[0].plans[0].classes;
    expect(classes.find((c) => c.name === "Class 1")).toEqual({ name: "Class 1", sections: 1, seats: 40, room: "104" });
    expect(classes.find((c) => c.name === "Class 2")).toEqual({ name: "Class 2", sections: 1, seats: 40 });
  });

  it("a class with no sections has no room to give: its box is off and empty", async () => {
    const { user } = show(initial());
    await user.type(screen.getByLabelText("Class 1: room"), "104");
    fireEvent.change(screen.getByLabelText("Class 1: sections"), { target: { value: "0" } });
    expect(screen.getByLabelText("Class 1: room")).toBeDisabled();
    expect(screen.getByLabelText("Class 1: room")).toHaveValue("");
    // The seats are then the whole class's, and the card says so.
    expect(within(screen.getByLabelText("Class 1: seats").closest("li")!).getByText("Seats")).toBeInTheDocument();
  });

  it("says all is set, with the classes and the whole plan", () => {
    show(initial([savedPlan("English", "Nursery", "2")]));
    expect(screen.getByText("All Set!")).toBeInTheDocument();
    expect(screen.getByText(/You have configured sections for 5 classes from Nursery to 2nd\./)).toBeInTheDocument();
    expect(screen.getByText("5 classes · 5 sections · 200 seats in all")).toBeInTheDocument();
  });
});

describe("Quick Fill", () => {
  const open = async (user: ReturnType<typeof userEvent.setup>) => {
    await user.click(screen.getByRole("button", { name: "Quick Fill for English Medium" }));
    return screen.getByRole("dialog", { name: "Quick Fill for English Medium" });
  };

  it("is closed until pressed, and says what it does", async () => {
    const { user } = show(initial());
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByText("Apply same settings to all")).toBeInTheDocument();
    await open(user);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("sets the sections and the seats of every class and counts the rooms up from the first", async () => {
    const { user } = show(initial());
    const box = await open(user);
    await user.clear(within(box).getByLabelText(/^Sections/));
    await user.type(within(box).getByLabelText(/^Sections/), "2");
    await user.clear(within(box).getByLabelText(/Seats in each section/));
    await user.type(within(box).getByLabelText(/Seats in each section/), "35");
    await user.type(within(box).getByLabelText(/First room number/), "101");
    await user.click(within(box).getByRole("button", { name: "Apply to all classes" }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    for (const [i, name] of ["Nursery", "LKG", "UKG", "Class 1", "Class 2"].entries()) {
      expect(screen.getByLabelText(`${name}: sections`)).toHaveValue(2);
      expect(screen.getByLabelText(`${name}: seats`)).toHaveValue(35);
      expect(screen.getByLabelText(`${name}: room`)).toHaveValue(String(101 + i));
    }
  });

  it("leaves the rooms alone when no first room is given", async () => {
    const { user } = show(initial());
    await user.type(screen.getByLabelText("Class 1: room"), "9");
    const box = await open(user);
    await user.click(within(box).getByRole("button", { name: "Apply to all classes" }));
    expect(screen.getByLabelText("Class 1: room")).toHaveValue("9");
  });

  it("refuses seats that are not right, and a room that cannot be counted up, changing nothing", async () => {
    const { user } = show(initial());
    const box = await open(user);
    await user.clear(within(box).getByLabelText(/Seats in each section/));
    await user.type(within(box).getByLabelText(/Seats in each section/), "0");
    await user.type(within(box).getByLabelText(/First room number/), "Library");
    await user.click(within(box).getByRole("button", { name: "Apply to all classes" }));
    expect(within(box).getByText("Enter 1 to 200.")).toBeInTheDocument();
    expect(within(box).getByText("End it with a number, for example 101.")).toBeInTheDocument();
    expect(screen.getByLabelText("Class 1: seats")).toHaveValue(40);
  });

  it("closes with Escape", async () => {
    const { user } = show(initial());
    await open(user);
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});

describe("two mediums on the screen", () => {
  it("each is named, with its own bar, cards and Quick Fill", () => {
    show(initial([savedPlan("English", "1", "2"), savedPlan("Hindi", "Nursery", "UKG")]));
    expect(screen.getByRole("heading", { name: "English Medium" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Hindi Medium" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Quick Fill for English Medium" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Quick Fill for Hindi Medium" })).toBeInTheDocument();
    expect(screen.getAllByText("Apply same settings to all")).toHaveLength(2);
  });

  it("has no 'Copy from' drop-down: each medium is filled in on its own", () => {
    show(initial([savedPlan("English", "1", "2"), savedPlan("Hindi", "Nursery", "UKG")]));
    expect(screen.queryByText("Copy from...")).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/copy from/i)).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "English Medium" })).toBeInTheDocument();
  });

  it("a medium alone has no heading of its own (the page heading says it)", () => {
    show(initial());
    expect(screen.queryByRole("heading", { name: "English Medium" })).not.toBeInTheDocument();
  });
});

describe("a problem in the year or a board is not shown here", () => {
  it("opens the Academic Year screen with the messages, and sends nothing", async () => {
    const { user, onSubmit, onFixAcademic } = show(initial([savedPlan()], { academicYear: { name: "", startDate: "", endDate: "", status: null } }));
    await save(user);
    expect(onSubmit).not.toHaveBeenCalled();
    expect(onFixAcademic).toHaveBeenCalledTimes(1);
    expect(Object.keys(onFixAcademic.mock.calls[0][0] as object).some((path) => path.startsWith("academicYear"))).toBe(true);
  });

  it("does the same when the server says the year is wrong, and keeps a message about a class here", async () => {
    const onSubmit = vi.fn(async () => ({ "academicYear.endDate": "The year must end after it starts" }));
    const { user, onFixAcademic } = show(initial(), onSubmit);
    await save(user);
    await waitFor(() => expect(onFixAcademic).toHaveBeenCalledWith({ "academicYear.endDate": "The year must end after it starts" }));

    const here = vi.fn(async () => ({ "boards.0.plans.0.classes.1.seats": "Up to 200 seats in a section" }));
    cleanup();
    const second = show(initial(), here);
    await save(second.user);
    expect(await screen.findByText("Up to 200 seats in a section")).toBeInTheDocument();
    expect(second.onFixAcademic).not.toHaveBeenCalled();
  });
});

describe("the class range box", () => {
  const open = async (user: ReturnType<typeof userEvent.setup>) => {
    await user.click(screen.getByRole("button", { name: "Class range" }));
    return screen.getByRole("dialog", { name: "Class range" });
  };

  it("opens a small window with the first class and the last class as chips, the ones that are chosen lit", async () => {
    const { user } = show(initial([savedPlan("English", "1", "2")]));
    const box = await open(user);
    expect(within(within(box).getByRole("radiogroup", { name: "Classes from" })).getByRole("radio", { name: "Class 1" })).toHaveAttribute("aria-checked", "true");
    expect(within(within(box).getByRole("radiogroup", { name: "Classes up to" })).getByRole("radio", { name: "Class 2" })).toHaveAttribute("aria-checked", "true");
  });

  it("changing the last class makes the cards, and the window stays open so the first class can be changed too", async () => {
    const { user } = show(initial([savedPlan("English", "1", "2")]));
    const box = await open(user);
    await user.click(within(within(box).getByRole("radiogroup", { name: "Classes up to" })).getByRole("radio", { name: "Class 4" }));
    expect(screen.getByLabelText("Class 4: sections")).toBeInTheDocument();
    expect(screen.getByText("4 Classes Selected")).toBeInTheDocument();
    await user.click(within(within(box).getByRole("radiogroup", { name: "Classes from" })).getByRole("radio", { name: "Class 2" }));
    expect(screen.queryByLabelText("Class 1: sections")).not.toBeInTheDocument();
    expect(screen.getByText("3 Classes Selected")).toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "Class range" })).toBeInTheDocument();
  });

  it("keeps what was typed for a class that is still in the range", async () => {
    const { user } = show(initial([savedPlan("English", "1", "2")]));
    fireEvent.change(screen.getByLabelText("Class 2: seats"), { target: { value: "55" } });
    const box = await open(user);
    await user.click(within(within(box).getByRole("radiogroup", { name: "Classes up to" })).getByRole("radio", { name: "Class 3" }));
    expect(screen.getByLabelText("Class 2: seats")).toHaveValue(55);
  });

  it("greys out a first class after the last, and a last class before the first, so the range never runs backwards", async () => {
    const { user } = show(initial([savedPlan("English", "3", "5")]));
    const box = await open(user);
    const from = within(box).getByRole("radiogroup", { name: "Classes from" });
    const upTo = within(box).getByRole("radiogroup", { name: "Classes up to" });
    expect(within(from).getByRole("radio", { name: "Class 6" })).toBeDisabled();
    expect(within(from).getByRole("radio", { name: "Class 5" })).toBeEnabled();
    expect(within(upTo).getByRole("radio", { name: "Class 2" })).toBeDisabled();
    expect(within(upTo).getByRole("radio", { name: "Class 3" })).toBeEnabled();
  });

  it("closes with Done and with Escape", async () => {
    const { user } = show(initial());
    await open(user);
    await user.click(screen.getByRole("button", { name: "Done" }));
    expect(screen.queryByRole("dialog", { name: "Class range" })).not.toBeInTheDocument();
    await open(user);
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog", { name: "Class range" })).not.toBeInTheDocument();
  });

  it("a medium with no range yet says so in the box", () => {
    const empty = { ...savedPlan(), lowestClass: "", highestClass: "", classes: [] } as unknown as MediumPlan;
    show(initial([empty]));
    expect(screen.getByRole("button", { name: "Class range" })).toHaveTextContent("Choose the range");
  });
});

/** The two places the frame draws for a screen: under the heading card, and at the top right. */
function Frame({ children }: { children: React.ReactNode }) {
  const below = useSlotRef("below");
  const side = useSlotRef("side");
  return (
    <>
      <div data-testid="below" ref={below} />
      <div data-testid="side" ref={side} />
      <div data-testid="page">{children}</div>
    </>
  );
}

function showInFrame(values: SchoolSteps[1]) {
  render(
    <Provider store={store}>
      <StageProvider>
        <Frame>
          <StepClasses initial={values} onSubmit={vi.fn()} onBack={vi.fn()} saving={false} onFixAcademic={vi.fn()} onEditYear={vi.fn()} />
        </Frame>
      </StageProvider>
    </Provider>
  );
  return userEvent.setup();
}

describe("in the frame, a medium alone puts its bar and Quick Fill beside the heading card", () => {
  it("the year, the range and the count go under the card, and Quick Fill at the right; the cards stay on the page", async () => {
    showInFrame(initial([savedPlan("English", "Nursery", "10")]));
    const below = screen.getByTestId("below");
    const side = screen.getByTestId("side");
    const page = screen.getByTestId("page");
    expect(await within(below).findByRole("button", { name: "Class range" })).toHaveTextContent("Nursery to 10th");
    expect(within(below).getByRole("button", { name: /2026-2027/ })).toBeInTheDocument();
    expect(within(below).getByText("13 Classes Selected")).toBeInTheDocument();
    expect(within(side).getByRole("button", { name: "Quick Fill for English Medium" })).toBeInTheDocument();
    // Not drawn a second time on the page, which keeps the cards.
    expect(within(page).queryByRole("button", { name: "Class range" })).toBeNull();
    expect(within(page).queryByRole("button", { name: /Quick Fill/ })).toBeNull();
    expect(within(page).getByLabelText("Class 1: sections")).toBeInTheDocument();
  });

  it("Quick Fill in its place at the right still works", async () => {
    const user = showInFrame(initial());
    const side = screen.getByTestId("side");
    await user.click(await within(side).findByRole("button", { name: "Quick Fill for English Medium" }));
    const box = within(side).getByRole("dialog", { name: "Quick Fill for English Medium" });
    await user.clear(within(box).getByLabelText(/Seats in each section/));
    await user.type(within(box).getByLabelText(/Seats in each section/), "30");
    await user.click(within(box).getByRole("button", { name: "Apply to all classes" }));
    expect(screen.getByLabelText("Class 1: seats")).toHaveValue(30);
  });

  it("with two mediums each keeps its own bar and Quick Fill on the page, so none is mixed up", async () => {
    showInFrame(initial([savedPlan("English", "1", "2"), savedPlan("Hindi", "Nursery", "UKG")]));
    expect(within(screen.getByTestId("below")).queryByRole("button", { name: "Class range" })).toBeNull();
    expect(within(screen.getByTestId("side")).queryByRole("button", { name: /Quick Fill/ })).toBeNull();
    expect(within(screen.getByTestId("page")).getAllByRole("button", { name: "Class range" })).toHaveLength(2);
    expect(within(screen.getByTestId("page")).getAllByRole("button", { name: /Quick Fill/ })).toHaveLength(2);
  });
});

describe("ticking a stream does not make the screen jump", () => {
  const senior = () => show(initial([savedPlan("English", "9", "12")]));

  it("the streams are above the cards, so the chips stay where the finger is while cards come in under them", () => {
    senior();
    const science = screen.getByRole("button", { name: "Science" });
    const grid = screen.getByRole("list", { name: "English Medium: classes" });
    expect(science.compareDocumentPosition(grid) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // The school days and the timing stay below the cards (nobody is pressing them while cards come in).
    expect(grid.compareDocumentPosition(screen.getByText("School days")) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("a stream adds its cards and leaves the others exactly as they were: the same elements, with what was typed", async () => {
    const { user } = senior();
    fireEvent.change(screen.getByLabelText("Class 10: seats"), { target: { value: "55" } });
    const before = screen.getByLabelText("Class 10: seats").closest("li");
    await user.click(screen.getByRole("button", { name: "Commerce" }));
    await user.click(screen.getByRole("button", { name: "Arts" }));
    await user.click(screen.getByRole("button", { name: "Maths" }));
    expect(screen.getByLabelText("Class 10: seats").closest("li")).toBe(before);
    expect(screen.getByLabelText("Class 10: seats")).toHaveValue(55);
    for (const name of ["Class 11 Commerce", "Class 11 Arts", "Class 11 Maths", "Class 12 Commerce", "Class 12 Arts", "Class 12 Maths"]) {
      expect(screen.getByLabelText(`${name}: sections`)).toBeInTheDocument();
    }
  });

  it("cards only fade in: no slide, no delay that depends on where the card is, so no card moves when the list changes", async () => {
    const { user } = senior();
    const first = screen.getByLabelText("Class 9: seats").closest("li") as HTMLElement;
    await user.click(screen.getByRole("button", { name: "Commerce" }));
    for (const card of screen.getByRole("list", { name: "English Medium: classes" }).querySelectorAll(":scope > li")) {
      expect(card.className).toContain("fade-in");
      expect(card.className).not.toContain("rise-in");
      expect((card as HTMLElement).style.animationDelay).toBe("");
    }
    expect(first.style.animationDelay).toBe("");
  });

  it("a card keeps what was typed in it when a stream takes its neighbour away", async () => {
    const { user } = senior();
    await user.click(screen.getByRole("button", { name: "Arts" }));
    fireEvent.change(screen.getByLabelText("Class 12 Arts: room"), { target: { value: "210" } });
    await user.click(screen.getByRole("button", { name: "Commerce" }));
    expect(screen.getByLabelText("Class 12 Arts: room")).toHaveValue("210");
    await user.click(screen.getByRole("button", { name: "Commerce" }));
    expect(screen.getByLabelText("Class 12 Arts: room")).toHaveValue("210");
  });
});
