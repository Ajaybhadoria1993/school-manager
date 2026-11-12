import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Provider } from "react-redux";
import { allApiSlices } from "../../../redux/api/apiRoot";
import store from "../../../redux/store";
import { fakeApi } from "../../../test/fakeApi";
import { generateDay, DEFAULT_SETUP } from "../../../utils/timings";
import { plannedClassNames } from "../../../utils/mediumPlans";
import type { MediumPlan, SchoolSteps } from "../../../types";
import { StepAcademic, StepClasses, StepSchool } from "../steps";

/**
 * Screen 1 of the sign-up form is the school and where it is; screen 2 is the academic year and the boards; screen 3 is Class Sections: each
 * medium chosen on screen 2 has its own block there, for its classes, their room, and its timing.
 */

const USUAL = generateDay(DEFAULT_SETUP).slots;

const savedPlan = (medium: string, lowest = "1", highest = "2"): MediumPlan => ({
  medium,
  lowestClass: lowest,
  highestClass: highest,
  seniorStreams: [],
  classes: plannedClassNames(lowest, highest, []).map((name) => ({ name, sections: 2, seats: 30 })),
  week: { days: [1, 2, 3, 4, 5], usual: USUAL, saturday: null },
});

const initial = (over: Partial<SchoolSteps[1]> = {}): SchoolSteps[1] => ({
  schoolName: "Ganesha Public School",
  schoolType: "Private",
  boards: [],
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

const board = (plans: MediumPlan[]) => ({ board: "CBSE", stateBoard: "", otherBoard: "", affiliationNumber: "", mediums: plans.map((p) => p.medium), plans });

/** Screen 3: each medium's classes and timing (it saves the whole step 2). */
function show(values: SchoolSteps[1], onSubmit: Mock = vi.fn(async () => null)) {
  const onFixAcademic = vi.fn();
  const onEditYear = vi.fn();
  render(
    <Provider store={store}>
      <StepClasses initial={values} onSubmit={onSubmit} saving={false} onFixAcademic={onFixAcademic} onEditYear={onEditYear} />
    </Provider>
  );
  return { onSubmit, onFixAcademic, onEditYear, user: userEvent.setup() };
}

/** Screen 2: the academic year and the boards (it saves nothing: Continue opens the next screen). */
function showAcademic(values: SchoolSteps[1], onContinue: Mock = vi.fn()) {
  render(
    <Provider store={store}>
      <StepAcademic initial={values} onContinue={onContinue} />
    </Provider>
  );
  return { onContinue, user: userEvent.setup() };
}

const ADDRESS: SchoolSteps[2] = { addressLine1: "", addressLine2: "", city: "", state: "", pincode: "", division: "", district: "", schoolPhone: "", schoolEmail: "", website: "" };

/** Step 1: the school and where it is. */
function showSchool(values: SchoolSteps[1], address: SchoolSteps[2] = ADDRESS, onSubmit: Mock = vi.fn(async () => null)) {
  render(
    <Provider store={store}>
      <StepSchool initial={{ ...values, ...address }} onSubmit={onSubmit} saving={false} />
    </Provider>
  );
  return { onSubmit, user: userEvent.setup() };
}

const card = (title: string) => screen.getByRole("region", { name: title });
const save = (user: ReturnType<typeof userEvent.setup>) => user.click(screen.getByRole("button", { name: /save & continue/i }));

beforeEach(() => {
  for (const api of allApiSlices) store.dispatch(api.util.resetApiState());
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("each medium's block", () => {
  it("shows no block until a medium is chosen, and says where to choose one", () => {
    show(initial());
    expect(screen.queryByRole("region")).not.toBeInTheDocument();
    expect(screen.getByText(/Choose a board and a medium on the Academic Year screen first/)).toBeInTheDocument();
  });

  it("gives every medium of a board its own card, with what was saved", () => {
    show(initial({ boards: [board([savedPlan("English"), savedPlan("Hindi", "Nursery", "UKG")])] }));
    expect(within(card("English Medium")).getByLabelText("Class 1: sections")).toHaveValue(2);
    expect(within(card("Hindi Medium")).getByLabelText("Nursery: seats")).toHaveValue(30);
    expect(within(card("Hindi Medium")).queryByLabelText("Class 1: sections")).not.toBeInTheDocument();
  });

  it("keeps the mediums apart: changing one leaves the other", () => {
    show(initial({ boards: [board([savedPlan("English"), savedPlan("Hindi")])] }));
    fireEvent.change(within(card("English Medium")).getByLabelText("Class 1: seats"), { target: { value: "25" } });
    expect(within(card("English Medium")).getByLabelText("Class 1: seats")).toHaveValue(25);
    expect(within(card("Hindi Medium")).getByLabelText("Class 1: seats")).toHaveValue(30);
  });

  it("asks about streams only for a medium that reaches Class 11", () => {
    show(initial({ boards: [board([savedPlan("English", "9", "10"), savedPlan("Hindi", "10", "12")])] }));
    expect(within(card("English Medium")).queryByRole("button", { name: "Science" })).not.toBeInTheDocument();
    expect(within(card("Hindi Medium")).getByRole("button", { name: "Science" })).toHaveAttribute("aria-pressed", "false");
  });

  it("makes a class per stream when one is picked", async () => {
    const { user } = show(initial({ boards: [board([savedPlan("English", "11", "12")])] }));
    await user.click(screen.getByRole("button", { name: "Science" }));
    await user.click(screen.getByRole("button", { name: "Arts" }));
    expect(screen.getByLabelText("Class 11 Science: sections")).toBeInTheDocument();
    expect(screen.getByLabelText("Class 12 Arts: seats")).toBeInTheDocument();
    expect(screen.queryByLabelText("Class 11: sections")).not.toBeInTheDocument();
  });

  it("school days can be turned on and off", async () => {
    const { user } = show(initial({ boards: [board([savedPlan("English")])] }));
    expect(screen.getByRole("button", { name: "Sat" })).toHaveAttribute("aria-pressed", "false");
    await user.click(screen.getByRole("button", { name: "Sat" }));
    expect(screen.getByRole("button", { name: "Sat" })).toHaveAttribute("aria-pressed", "true");
  });

  it("offers Saturday's own timing only when Saturday is a school day", async () => {
    const { user } = show(initial({ boards: [board([savedPlan("English")])] }));
    expect(screen.queryByLabelText("Saturday has its own timing")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Sat" }));
    await user.click(screen.getByLabelText("Saturday has its own timing"));
    expect(screen.getByLabelText("English Medium Saturday: school starts")).toBeInTheDocument();
    expect(screen.getByLabelText("English Medium Saturday: number of periods")).toHaveValue(4);
  });
});

describe("saving the step", () => {
  it("sends each medium's classes and the rows of its day", async () => {
    const { user, onSubmit } = show(initial({ boards: [board([savedPlan("English"), savedPlan("Hindi")])] }));
    await save(user);
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    const sent = (onSubmit.mock.calls[0] as unknown[])[0] as { boards: { plans: MediumPlan[] }[]; lowestClass?: string };
    expect(sent.boards[0].plans.map((p) => p.medium)).toEqual(["English", "Hindi"]);
    expect(sent.boards[0].plans[0].week.usual).toEqual(USUAL);
    expect(sent.boards[0].plans[0].classes[0]).toEqual({ name: "Class 1", sections: 2, seats: 30 });
    expect(sent).not.toHaveProperty("lowestClass");
    expect(sent).not.toHaveProperty("schoolName");
    expect((sent as unknown as { academicYear: { name: string } }).academicYear.name).toBe("2026-2027");
  });

  it("does not save a medium with no classes chosen, and says why under its boxes", async () => {
    const empty = { ...savedPlan("English"), lowestClass: "", highestClass: "", classes: [] } as unknown as MediumPlan;
    const { user, onSubmit } = show(initial({ boards: [board([empty])] }));
    await save(user);
    expect(await screen.findByText("Choose the first class.")).toBeInTheDocument();
    expect(screen.getByText("Choose the last class.")).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("does not save a class with no seats", async () => {
    const { user, onSubmit } = show(initial({ boards: [board([savedPlan("English")])] }));
    fireEvent.change(screen.getByLabelText("Class 2: seats"), { target: { value: "" } });
    await save(user);
    expect(await screen.findByText("Enter the seats")).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("shows what the server says under the box it is about", async () => {
    const onSubmit = vi.fn(async () => ({ "boards.0.plans.0.week.usual": "Up to 12 periods in a day" }));
    const { user } = show(initial({ boards: [board([savedPlan("English")])] }), onSubmit);
    await save(user);
    expect(await within(card("English Medium")).findByText("Up to 12 periods in a day")).toBeInTheDocument();
  });
});

describe("the logo", () => {
  const png = () => new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], "logo.png", { type: "image/png" });

  it("uploads as soon as a picture is chosen", async () => {
    const calls = fakeApi({ "PUT /onboarding/logo": () => ({ steps: { 1: { logoUrl: "/public/schools/t1/logo?v=1" } } }) });
    const { user } = showSchool(initial());
    await user.upload(screen.getByLabelText("Choose a logo"), png());
    await waitFor(() => expect(calls.some((c) => c.method === "PUT" && c.path === "/onboarding/logo")).toBe(true));
  });

  it("refuses a picture that is too big, without sending it", async () => {
    const calls = fakeApi({});
    const { user } = showSchool(initial());
    await user.upload(screen.getByLabelText("Choose a logo"), new File([new Uint8Array(600 * 1024)], "big.png", { type: "image/png" }));
    expect(await screen.findByText("The logo is bigger than 500 KB. Choose a smaller picture.")).toBeInTheDocument();
    expect(calls).toEqual([]);
  });

  it("shows the saved logo, with a way to take it away", () => {
    showSchool(initial({ logoUrl: "/public/schools/t1/logo?v=1" }));
    expect(screen.getByAltText("School logo").getAttribute("src")).toContain("/public/schools/t1/logo?v=1");
    expect(screen.getByRole("button", { name: "Remove" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Change logo" })).toBeInTheDocument();
  });

  it("shows what the server refused", async () => {
    fakeApi({ "PUT /onboarding/logo": () => new Response(JSON.stringify({ success: false, message: "The logo must be a PNG, JPG or WebP picture.", code: "LOGO_NOT_IMAGE" }), { status: 400, headers: { "Content-Type": "application/json" } }) });
    const { user } = showSchool(initial());
    await user.upload(screen.getByLabelText("Choose a logo"), png());
    expect(await screen.findByText("The logo must be a PNG, JPG or WebP picture.")).toBeInTheDocument();
  });
});

describe("step 1: the school and where it is", () => {
  it("has the school, its address and its contact in one step", () => {
    showSchool(initial());
    for (const name of ["Basics", "Location", "Contact", "Registration"]) expect(screen.getByRole("heading", { name })).toBeInTheDocument();
    for (const id of ["schoolName", "schoolType", "addressLine1", "pincode", "state", "district", "city", "schoolPhone", "schoolEmail", "website", "approxStudents", "udiseCode", "establishedYear"]) {
      expect(document.getElementById(id), id).not.toBeNull();
    }
  });

  it("leaves the boards and the academic year to step 2", () => {
    showSchool(initial());
    expect(screen.queryByRole("heading", { name: "Board and medium" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Academic year" })).not.toBeInTheDocument();
    expect(document.getElementById("board-0")).toBeNull();
  });

  it("is filled from what was saved: the school and its address", () => {
    showSchool(initial({ schoolName: "Ganesha Public School" }), { ...ADDRESS, city: "Bhopal", schoolEmail: "office@ganesha.example" });
    expect(document.getElementById("schoolName")).toHaveValue("Ganesha Public School");
    expect(document.getElementById("city")).toHaveValue("Bhopal");
    expect(document.getElementById("schoolEmail")).toHaveValue("office@ganesha.example");
  });

  it("asks for what is missing under each box and sends nothing", async () => {
    const { user, onSubmit } = showSchool(initial({ schoolName: "" }));
    await user.click(screen.getByRole("button", { name: /save & continue/i }));
    expect(await screen.findByText("Enter the school name.")).toBeInTheDocument();
    expect(screen.getByText("Enter the street address.")).toBeInTheDocument();
    expect(screen.getByText("PIN code is 6 digits.")).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("sends the school and its address together", async () => {
    const full: SchoolSteps[2] = { addressLine1: "12 MG Road", addressLine2: "", city: "Bhopal", state: "Madhya Pradesh", pincode: "462001", division: "", district: "Bhopal", schoolPhone: "7554012345", schoolEmail: "office@ganesha.example", website: "" };
    const { user, onSubmit } = showSchool(initial({ schoolType: "Private" }), full);
    await user.click(screen.getByRole("button", { name: /save & continue/i }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    const sent = (onSubmit.mock.calls[0] as unknown[])[0] as Record<string, unknown>;
    expect(sent).toMatchObject({ schoolName: "Ganesha Public School", schoolType: "Private", approxStudents: "300", addressLine1: "12 MG Road", city: "Bhopal", pincode: "462001", schoolEmail: "office@ganesha.example" });
    expect(sent).not.toHaveProperty("boards");
    expect(sent).not.toHaveProperty("academicYear");
  });
});

describe("screen 2: the academic year and the boards", () => {
  it("has the academic year and the board and medium, and nothing of the school", () => {
    showAcademic(initial());
    expect(screen.getByRole("heading", { name: "Academic year" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Board and medium" })).toBeInTheDocument();
    expect(document.getElementById("schoolName")).toBeNull();
    expect(document.getElementById("addressLine1")).toBeNull();
  });

  it("starts with the academic year, then the boards", () => {
    showAcademic(initial());
    const year = screen.getByRole("heading", { name: "Academic year" });
    const boards = screen.getByRole("heading", { name: "Board and medium" });
    expect(year.compareDocumentPosition(boards) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("asks for the year's dates and a board before it goes on", async () => {
    const { user, onContinue } = showAcademic(initial({ academicYear: { name: "", startDate: "", endDate: "", status: null } }));
    await user.click(screen.getByRole("button", { name: /save & continue/i }));
    expect(await screen.findByText("Choose the board.")).toBeInTheDocument();
    expect(onContinue).not.toHaveBeenCalled();
  });

  it("goes on to Class Sections when the year and a board are right, saving nothing by itself", async () => {
    const { user, onContinue } = showAcademic(initial({ boards: [board([savedPlan("English")])] }));
    await user.click(screen.getByRole("button", { name: /save & continue/i }));
    expect(onContinue).toHaveBeenCalledTimes(1);
  });

  it("does not show a medium's classes: they are on the next screen", () => {
    showAcademic(initial({ boards: [board([savedPlan("English")])] }));
    expect(screen.queryByLabelText("Class 1: sections")).not.toBeInTheDocument();
    expect(screen.queryByRole("region")).not.toBeInTheDocument();
  });

  it("opens with the messages it was sent back with", () => {
    render(
      <Provider store={store}>
        <StepAcademic initial={initial()} onContinue={vi.fn()} errorsFromNext={{ "academicYear.endDate": "The year must end after it starts" }} />
      </Provider>
    );
    expect(screen.getByText("The year must end after it starts")).toBeInTheDocument();
  });
});

describe("the streams of Class 11 and 12", () => {
  const senior = () => show(initial({ boards: [board([savedPlan("English", "11", "12")])] }));

  it("offers Maths along with Science, Commerce and Arts", () => {
    senior();
    for (const stream of ["Science", "Commerce", "Arts", "Maths"]) expect(within(card("English Medium")).getByRole("button", { name: stream })).toHaveAttribute("aria-pressed", "false");
  });

  it("a stream is a class of its own in 11 and 12", async () => {
    const { user } = senior();
    await user.click(within(card("English Medium")).getByRole("button", { name: "Maths" }));
    expect(screen.getByLabelText("Class 11 Maths: sections")).toBeInTheDocument();
    expect(screen.getByLabelText("Class 12 Maths: seats")).toBeInTheDocument();
  });

  it("the school can add a stream of its own, with the Add button or with Enter", async () => {
    const { user } = senior();
    const box = within(card("English Medium")).getByLabelText("Add a stream");
    await user.type(box, "Agriculture");
    await user.click(within(card("English Medium")).getByRole("button", { name: "Add stream" }));
    expect(screen.getByLabelText("Class 11 Agriculture: sections")).toBeInTheDocument();
    expect(box).toHaveValue("");
    await user.type(box, "Computer Science{Enter}");
    expect(screen.getByLabelText("Class 12 Computer Science: seats")).toBeInTheDocument();
  });

  it("shows its own streams as chips that can be taken away", async () => {
    const { user } = senior();
    await user.type(within(card("English Medium")).getByLabelText("Add a stream"), "Agriculture{Enter}");
    const chip = within(card("English Medium")).getByRole("button", { name: "Agriculture" });
    expect(chip).toHaveAttribute("aria-pressed", "true");
    await user.click(within(card("English Medium")).getByRole("button", { name: "Remove Agriculture" }));
    expect(screen.queryByLabelText("Class 11 Agriculture: sections")).not.toBeInTheDocument();
  });

  it("says why a name is refused, and keeps what was typed", async () => {
    const { user } = senior();
    const box = within(card("English Medium")).getByLabelText("Add a stream");
    await user.type(box, "A{Enter}");
    expect(await within(card("English Medium")).findByText("Name the stream.")).toBeInTheDocument();
    expect(box).toHaveValue("A");
    await user.clear(box);
    await user.click(within(card("English Medium")).getByRole("button", { name: "Science" }));
    await user.type(box, "science{Enter}");
    expect(await within(card("English Medium")).findByText("Science is already there.")).toBeInTheDocument();
  });

  it("sends the streams, its own included, to the server", async () => {
    const { user, onSubmit } = senior();
    await user.type(within(card("English Medium")).getByLabelText("Add a stream"), "Agriculture{Enter}");
    await user.click(within(card("English Medium")).getByRole("button", { name: "Maths" }));
    await user.click(screen.getByRole("button", { name: /save & continue/i }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    const sent = (onSubmit.mock.calls[0] as unknown[])[0] as { boards: { plans: MediumPlan[] }[] };
    // In the order they were added.
    expect(sent.boards[0].plans[0].seniorStreams).toEqual(["Agriculture", "Maths"]);
  });
});

describe("the sections and the seats of each class", () => {
  it("shows how many seats a class has in all, and the whole plan", () => {
    show(initial({ boards: [board([savedPlan("English")])] }));
    // 2 sections of 30 seats in each of Class 1 and Class 2.
    expect(within(card("English Medium")).getAllByText("60 seats")).toHaveLength(2);
    expect(within(card("English Medium")).getByText("2 classes · 4 sections · 120 seats in all")).toBeInTheDocument();
  });

  it("the total follows what is typed", () => {
    show(initial({ boards: [board([savedPlan("English")])] }));
    fireEvent.change(screen.getByLabelText("Class 1: sections"), { target: { value: "3" } });
    expect(within(card("English Medium")).getByText("90 seats")).toBeInTheDocument();
    expect(within(card("English Medium")).getByText("2 classes · 5 sections · 150 seats in all")).toBeInTheDocument();
  });

  it("a class with no sections shows its own seats", () => {
    show(initial({ boards: [board([savedPlan("English")])] }));
    fireEvent.change(screen.getByLabelText("Class 1: sections"), { target: { value: "0" } });
    expect(within(card("English Medium")).getByText("30 seats")).toBeInTheDocument();
  });

  it("sections go up and down with a button, and stop at none and at 26", async () => {
    const { user } = show(initial({ boards: [board([savedPlan("English")])] }));
    const box = screen.getByLabelText("Class 1: sections");
    await user.click(screen.getByRole("button", { name: "More sections in Class 1" }));
    expect(box).toHaveValue(3);
    for (let i = 0; i < 3; i++) await user.click(screen.getByRole("button", { name: "Fewer sections in Class 1" }));
    expect(box).toHaveValue(0);
    expect(screen.getByRole("button", { name: "Fewer sections in Class 1" })).toBeDisabled();
    fireEvent.change(box, { target: { value: "26" } });
    expect(screen.getByRole("button", { name: "More sections in Class 1" })).toBeDisabled();
  });

  it("takes up to 26 sections: typing more stops at 26", () => {
    show(initial({ boards: [board([savedPlan("English")])] }));
    fireEvent.change(screen.getByLabelText("Class 2: sections"), { target: { value: "26" } });
    expect(screen.getByLabelText("Class 2: sections")).toHaveValue(26);
    fireEvent.change(screen.getByLabelText("Class 2: sections"), { target: { value: "27" } });
    expect(screen.getByLabelText("Class 2: sections")).toHaveValue(26);
  });

  it("says when a class would hold more than 2000 seats", async () => {
    const { user, onSubmit } = show(initial({ boards: [board([savedPlan("English")])] }));
    fireEvent.change(screen.getByLabelText("Class 1: sections"), { target: { value: "11" } });
    fireEvent.change(screen.getByLabelText("Class 1: seats"), { target: { value: "200" } });
    await user.click(screen.getByRole("button", { name: /save & continue/i }));
    expect(await screen.findByText("A class holds up to 2000 seats in all")).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
