import { describe, expect, it } from "vitest";
import type { StaffMember } from "../../types";
import { emptyStaffForm, formFromStaff, staffKeyOfPath, staffProblems, toStaffInput } from "../staffMembers";

const GOOD = { ...emptyStaffForm(), name: "Asha Rao", role: "receptionist", username: "asha.rao_41", password: "Recep@Desk1" };

describe("the staff form", () => {
  it("needs a name, a role, a username and a password, and nothing else (the email is only a contact)", () => {
    expect(staffProblems(GOOD)).toEqual({});
    expect(staffProblems(emptyStaffForm())).toEqual({
      name: "Enter the name",
      role: "Choose the role",
      username: "A username is 3 to 30 letters, digits, dots or underscores, starting with a letter",
      password: "Password must be 8-72 characters with an uppercase letter, a lowercase letter, a number and a special character",
    });
  });

  it("holds the username and the password to the server's rules", () => {
    expect(staffProblems({ ...GOOD, username: "1asha" }).username).toBe("A username is 3 to 30 letters, digits, dots or underscores, starting with a letter");
    expect(staffProblems({ ...GOOD, username: "as" }).username).toBeDefined();
    expect(staffProblems({ ...GOOD, username: "Asha.Rao_41" })).toEqual({});
    expect(staffProblems({ ...GOOD, password: "weakpass" }).password).toBeDefined();
  });

  it("an email is optional, but one that is typed has to be an email", () => {
    expect(staffProblems({ ...GOOD, email: "" })).toEqual({});
    expect(staffProblems({ ...GOOD, email: "asha@school.example" })).toEqual({});
    expect(staffProblems({ ...GOOD, email: "not-an-email" })).toEqual({ email: "Enter a valid email address" });
  });

  it("does not ask for a login when a person is changed (the Staff list changes the username and the password)", () => {
    expect(staffProblems({ ...GOOD, username: "", password: "" }, { editing: true })).toEqual({});
  });

  it("the role Other needs a name of the school's own, up to 40 letters; any other role needs none", () => {
    expect(staffProblems({ ...GOOD, role: "other" })).toEqual({ roleOther: "Enter the role's name" });
    expect(staffProblems({ ...GOOD, role: "other", roleOther: "   " })).toEqual({ roleOther: "Enter the role's name" });
    expect(staffProblems({ ...GOOD, role: "other", roleOther: "x".repeat(41) })).toEqual({ roleOther: "Keep the role's name under 40 characters" });
    expect(staffProblems({ ...GOOD, role: "other", roleOther: "Lab technician" })).toEqual({});
    expect(staffProblems({ ...GOOD, role: "librarian", roleOther: "" })).toEqual({});
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

  it("sends the login with a new person (username in lower case), an empty box as null, the mobile as its 10 digits", () => {
    const sent = toStaffInput({ ...GOOD, username: " Asha.Rao_41 ", mobile: "+91 98765 43210", gender: "Female", designation: " Front desk ", addressLine1: "5 MG Road", city: "", state: "", pincode: "" });
    expect(sent).toEqual({
      name: "Asha Rao",
      role: "receptionist",
      roleOther: null,
      alsoTeacher: false,
      subjectIds: [],
      email: null,
      login: { username: "asha.rao_41", password: "Recep@Desk1" },
      mobile: "9876543210",
      gender: "Female",
      dateOfBirth: null,
      designation: "Front desk",
      employeeCode: null,
      joiningDate: null,
      address: { line1: "5 MG Road", city: null, state: null, pincode: null },
    });
  });

  it("sends the email in lower case when there is one; a person who is changed sends no login (and an emptied email as null)", () => {
    expect(toStaffInput({ ...GOOD, email: " Asha@School.Example " })).toMatchObject({ email: "asha@school.example" });
    const changed = toStaffInput({ ...GOOD, email: "" }, { editing: true });
    expect(changed).not.toHaveProperty("login");
    expect(changed).toMatchObject({ email: null });
  });

  it("sends the role's name only for Other, and the subjects only for someone who also teaches", () => {
    expect(toStaffInput({ ...GOOD, role: "other", roleOther: "  Lab   technician " })).toMatchObject({ role: "other", roleOther: "Lab technician" });
    expect(toStaffInput({ ...GOOD, role: "librarian", roleOther: "left over" })).toMatchObject({ role: "librarian", roleOther: null });
    expect(toStaffInput({ ...GOOD, alsoTeacher: true, subjectIds: ["maths", "english"] })).toMatchObject({ alsoTeacher: true, subjectIds: ["maths", "english"] });
    expect(toStaffInput({ ...GOOD, alsoTeacher: false, subjectIds: ["maths"] })).toMatchObject({ alsoTeacher: false, subjectIds: [] });
  });

  it("fills the form from a person (a missing email is an empty box, the login is never in it), and finds the box a server message names", () => {
    const member: StaffMember = {
      id: "m1",
      name: "Asha Rao",
      role: "other",
      roleLabel: "Lab technician",
      roleOther: "Lab technician",
      alsoTeacher: true,
      isTeacher: true,
      subjectIds: ["maths"],
      email: null,
      mobile: null,
      gender: "Female",
      dateOfBirth: "1990-02-01",
      address: { line1: "5 MG Road", city: null, state: "Madhya Pradesh", pincode: null },
      designation: null,
      employeeCode: "S-1",
      joiningDate: null,
      status: "active",
      login: { username: "asha.rao_41", isActive: true },
    };
    expect(formFromStaff(member)).toMatchObject({ name: "Asha Rao", role: "other", roleOther: "Lab technician", alsoTeacher: true, subjectIds: ["maths"], email: "", mobile: "", gender: "Female", addressLine1: "5 MG Road", state: "Madhya Pradesh", employeeCode: "S-1", username: "", password: "" });
    expect(staffKeyOfPath("address.pincode")).toBe("pincode");
    expect(staffKeyOfPath("email")).toBe("email");
    expect(staffKeyOfPath("roleOther")).toBe("roleOther");
    expect(staffKeyOfPath("subjectIds")).toBe("subjectIds");
    expect(staffKeyOfPath("login.username")).toBe("username");
    expect(staffKeyOfPath("login.password")).toBe("password");
    expect(staffKeyOfPath("custom.c_x")).toBeNull();
  });
});
