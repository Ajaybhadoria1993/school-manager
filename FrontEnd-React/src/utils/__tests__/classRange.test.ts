import { describe, expect, it } from "vitest";
import { classRange } from "../academics";

/** The line under a department's name on the Classes page: which classes it holds, from its first to its last. */
describe("classRange", () => {
  it("numbered classes read as one range", () => {
    expect(classRange(["Class 1", "Class 2", "Class 3", "Class 4"])).toBe("Classes 1 to 4");
    expect(classRange(["class 6", "Class 8"])).toBe("Classes 6 to 8");
  });

  it("other names read from the first to the last", () => {
    expect(classRange(["Pre-Nursery", "Nursery", "LKG", "UKG"])).toBe("Pre-Nursery to UKG");
    expect(classRange(["UKG", "Class 1"])).toBe("UKG to Class 1");
  });

  it("one class, or none, needs no range", () => {
    expect(classRange(["Class 6"])).toBeNull();
    expect(classRange([])).toBeNull();
  });
});
