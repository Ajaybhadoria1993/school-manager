import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DEFAULT_FIELD_RULES } from "../../../../constants/studentFields";
import { useStudentForm } from "../../../../hooks/useStudentForm";
import { emptyStudentForm } from "../../../../utils/students";
import { GuardiansCard } from "../GuardiansCard";

/** The admission form's parents card with a real form behind it (no server: the mobile lookup is not wired). */
function Card() {
  const form = useStudentForm(emptyStudentForm({ ...DEFAULT_FIELD_RULES, secondParent: "optional" }), {
    mode: "admit",
    classHasSections: () => false,
    rules: { ...DEFAULT_FIELD_RULES, secondParent: "optional" },
  });
  return <GuardiansCard form={form} mode="admit" />;
}

/** The Relation dropdown of each card (HeroUI gives its button the box's id). */
const relationButtons = () => [...document.querySelectorAll<HTMLButtonElement>('button[id^="student-guardians-"][id$="-relation"]')];
/** The relations shown in the dropdowns' buttons, card by card. */
const relations = () => relationButtons().map((b) => b.textContent?.trim());

describe("the parents card of Add student", () => {
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
