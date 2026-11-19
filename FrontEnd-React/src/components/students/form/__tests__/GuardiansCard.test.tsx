import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DEFAULT_FIELD_RULES } from "../../../../constants/studentFields";
import { useStudentForm } from "../../../../hooks/useStudentForm";
import type { GuardianMatch } from "../../../../types";
import { emptyStudentForm } from "../../../../utils/students";
import { GuardiansCard } from "../GuardiansCard";

/** A parent the school already has, as the lookup of a mobile number answers. */
const SURESH: GuardianMatch = {
  id: "g-suresh",
  name: "Suresh Verma",
  mobile: "9876543210",
  alternateMobile: "9811122233",
  email: "suresh@example.com",
  occupation: "Farmer",
  children: [],
};

/** The admission form's parents card with a real form behind it (the mobile lookup is wired only when a `lookup` is given). */
function Card({ lookup, both = false }: { lookup?: (mobile: string) => Promise<GuardianMatch | null>; both?: boolean }) {
  // `both`: the school needs both parents (father and mother), which is the usual rule; the other tests here run with it optional.
  const rules = { ...DEFAULT_FIELD_RULES, secondParent: both ? ("required" as const) : ("optional" as const) };
  const form = useStudentForm(emptyStudentForm(rules), { mode: "admit", classHasSections: () => false, rules, lookup });
  return <GuardiansCard form={form} mode="admit" />;
}

/** One box of the first card, by its part of the path ("name", "mobile"...). */
const box = (field: string) => document.getElementById(`student-guardians-0-${field}`);
const input = (field: string) => box(field) as HTMLInputElement;

/** The Relation dropdown of each card (HeroUI gives its button the box's id). */
const relationButtons = () => [...document.querySelectorAll<HTMLButtonElement>('button[id^="student-guardians-"][id$="-relation"]')];
/** The relations shown in the dropdowns' buttons, card by card. */
const relations = () => relationButtons().map((b) => b.textContent?.trim());

