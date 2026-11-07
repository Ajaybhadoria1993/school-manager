import { describe, expect, it } from "vitest";
import type { StaffMember } from "../../types";
import { emptyStaffForm, formFromStaff, staffKeyOfPath, staffProblems, toStaffInput } from "../staffMembers";

const GOOD = { ...emptyStaffForm(), name: "Asha Rao", role: "receptionist", email: "Asha@School.Example" };

describe("the staff form", () => {
  it("needs a name, a role and an email, and nothing else", () => {
    expect(staffProblems(GOOD)).toEqual({});
    expect(staffProblems(emptyStaffForm())).toEqual({ name: "Enter the name", role: "Choose the role", email: "Enter the email address" });
    expect(staffProblems({ ...GOOD, email: "not-an-email" })).toEqual({ email: "Enter a valid email address" });
  });

  it("does not ask for the email when a person is changed (it is fixed)", () => {
    expect(staffProblems({ ...GOOD, email: "" }, { editing: true })).toEqual({});
  });

  it("holds what is filled to the rules of the server: mobile, birthday, joining day, code, state, PIN", () => {
    const p = staffProblems({ ...GOOD, mobile: "12345", dateOfBirth: "2015-01-01", joiningDate: "2099-01-01", employeeCode: "bad code!", state: "Atlantis", pincode: "46200" });
    expect(p).toEqual({
      mobile: "Enter a 10-digit mobile number starting with 6, 7, 8 or 9",
      dateOfBirth: "A staff member must be 18 to 75 years old",
      joiningDate: "The joining date cannot be more than a year ahead",
      employeeCode: "The employee code is letters, digits and - only, up to 20",
      state: "Choose the state",
      pincode: "PIN code is 6 digits",
    });
    expect(staffProblems({ ...GOOD, dateOfBirth: "1990-02-31" }).dateOfBirth).toBe("Choose a valid date of birth");
  });

  it("sends the email only when the person is added, an empty box as null, the mobile as its 10 digits", () => {
    const form = { ...GOOD, mobile: "+91 98765 43210", gender: "Female" as const, designation: " Front desk ", address: undefined };
    const sent = toStaffInput({ ...form, addressLine1: "5 MG Road", city: "", state: "", pincode: "" });
    expect(sent).toEqual({
      name: "Asha Rao",
      role: "receptionist",
      email: "asha@school.example",
      mobile: "9876543210",
      gender: "Female",
      dateOfBirth: null,
      designation: "Front desk",
      employeeCode: null,
      joiningDate: null,
      address: { line1: "5 MG Road", city: null, state: null, pincode: null },
    });
    expect(toStaffInput(GOOD, { editing: true })).not.toHaveProperty("email");
  });

  it("fills the form from a person, and finds the box a server message names", () => {
    const member: StaffMember = {
      id: "m1",
      name: "Asha Rao",
      role: "management",
      roleLabel: "Management",
      email: "asha@school.example",
      mobile: null,
      gender: "Female",
      dateOfBirth: "1990-02-01",
      address: { line1: "5 MG Road", city: null, state: "Madhya Pradesh", pincode: null },
      designation: null,
      employeeCode: "S-1",
      joiningDate: null,
      status: "active",
      invitedAt: "2026-11-01T00:00:00.000Z",
      acceptedAt: null,
    };
    expect(formFromStaff(member)).toMatchObject({ name: "Asha Rao", role: "management", mobile: "", gender: "Female", addressLine1: "5 MG Road", state: "Madhya Pradesh", employeeCode: "S-1" });
    expect(staffKeyOfPath("address.pincode")).toBe("pincode");
    expect(staffKeyOfPath("email")).toBe("email");
    expect(staffKeyOfPath("custom.c_x")).toBeNull();
  });
});
