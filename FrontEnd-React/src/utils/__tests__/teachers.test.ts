import { describe, expect, it } from "vitest";
import { isPasswordValid } from "../validators";
import {
  TEACHER_STEPS,
  emptyTeacherForm,
  formFromTeacher,
  formKeyOfPath,
  defaultUsername,
  generatePassword,
  joiningShortcuts,
  onlyDigits,
  problemKeysOf,
  suggestUsername,
  usernameFor,
  isUsername,
  teacherProblems,
  toTeacherInput,
  type TeacherFormValues,
} from "../teachers";
import { MEENA } from "../../test/timetableFixtures";
import { DEFAULT_TEACHER_RULES } from "../../constants/teacherFields";

const filled = (over: Partial<TeacherFormValues> = {}): TeacherFormValues => ({
  ...emptyTeacherForm(),
  name: "Meena Singh",
  gender: "Female",
  mobile: "9876543210",
  ...over,
});

describe("the steps of Add teacher", () => {
  it("are Personal info, Job details and Teaching, in that order (no Login step since 2026-11-26: login access is a box in the first step)", () => {
    expect(TEACHER_STEPS.map((s) => s.label)).toEqual(["Personal info", "Job details", "Teaching"]);
  });
});

describe("what is wrong with a teacher form", () => {
  it("asks for the name, the gender and the mobile number of a teacher who is added, and no username or password", () => {
    expect(teacherProblems(emptyTeacherForm(), { login: true })).toEqual({
      name: "Enter the teacher's name",
      gender: "Choose the gender",
      mobile: "Enter a 10-digit mobile number starting with 6, 7, 8 or 9",
    });
  });

  it("needs the email when Give login access is ticked (the invitation goes to it), even when the school does not ask the email", () => {
    expect(teacherProblems(filled({ giveLogin: true }), { login: true })).toEqual({ email: "Enter the email: the login invitation is sent to it" });
    expect(teacherProblems(filled({ giveLogin: true, email: "nope" }), { login: true })).toEqual({ email: "Enter a valid email address" });
    expect(teacherProblems(filled({ giveLogin: true, email: "meena@school.example" }), { login: true })).toEqual({});
    expect(teacherProblems(filled({ giveLogin: true }), { login: true, rules: { ...DEFAULT_TEACHER_RULES, email: "hidden" } })).toEqual({ email: "Enter the email: the login invitation is sent to it" });
    // Unticked, the email may be left empty.
    expect(teacherProblems(filled({ giveLogin: false }), { login: true })).toEqual({});
  });

  it("leaves the gender out when asked to (a teacher who is changed, not added), but still needs the mobile of one with a login", () => {
    expect(Object.keys(teacherProblems(emptyTeacherForm(), { login: true, requireGender: false })).sort()).toEqual(["mobile", "name"]);
  });

  it("asks only for the name of a teacher who is changed and has no login", () => {
    expect(Object.keys(teacherProblems(emptyTeacherForm(), { login: false }))).toEqual(["name"]);
  });

  it("is happy with a filled form", () => {
    expect(teacherProblems(filled(), { login: true })).toEqual({});
  });

  it("reads a mobile number the way it is typed", () => {
    for (const mobile of ["98765 43210", "+91 98765 43210", "09876543210", "9876543210"]) {
      expect(teacherProblems(filled({ mobile }), { login: true }).mobile, mobile).toBeUndefined();
    }
    expect(teacherProblems(filled({ mobile: "1234567890" }), { login: true }).mobile).toBeDefined();
  });

  it("checks each optional box only when something is typed in it", () => {
    expect(teacherProblems(filled({ email: "nope", pincode: "123", experienceYears: "-1", dateOfBirth: "2015-01-01", joiningDate: "2099-01-01" }), { login: true })).toEqual({
      email: "Enter a valid email address",
      pincode: "PIN code is 6 digits",
      experienceYears: "Experience is 0 to 60 whole years",
      dateOfBirth: "A teacher must be 18 to 75 years old",
      joiningDate: "The joining date cannot be more than a year ahead",
    });
    expect(teacherProblems(filled({ email: "", pincode: "", experienceYears: "", dateOfBirth: "", joiningDate: "" }), { login: true })).toEqual({});
  });

  it("holds the limits to the numbers the server allows", () => {
    expect(teacherProblems(filled({ maxPeriodsPerDay: "13", maxPeriodsPerWeek: "71" }), { login: true })).toEqual({
      maxPeriodsPerDay: "A teacher can take 1 to 12 periods a day",
      maxPeriodsPerWeek: "A teacher can take 1 to 70 periods a week",
    });
    expect(teacherProblems(filled({ maxPeriodsPerDay: "5", maxPeriodsPerWeek: "30" }), { login: true })).toEqual({});
  });

  it("says which step a wrong box is on", () => {
    const problems = teacherProblems(emptyTeacherForm(), { login: true });
    expect(problemKeysOf(problems, "personal")).toEqual(["name", "gender", "mobile"]);
    expect(problemKeysOf(problems, "job")).toEqual([]);
    expect(problemKeysOf(teacherProblems(filled({ giveLogin: true }), { login: true }), "personal")).toEqual(["email"]);
  });

  it("knows the box the server's path points at", () => {
    expect(formKeyOfPath("address.pincode")).toBe("pincode");
    expect(formKeyOfPath("email")).toBe("email");
    expect(formKeyOfPath("offDays")).toBe("offDays");
    expect(formKeyOfPath("subjectIds.0")).toBe("subjectIds");
    expect(formKeyOfPath("somethingElse")).toBeNull();
  });
});

