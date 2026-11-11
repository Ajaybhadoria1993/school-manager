import { describe, expect, it } from "vitest";
import { classMark } from "../academics";

describe("the big mark on a class card", () => {
  it("is the number of a numbered class", () => {
    expect(classMark("Class 5")).toBe("5");
    expect(classMark("class 12")).toBe("12");
  });

  it("is the number of a class of a stream too", () => {
    expect(classMark("Class 11 Science")).toBe("11");
    expect(classMark("Class 12 Commerce")).toBe("12");
  });

  it("is a short name as it is, and the first letters of a longer one", () => {
    expect(classMark("LKG")).toBe("LKG");
    expect(classMark("Nursery")).toBe("NU");
    expect(classMark("Pre-Nursery")).toBe("PN");
  });
});
