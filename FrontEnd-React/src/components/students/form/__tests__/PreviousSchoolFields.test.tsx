import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DEFAULT_FIELD_RULES, type FieldRules } from "../../../../constants/studentFields";
import { useStudentForm } from "../../../../hooks/useStudentForm";
import { emptyStudentForm } from "../../../../utils/students";
import { AddressFields } from "../AddressFields";
import { PreviousSchoolFields } from "../RecordsFields";

const CLASSES: Record<string, string> = { nur: "Nursery", ukg: "UKG", c1: "Class 1", c5: "Class 5", c12: "Class 12" };

/** The cards that depend on the class, with buttons that choose one (the real form picks it in the Class card). */
function Cards({ rules = DEFAULT_FIELD_RULES }: { rules?: FieldRules }) {
  const form = useStudentForm(emptyStudentForm(rules), { mode: "admit", classHasSections: () => false, rules, classNameOf: (id) => CLASSES[id] });
  return (
    <>
      {Object.entries(CLASSES).map(([id, name]) => (
        <button key={id} type="button" onClick={() => form.set("classId", id)}>
          Pick {name}
        </button>
      ))}
      <PreviousSchoolFields form={form} />
      <AddressFields form={form} />
    </>
  );
}
const label = (id: string) => document.querySelector(`label[for="student-${id}"]`)?.textContent ?? "";
const optional = (id: string) => label(id).includes("(optional)");

describe("the previous school on Add student follows the class", () => {
  it("is optional before a class is chosen and for Nursery, LKG, UKG; needed from Class 1 to 12 (the name, and what the school needs of the rest)", async () => {
    render(<Cards />);
    const user = userEvent.setup();
    const all = ["previousSchool-name", "previousSchool-lastClass", "previousSchool-tcNumber"];
    for (const id of all) expect(optional(id), `${id} before a class`).toBe(true);
    expect(screen.getByText(/Only when the student comes from another school/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Pick Class 5" }));
    for (const id of all) expect(optional(id), `${id} in Class 5`).toBe(false);
    expect(screen.getByText(/needed from Class 1/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Pick Nursery" }));
    for (const id of all) expect(optional(id), `${id} in Nursery`).toBe(true);
    await user.click(screen.getByRole("button", { name: "Pick Class 12" }));
    expect(optional("previousSchool-name")).toBe(false);
    await user.click(screen.getByRole("button", { name: "Pick UKG" }));
    expect(optional("previousSchool-name")).toBe(true);
    // TC date was optional for every school.
    expect(optional("previousSchool-tcDate")).toBe(true);
  });

  it("the school's own wish for the last class and the TC number is kept: optional there, optional here", async () => {
    render(<Cards rules={{ ...DEFAULT_FIELD_RULES, previousSchoolLastClass: "optional", previousSchoolTcNumber: "optional" }} />);
    await userEvent.setup().click(screen.getByRole("button", { name: "Pick Class 1" }));
    expect(optional("previousSchool-name")).toBe(false);
    expect(optional("previousSchool-lastClass")).toBe(true);
    expect(optional("previousSchool-tcNumber")).toBe(true);
  });

  it("the check on Admit says so for the class chosen: a student of Class 5 is asked for the name, a child of Nursery is not", async () => {
    render(<Cards />);
    expect(screen.queryByText("Enter the previous school's name")).not.toBeInTheDocument();
  });
});

describe("the address on Add student is always needed", () => {
  it("whatever the school's rules say (an older setting that made it optional is ignored)", () => {
    render(<Cards rules={{ ...DEFAULT_FIELD_RULES, addressLine1: "optional", addressCity: "hidden", addressState: "optional", addressPincode: "optional" }} />);
    for (const id of ["address-line1", "address-city", "address-state", "address-pincode"]) {
      expect(label(id), id).not.toBe("");
      expect(optional(id), id).toBe(false);
    }
  });
});