describe("what is sent", () => {
  it("turns an empty box into nothing, numbers into numbers, and leaves the login out unless asked", () => {
    const body = toTeacherInput(filled({ email: " Meena@School.Example ", experienceYears: "9", maxPeriodsPerDay: "5", addressLine1: " 12, MG Road ", pincode: "462001" }), { login: false });
    expect(body).toEqual({
      name: "Meena Singh",
      gender: "Female",
      dateOfBirth: null,
      mobile: "9876543210",
      email: "Meena@School.Example",
      address: { line1: "12, MG Road", city: null, state: null, pincode: "462001" },
      employeeCode: null,
      designation: null,
      qualification: null,
      experienceYears: 9,
      joiningDate: null,
      employmentType: null,
      subjectIds: [],
      maxPeriodsPerDay: 5,
      maxPeriodsPerWeek: null,
      offDays: [],
    });
  });

  it("asks for login access only when it is ticked in Add teacher (no username or password is ever sent)", () => {
    expect(toTeacherInput(filled({ giveLogin: true, email: "meena@school.example" }), { login: true })).toMatchObject({ giveLogin: true, email: "meena@school.example" });
    expect(toTeacherInput(filled({ giveLogin: false }), { login: true })).not.toHaveProperty("giveLogin");
    expect(toTeacherInput(filled({ giveLogin: true }), { login: false })).not.toHaveProperty("giveLogin");
    expect(toTeacherInput(filled({ giveLogin: true }), { login: true })).not.toHaveProperty("login");
  });
});

describe("a teacher opened for changing", () => {
  it("fills every box from what the school has, and nothing is undefined", () => {
    const form = formFromTeacher({
      ...MEENA,
      gender: "Female",
      dateOfBirth: "1988-07-14",
      address: { line1: "12, MG Road", city: "Bhopal", state: "Madhya Pradesh", pincode: "462001" },
      experienceYears: 9,
      maxPeriodsPerDay: 6,
      offDays: [6],
    });
    expect(form).toMatchObject({ name: "Meena Singh", mobile: "9876543210", gender: "Female", dateOfBirth: "1988-07-14", addressLine1: "12, MG Road", city: "Bhopal", pincode: "462001", experienceYears: "9", maxPeriodsPerDay: "6", offDays: [6], subjectIds: ["maths"] });
    expect(Object.values(form).every((v) => v !== undefined && v !== null)).toBe(true);
  });
});

describe("the username suggested from the name", () => {
  it("is first.last in lower case", () => {
    expect(suggestUsername("Meena Singh")).toBe("meena.singh");
    expect(suggestUsername("  Dr. Asha   Rao ")).toBe("asha.rao");
    expect(suggestUsername("Ravi Kumar Sharma")).toBe("ravi.sharma");
  });

  it("copes with one name, accents and symbols, and a name too short to be a username", () => {
    expect(suggestUsername("Meena")).toBe("meena");
    expect(suggestUsername("Zoë O'Neil")).toBe("zoe.oneil");
    expect(suggestUsername("Al")).toBe("al.teacher");
    expect(suggestUsername("")).toBe("");
    expect(suggestUsername("राम शर्मा")).toBe("");
  });

  it("always passes the username rules when it is not empty, and fits in 30 characters", () => {
    for (const name of ["Meena Singh", "Al", "Zoë O'Neil", "A".repeat(80) + " " + "B".repeat(80)]) {
      const username = suggestUsername(name);
      expect(isUsername(username), name).toBe(true);
      expect(username.length).toBeLessThanOrEqual(30);
    }
  });
});

