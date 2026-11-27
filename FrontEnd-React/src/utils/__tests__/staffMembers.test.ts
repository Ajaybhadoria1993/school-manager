import { describe, expect, it } from "vitest";
import type { StaffMember } from "../../types";
import { emptyStaffForm, formFromStaff, namedRoleKey, staffKeyOfPath, staffProblems, toStaffInput } from "../staffMembers";

const GOOD = { ...emptyStaffForm(), name: "Asha Rao", role: "receptionist" };

describe("a role the school named", () => {
  it("is one role however its name is typed (the server's key)", () => {
    expect(namedRoleKey("Sports Coach")).toBe("other:sports coach");
    expect(namedRoleKey("  sports   COACH ")).toBe("other:sports coach");
  });
});

describe("the staff form", () => {
  it("needs a name and a role, and nothing else (no username or password: the school makes none)", () => {
    expect(staffProblems(GOOD)).toEqual({});
    expect(staffProblems(emptyStaffForm())).toEqual({ name: "Enter the name", role: "Choose the role" });
  });

  it("needs the email when Give login access is ticked: the invitation goes to it", () => {
    expect(staffProblems({ ...GOOD, giveLogin: true })).toEqual({ email: "Enter the email: the login invitation is sent to it" });
    expect(staffProblems({ ...GOOD, giveLogin: true, email: "nope" })).toEqual({ email: "Enter a valid email address" });
    expect(staffProblems({ ...GOOD, giveLogin: true, email: "asha@school.example" })).toEqual({});
  });

  it("an email is optional, but one that is typed has to be an email", () => {
    expect(staffProblems({ ...GOOD, email: "" })).toEqual({});
    expect(staffProblems({ ...GOOD, email: "asha@school.example" })).toEqual({});
    expect(staffProblems({ ...GOOD, email: "not-an-email" })).toEqual({ email: "Enter a valid email address" });
  });

  it("does not ask about login access when a person is changed (the Staff list gives it)", () => {
    expect(staffProblems({ ...GOOD, giveLogin: true }, { editing: true })).toEqual({});
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

  it("sends login access with a new person when it is ticked, an empty box as null, the mobile as its 10 digits", () => {
    const sent = toStaffInput({ ...GOOD, giveLogin: true, email: "asha@school.example", mobile: "+91 98765 43210", gender: "Female", designation: " Front desk ", addressLine1: "5 MG Road", city: "", state: "", pincode: "" });
    expect(sent).toEqual({
      name: "Asha Rao",
      role: "receptionist",
      roleOther: null,
      alsoTeacher: false,
      subjectIds: [],
      email: "asha@school.example",
      giveLogin: true,
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
    expect(toStaffInput(GOOD)).not.toHaveProperty("giveLogin");
    const changed = toStaffInput({ ...GOOD, giveLogin: true, email: "" }, { editing: true });
    expect(changed).not.toHaveProperty("giveLogin");
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
      login: { username: "asha.rao_41", email: null, isActive: true, pending: false },
    };
    expect(formFromStaff(member)).toMatchObject({ name: "Asha Rao", role: "other", roleOther: "Lab technician", alsoTeacher: true, subjectIds: ["maths"], email: "", mobile: "", gender: "Female", addressLine1: "5 MG Road", state: "Madhya Pradesh", employeeCode: "S-1", giveLogin: false });
    expect(staffKeyOfPath("address.pincode")).toBe("pincode");
    expect(staffKeyOfPath("email")).toBe("email");
    expect(staffKeyOfPath("roleOther")).toBe("roleOther");
    expect(staffKeyOfPath("subjectIds")).toBe("subjectIds");
    expect(staffKeyOfPath("custom.c_x")).toBeNull();
  });
});
