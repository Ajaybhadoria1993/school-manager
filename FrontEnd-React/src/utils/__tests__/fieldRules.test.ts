import { describe, expect, it } from "vitest";
import { DEFAULT_FIELD_RULES, type FieldRules } from "../../constants/studentFields";
import { asks, effectiveRules, mayLeave } from "../fieldRules";

const school = (over: Partial<FieldRules>): FieldRules => ({ ...DEFAULT_FIELD_RULES, ...over });

describe("what a school needs of ONE admission (its rules with the details every school has put right)", () => {
  it("the address is always needed, whatever an older setting says", () => {
    const rules = effectiveRules(school({ addressLine1: "optional", addressCity: "hidden", addressState: "optional", addressPincode: "hidden" }), "Class 5");
    expect([rules.addressLine1, rules.addressCity, rules.addressState, rules.addressPincode]).toEqual(["required", "required", "required", "required"]);
    // ...and so for a child of Nursery, and before a class is chosen.
    for (const className of ["Nursery", undefined, null]) expect(effectiveRules(school({ addressLine1: "optional" }), className).addressLine1).toBe("required");
  });

  it("the category is always asked: made needed or optional, never not asked", () => {
    expect(effectiveRules(school({ category: "hidden" }), "Class 5").category).toBe("optional");
    expect(effectiveRules(school({ category: "required" }), "Class 5").category).toBe("required");
    expect(effectiveRules(school({ category: "optional" }), "Class 5").category).toBe("optional");
  });

  it("the previous school is needed for Class 1 to 12, as the school decided, and optional before it", () => {
    for (const className of ["Class 1", "Class 5", "V", "XII Science", "10th"]) {
      const rules = effectiveRules(school({}), className);
      expect([rules.previousSchoolName, rules.previousSchoolLastClass, rules.previousSchoolTcNumber], className).toEqual(["required", "required", "required"]);
    }
    for (const className of ["Nursery", "LKG", "UKG", "KG 1", "Play Group", "Pre-Nursery", undefined, null, ""]) {
      const rules = effectiveRules(school({}), className);
      expect([rules.previousSchoolName, rules.previousSchoolLastClass, rules.previousSchoolTcNumber], String(className)).toEqual(["optional", "optional", "optional"]);
      // It is still asked (the box shows, "optional"), and the TC date was optional anyway.
      expect(asks(rules, "previousSchoolName")).toBe(true);
      expect(mayLeave(rules, "previousSchoolName")).toBe(true);
    }
  });

  it("what the school made optional for the previous school stays optional in Class 1 to 12 (only the name is fixed)", () => {
    const rules = effectiveRules(school({ previousSchoolLastClass: "optional", previousSchoolTcNumber: "hidden" }), "Class 3");
    expect([rules.previousSchoolName, rules.previousSchoolLastClass, rules.previousSchoolTcNumber]).toEqual(["required", "optional", "hidden"]);
  });

  it("nothing else changes", () => {
    const rules = effectiveRules(school({ aadhaarNumber: "optional", religion: "required", rteSeat: "optional" }), "Class 5");
    expect(rules).toMatchObject({ aadhaarNumber: "optional", religion: "required", rteSeat: "optional", bloodGroup: "optional", secondParent: "required" });
  });
});