describe("the username put in a parent's login box", () => {
  it("is the name with a number after it, so it is rarely someone else's on the platform", () => {
    expect(defaultUsername("Meena Singh", () => 31)).toBe("meena.singh_41");
    expect(defaultUsername("Meena Singh", () => 0)).toBe("meena.singh_10");
    expect(defaultUsername("Meena Singh", () => 89)).toBe("meena.singh_99");
    for (let i = 0; i < 50; i++) expect(defaultUsername("Meena Singh")).toMatch(/^meena\.singh_[1-9]\d$/);
  });

  it("fits in 30 characters and passes the rules; a name with no letters a-z gives nothing", () => {
    const long = defaultUsername("A".repeat(80) + " " + "B".repeat(80), () => 5);
    expect(long.length).toBeLessThanOrEqual(30);
    expect(long).toMatch(/_15$/);
    expect(isUsername(long)).toBe(true);
    expect(defaultUsername("राम शर्मा")).toBe("");
    expect(defaultUsername("")).toBe("");
  });

  it("stays the same when the step is opened again for the same name, and follows a new name", () => {
    expect(usernameFor("meena.singh_41", "Meena Singh", () => 0)).toBe("meena.singh_41");
    expect(usernameFor("meena.singh_41", "Meena Rathore", () => 0)).toBe("meena.rathore_10");
    expect(usernameFor("", "Meena Singh", () => 0)).toBe("meena.singh_10");
    expect(usernameFor("meena.singh_41", "", () => 0)).toBe("");
  });
});

describe("the joining date in one click", () => {
  it("offers today, tomorrow, next Monday and the 1st of next month", () => {
    // 3 November 2026 is a Tuesday.
    expect(joiningShortcuts("2026-11-03")).toEqual([
      { label: "Today", value: "2026-11-03" },
      { label: "Tomorrow", value: "2026-11-04" },
      { label: "Next Monday", value: "2026-11-09" },
      { label: "1 Dec", value: "2026-12-01" },
    ]);
  });

  it("gives a Monday the Monday after it, and never offers the same day twice", () => {
    // 30 November 2026 is a Monday: tomorrow is also the 1st of next month.
    expect(joiningShortcuts("2026-11-30")).toEqual([
      { label: "Today", value: "2026-11-30" },
      { label: "Tomorrow", value: "2026-12-01" },
      { label: "Next Monday", value: "2026-12-07" },
    ]);
    // 31 December 2026 is a Thursday: next month is in the next year.
    expect(joiningShortcuts("2026-12-31").map((s) => s.value)).toEqual(["2026-12-31", "2027-01-01", "2027-01-04"]);
    // A Sunday: tomorrow is next Monday.
    expect(joiningShortcuts("2026-11-08").map((s) => s.label)).toEqual(["Today", "Tomorrow", "1 Dec"]);
  });
});

describe("a box that takes only digits", () => {
  it("drops everything else and keeps at most so many", () => {
    expect(onlyDigits(6)("46a2 0019")).toBe("462001");
    expect(onlyDigits(2)("1e5")).toBe("15");
    expect(onlyDigits(2)("-3")).toBe("3");
    expect(onlyDigits(2)("")).toBe("");
  });
});

describe("the password the school can have made", () => {
  it("passes the password rules every time, is 10 characters, and is different each time", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 200; i++) {
      const password = generatePassword();
      expect(password).toHaveLength(10);
      expect(isPasswordValid(password), password).toBe(true);
      seen.add(password);
    }
    expect(seen.size).toBeGreaterThan(190);
  });

  it("leaves out the characters that are mistaken for each other when read out or written down", () => {
    for (let i = 0; i < 200; i++) expect(generatePassword()).not.toMatch(/[0OIl1o]/);
  });
});