describe("the parents card of Add student", () => {
  it("has every box from the start, in this order: Full name, Relation, Mobile number, Another number, Occupation, Email", () => {
    render(<Card />);
    const boxes = ["name", "relation", "mobile", "alternateMobile", "occupation", "email"].map((field) => box(field));
    boxes.forEach((b, i) => expect(b, `box ${i}`).not.toBeNull());
    for (let i = 1; i < boxes.length; i++) expect(boxes[i - 1]!.compareDocumentPosition(boxes[i]!) & Node.DOCUMENT_POSITION_FOLLOWING, `box ${i} comes after box ${i - 1}`).toBeTruthy();
    // Nothing waits for the mobile number any more.
    expect(screen.queryByText(/open once/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /No mobile number/ })).not.toBeInTheDocument();
  });

  it("the name, the other number and the email can be typed before any mobile number", async () => {
    render(<Card />);
    const user = userEvent.setup();
    await user.type(input("name"), "Ravi Verma");
    await user.type(input("alternateMobile"), "9811122233");
    await user.type(input("occupation"), "Teacher");
    await user.type(input("email"), "ravi@example.com");
    expect(input("name")).toHaveValue("Ravi Verma");
    expect(input("alternateMobile")).toHaveValue("9811122233");
    expect(input("occupation")).toHaveValue("Teacher");
    expect(input("email")).toHaveValue("ravi@example.com");
    expect(input("mobile")).toHaveValue("");
  });

  it("every parent added has all the boxes too", async () => {
    render(<Card />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Add another guardian" }));
    expect(document.getElementById("student-guardians-1-name")).not.toBeNull();
    expect(document.getElementById("student-guardians-1-email")).not.toBeNull();
  });

  it("a number that finds a parent the school has shows them in place of the boxes; changing the number brings back what was typed", async () => {
    render(<Card lookup={async () => SURESH} />);
    const user = userEvent.setup();
    await user.type(input("name"), "Ravi Verma");
    await user.type(input("email"), "ravi@example.com");
    await user.type(input("mobile"), "9876543210");
    expect(await screen.findByText("Suresh Verma is already in your school")).toBeInTheDocument();
    // Kept as they are: their saved details need no boxes.
    expect(box("name")).toBeNull();
    expect(box("email")).toBeNull();
    // The number was a slip: one digit less, and the parent found is forgotten and the boxes hold what was typed again.
    await user.type(input("mobile"), "{Backspace}");
    expect(screen.queryByText("Suresh Verma is already in your school")).not.toBeInTheDocument();
    expect(input("name")).toHaveValue("Ravi Verma");
    expect(input("email")).toHaveValue("ravi@example.com");
  });

  it("the number changed and typed back finds the parent again (not 'new to your school')", async () => {
    const lookup = vi.fn(async () => SURESH);
    render(<Card lookup={lookup} />);
    const user = userEvent.setup();
    await user.type(input("mobile"), "9876543210");
    await screen.findByText("Suresh Verma is already in your school");
    await user.type(input("mobile"), "{Backspace}");
    expect(screen.queryByText(/New to your school/)).not.toBeInTheDocument();
    await user.type(input("mobile"), "0");
    expect(await screen.findByText("Suresh Verma is already in your school")).toBeInTheDocument();
    expect(screen.queryByText(/New to your school/)).not.toBeInTheDocument();
    expect(lookup).toHaveBeenCalledTimes(2);
  });

  it("Update details opens the parent's saved details in the boxes", async () => {
    render(<Card lookup={async () => SURESH} />);
    const user = userEvent.setup();
    await user.type(input("name"), "Ravi Verma");
    await user.type(input("mobile"), "9876543210");
    await screen.findByText("Suresh Verma is already in your school");
    await user.click(screen.getByRole("radio", { name: "Update details" }));
    expect(input("name")).toHaveValue("Suresh Verma");
    expect(input("alternateMobile")).toHaveValue("9811122233");
    expect(input("email")).toHaveValue("suresh@example.com");
    expect(input("occupation")).toHaveValue("Farmer");
  });

  it("a number that finds nobody says the parent is new, and the boxes stay as typed", async () => {
    render(<Card lookup={async () => null} />);
    const user = userEvent.setup();
    await user.type(input("name"), "Ravi Verma");
    await user.type(input("mobile"), "9876543210");
    expect(await screen.findByText(/New to your school/)).toBeInTheDocument();
    expect(input("name")).toHaveValue("Ravi Verma");
  });

  it("starts with a father; Add another guardian gives the mother, then a Guardian: never a second father or mother", async () => {
    render(<Card />);
    const user = userEvent.setup();
    expect(relations()).toEqual(["Father"]);
    await user.click(screen.getByRole("button", { name: "Add another guardian" }));
    expect(relations()).toEqual(["Father", "Mother"]);
    await user.click(screen.getByRole("button", { name: "Add another guardian" }));
    expect(relations()).toEqual(["Father", "Mother", "Guardian"]);
    await user.click(screen.getByRole("button", { name: "Add another guardian" }));
    expect(relations()).toEqual(["Father", "Mother", "Guardian", "Guardian"]);
    // Four is the limit.
    expect(screen.queryByRole("button", { name: "Add another guardian" })).not.toBeInTheDocument();
  });

  it("a father or mother already on the form cannot be chosen again for another guardian; Guardian and Other can", async () => {
    render(<Card />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Add another guardian" }));
    await user.click(screen.getByRole("button", { name: "Add another guardian" }));
    // The third card's list.
    await user.click(relationButtons()[2]);
    const list = await screen.findByRole("listbox");
    const state = (name: string) => within(list).getByRole("option", { name }).getAttribute("aria-disabled");
    expect([state("Father"), state("Mother"), state("Guardian"), state("Other")]).toEqual(["true", "true", null, null]);
  });

  it("the card of the father itself can still be changed to Mother only when the mother is not there", async () => {
    render(<Card />);
    const user = userEvent.setup();
    // Alone, the first card may be Mother (a single mother, say).
    await user.click(relationButtons()[0]);
    let list = await screen.findByRole("listbox");
    expect(within(list).getByRole("option", { name: "Mother" })).not.toHaveAttribute("aria-disabled", "true");
    await user.click(within(list).getByRole("option", { name: "Mother" }));
    expect(relations()).toEqual(["Mother"]);
    // With another guardian added (now the father, the free one), the first card cannot become Father.
    await user.click(screen.getByRole("button", { name: "Add another guardian" }));
    expect(relations()).toEqual(["Mother", "Father"]);
    await user.click(relationButtons()[0]);
    list = await screen.findByRole("listbox");
    expect(within(list).getByRole("option", { name: "Father" })).toHaveAttribute("aria-disabled", "true");
    expect(within(list).getByRole("option", { name: "Mother" })).not.toHaveAttribute("aria-disabled", "true");
  });

  it("when the school needs both parents: a father and a mother from the start, and Relation offers only those two", async () => {
    render(<Card both />);
    const user = userEvent.setup();
    expect(relations()).toEqual(["Father", "Mother"]);
    for (const at of [0, 1]) {
      await user.click(relationButtons()[at]);
      const list = await screen.findByRole("listbox");
      // Guardian and Other are not offered: they are how a child ended up with no father (or no mother) and the form refused.
      expect(within(list).getAllByRole("option").map((o) => o.textContent)).toEqual(["Father", "Mother"]);
      await user.keyboard("{Escape}");
    }
    // Both are there: there is no one else to add.
    expect(screen.queryByRole("button", { name: "Add another guardian" })).not.toBeInTheDocument();
  });

  it("when the school needs both parents, a parent removed can be added again, as the father or the mother who is missing", async () => {
    render(<Card both />);
    const user = userEvent.setup();
    await user.click(screen.getAllByRole("button", { name: "Remove this guardian" })[0]);
    expect(relations()).toEqual(["Mother"]);
    await user.click(screen.getByRole("button", { name: "Add another guardian" }));
    expect(relations()).toEqual(["Mother", "Father"]);
    expect(screen.queryByRole("button", { name: "Add another guardian" })).not.toBeInTheDocument();
  });

  it("removing the mother frees her place again", async () => {
    render(<Card />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Add another guardian" }));
    await user.click(screen.getByRole("button", { name: "Add another guardian" }));
    expect(relations()).toEqual(["Father", "Mother", "Guardian"]);
    // Remove the mother (the second card).
    await user.click(screen.getAllByRole("button", { name: "Remove this guardian" })[1]);
    expect(relations()).toEqual(["Father", "Guardian"]);
    await user.click(screen.getByRole("button", { name: "Add another guardian" }));
    expect(relations()).toEqual(["Father", "Guardian", "Mother"]);
  });
});
