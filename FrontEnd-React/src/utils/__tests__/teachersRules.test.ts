import { describe, expect, it } from "vitest";
import { DEFAULT_TEACHER_RULES, type TeacherFieldRules } from "../../constants/teacherFields";
import { emptyTeacherForm, jobAsked, teacherProblems, type TeacherFormValues } from "../teachers";

/** What the school needs of the usual details (Teacher > Manage fields) in the rules of the Add / Change teacher form. */
const rules = (patch: Partial<TeacherFieldRules>): TeacherFieldRules => ({ ...DEFAULT_TEACHER_RULES, ...patch });
const filled = (patch: Partial<TeacherFormValues> = {}): TeacherFormValues => ({
  ...emptyTeacherForm(),
  name: "Meena Singh",
  gender: "Female",
  mobile: "9876543210",
  username: "meena.singh_41",
  password: "Sch00l@Teach1",
  ...patch,
});
const add = { login: true } as const;

describe("a needed detail of the teacher form", () => {
  it("must be answered, in the server's words, each under its own box", () => {
    const problems = teacherProblems(filled(), {
      ...add,
      rules: rules({ dateOfBirth: "required", email: "required", address: "required", city: "required", state: "required", pincode: "required", employeeCode: "required", designation: "required", qualification: "required", experienceYears: "required", joiningDate: "required", employmentType: "required", subjects: "required" }),
    });
    expect(problems).toEqual({
      dateOfBirth: "Enter the date of birth",
      email: "Enter the email",
      addressLine1: "Enter the house and street",
      city: "Enter the city or village",
      state: "Choose the state",
      pincode: "Enter the PIN code",
      employeeCode: "Enter the employee code",
      designation: "Enter the designation",
      qualification: "Enter the qualification",
      experienceYears: "Enter the years of experience",
      joiningDate: "Enter the joining date",
      employmentType: "Choose the employment type",
      subjectIds: "Choose at least one subject",
    });
  });

  it("is fine once it is answered (a space is not an answer; 0 years of experience is)", () => {
    const needed = rules({ qualification: "required", experienceYears: "required", subjects: "required" });
    expect(teacherProblems(filled({ qualification: "   ", experienceYears: "0", subjectIds: ["maths"] }), { ...add, rules: needed })).toEqual({ qualification: "Enter the qualification" });
    expect(teacherProblems(filled({ qualification: "M.Sc.", experienceYears: "0", subjectIds: ["maths"] }), { ...add, rules: needed })).toEqual({});
  });

  it("says what is wrong with a wrong answer instead of 'Enter it'", () => {
    expect(teacherProblems(filled({ pincode: "123" }), { ...add, rules: rules({ pincode: "required" }) }).pincode).toBe("PIN code is 6 digits");
  });

  it("is held for a teacher who is only changed too (the change form asks every box it shows)", () => {
    expect(teacherProblems(filled(), { login: false, rules: rules({ qualification: "required" }) })).toEqual({ qualification: "Enter the qualification" });
  });
});

describe("a detail the school does not ask", () => {
  it("is not looked at, so an old wrong value in a box that is not on the form cannot stop a save", () => {
    const old = filled({ email: "nope", pincode: "123", experienceYears: "-1", dateOfBirth: "2015-01-01", joiningDate: "2099-01-01" });
    expect(teacherProblems(old, { ...add, rules: rules({ email: "hidden", pincode: "hidden", experienceYears: "hidden", dateOfBirth: "hidden", joiningDate: "hidden" }) })).toEqual({});
    expect(Object.keys(teacherProblems(old, add)).sort()).toEqual(["dateOfBirth", "email", "experienceYears", "joiningDate", "pincode"]);
  });

  it("makes the Job step empty only when every Job detail is not asked", () => {
    expect(jobAsked(DEFAULT_TEACHER_RULES)).toBe(true);
    const none = rules({ employeeCode: "hidden", designation: "hidden", qualification: "hidden", employmentType: "hidden", joiningDate: "hidden", experienceYears: "hidden" });
    expect(jobAsked(none)).toBe(false);
    expect(jobAsked({ ...none, designation: "optional" })).toBe(true);
  });
});
