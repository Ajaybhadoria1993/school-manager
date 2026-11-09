import { describe, expect, it } from "vitest";
import {
  assignTeacherColumn,
  autoMapTeachers,
  crossCheckTeachers,
  emptyTeacherMapping,
  inTeacherParts,
  loginsCsv,
  normaliseTeacherCell,
  prepareTeacherRow,
  serverTeacherProblem,
  teacherColumnsToAdd,
  teacherFieldsByColumn,
  teacherHeading,
  type TeacherImportField,
  type TeacherMapping,
} from "../teacherImport";

const TEMPLATE = [
  "Name *",
  "Mobile *",
  "Gender",
  "Date of Birth",
  "Email",
  "Address",
  "City",
  "State",
  "PIN Code",
  "Employee Code",
  "Designation",
  "Qualification",
  "Experience (years)",
  "Joining Date",
  "Employment Type",
  "Subjects",
  "Username",
  "Password",
];
const FIELDS: TeacherImportField[] = [
  "name",
  "mobile",
  "gender",
  "dateOfBirth",
  "email",
  "address",
  "city",
  "state",
  "pincode",
  "employeeCode",
  "designation",
  "qualification",
  "experienceYears",
  "joiningDate",
  "employmentType",
  "subjects",
  "username",
  "password",
];

/** A file whose columns are `fields` in order, as the table reads it. */
const mappingOf = (fields: TeacherImportField[]): TeacherMapping => fields.reduce((m, f, i) => assignTeacherColumn(m, i, f), emptyTeacherMapping());
const prepare = (fields: TeacherImportField[], cells: string[], known: string[] = []) =>
  prepareTeacherRow({ row: 3, cells }, mappingOf(fields), new Set(known.map((k) => k.toLowerCase())));
const messages = (p: ReturnType<typeof prepare>) => p.problems.map((x) => `${x.label}: ${x.message}`);

describe("recognising the columns of a file", () => {
  it("finds every column of the sample file by its title (the star is ignored)", () => {
    const mapping = autoMapTeachers(TEMPLATE);
    expect(FIELDS.map((f) => mapping[f])).toEqual(FIELDS.map((_, i) => i));
  });

  it("finds a school's own titles: Teacher Name, Phone No., Sex, DOB, E-mail, Emp Code, Post, DOJ, Job Type, Subject", () => {
    const mapping = autoMapTeachers(["S.No", "Teacher Name", "Phone No.", "Sex", "DOB", "E-mail", "Emp Code", "Post", "DOJ", "Job Type", "Subject", "Remarks"]);
    expect(mapping).toMatchObject({ name: 1, mobile: 2, gender: 3, dateOfBirth: 4, email: 5, employeeCode: 6, designation: 7, joiningDate: 8, employmentType: 9, subjects: 10 });
    expect(mapping.username).toBeNull();
    expect(teacherFieldsByColumn(mapping, 12)).toEqual([null, "name", "mobile", "gender", "dateOfBirth", "email", "employeeCode", "designation", "joiningDate", "employmentType", "subjects", null]);
  });

  it("gives a title to the first column that has it only, and a field to one column only", () => {
    const mapping = autoMapTeachers(["Name", "Name", "Mobile"]);
    expect(mapping.name).toBe(0);
    const moved = assignTeacherColumn(mapping, 1, "name");
    expect(moved.name).toBe(1);
    expect(teacherFieldsByColumn(moved, 3)).toEqual([null, "name", "mobile"]);
    expect(teacherFieldsByColumn(assignTeacherColumn(moved, 1, null), 3)).toEqual([null, null, "mobile"]);
  });

  it("adds an empty column for the name and the mobile number when the file has none, and for nothing else", () => {
    expect(teacherColumnsToAdd(autoMapTeachers(["Name", "Mobile", "Gender"]))).toEqual([]);
    expect(teacherColumnsToAdd(autoMapTeachers(["Gender", "Email", "Designation"]))).toEqual(["name", "mobile"]);
    expect(teacherColumnsToAdd(autoMapTeachers(["Name", "Gender", "Email"]))).toEqual(["mobile"]);
    expect(teacherHeading("name")).toBe("Name *");
    expect(teacherHeading("subjects")).toBe("Subjects");
  });
});

describe("what a cell becomes when it is kept", () => {
  it("shapes each kind of box the way the school writes it", () => {
    expect(normaliseTeacherCell("mobile", "+91 98765-43210")).toBe("9876543210");
    expect(normaliseTeacherCell("mobile", "9876543210.0")).toBe("9876543210");
    expect(normaliseTeacherCell("gender", "f")).toBe("Female");
    expect(normaliseTeacherCell("gender", "M")).toBe("Male");
    expect(normaliseTeacherCell("state", "mp")).toBe("Madhya Pradesh");
    expect(normaliseTeacherCell("employmentType", "full-time")).toBe("Full time");
    expect(normaliseTeacherCell("employmentType", "PT")).toBe("Part time");
    expect(normaliseTeacherCell("employmentType", "Contractual")).toBe("Contract");
    expect(normaliseTeacherCell("dateOfBirth", "1988-05-14")).toBe("14-05-1988");
    expect(normaliseTeacherCell("dateOfBirth", "14/5/1988")).toBe("14-05-1988");
    expect(normaliseTeacherCell("employeeCode", " emp-014 ")).toBe("EMP-014");
    expect(normaliseTeacherCell("experienceYears", "12 years")).toBe("12");
    expect(normaliseTeacherCell("name", "  Meena   Singh ")).toBe("Meena Singh");
    expect(normaliseTeacherCell("username", " Meena.S ")).toBe("meena.s");
    expect(normaliseTeacherCell("subjects", "maths ,  science;English")).toBe("maths, science, English");
  });

  it("leaves what it cannot read as it is, for the row to say what is wrong", () => {
    expect(normaliseTeacherCell("gender", "robot")).toBe("robot");
    expect(normaliseTeacherCell("state", "Atlantis")).toBe("Atlantis");
    expect(normaliseTeacherCell("employmentType", "sometimes")).toBe("sometimes");
    expect(normaliseTeacherCell("dateOfBirth", "someday")).toBe("someday");
    expect(normaliseTeacherCell("experienceYears", "many")).toBe("many");
    expect(normaliseTeacherCell("password", "  keep  ")).toBe("  keep  ");
  });
});

describe("a row of the file as a teacher", () => {
  it("is ready when it has a name and a mobile number, and sends only what the file gave", () => {
    const p = prepare(["name", "mobile"], ["  Meena   Singh ", "+91 98765 43210"]);
    expect(p.problems).toEqual([]);
    expect(p.name).toBe("Meena Singh");
    expect(p.input).toEqual({ row: 3, teacher: { name: "Meena Singh", mobile: "9876543210" }, subjectNames: [] });
  });

  it("keeps every box in the form the server takes", () => {
    const p = prepare(
      FIELDS,
      ["Meena Singh", "9876543210", "f", "14/05/1988", "Meena@School.Example", "12 MG Road", "Bhopal", "mp", "462001", "emp-014", "PGT (Post graduate teacher)", "M.Sc., B.Ed.", "12 years", "01-06-2015", "full time", "Maths, Science", "Meena.S", "Sch00l@Teach1"]
    );
    expect(p.problems).toEqual([]);
    expect(p.input).toEqual({
      row: 3,
      teacher: {
        name: "Meena Singh",
        mobile: "9876543210",
        gender: "Female",
        dateOfBirth: "1988-05-14",
        email: "meena@school.example",
        address: { line1: "12 MG Road", city: "Bhopal", state: "Madhya Pradesh", pincode: "462001" },
        employeeCode: "EMP-014",
        designation: "PGT (Post graduate teacher)",
        qualification: "M.Sc., B.Ed.",
        experienceYears: 12,
        joiningDate: "2015-06-01",
        employmentType: "full_time",
      },
      subjectNames: ["Maths", "Science"],
      username: "meena.s",
      password: "Sch00l@Teach1",
    });
  });

  it("says what is wrong by detail, in the words of Add teacher", () => {
    expect(messages(prepare(["name", "mobile"], ["", "9876543210"]))).toEqual(["Name: Enter the teacher's name"]);
    expect(messages(prepare(["name", "mobile"], ["Meena", ""]))).toEqual(["Mobile: Enter the teacher's mobile number: their login needs it"]);
    expect(messages(prepare(["name", "mobile"], ["Meena", "12345"]))).toEqual(["Mobile: Enter a 10-digit mobile number starting with 6, 7, 8 or 9"]);
    const rest = (field: TeacherImportField, value: string) => messages(prepare(["name", "mobile", field], ["Meena", "9876543210", value]));
    expect(rest("email", "not-an-email")).toEqual(["Email: Enter a valid email address"]);
    expect(rest("dateOfBirth", "01-01-2015")).toEqual(["Date of birth: A teacher must be 18 to 75 years old"]);
    expect(rest("dateOfBirth", "31-02-1988")).toEqual(["Date of birth: Choose a valid date of birth"]);
    expect(rest("joiningDate", "01-01-2099")).toEqual(["Joining date: The joining date cannot be more than a year ahead"]);
    expect(rest("pincode", "46200")).toEqual(["PIN code: PIN code is 6 digits"]);
    expect(rest("experienceYears", "many")).toEqual(["Experience: Experience is 0 to 60 whole years"]);
    expect(rest("gender", "robot")).toEqual(["Gender: Choose the gender"]);
    expect(rest("state", "Atlantis")).toEqual(["State: Choose the state"]);
    expect(rest("employmentType", "sometimes")).toEqual(["Employment type: Choose full time, part time or contract"]);
    expect(rest("employeeCode", "emp 14!")).toEqual(["Employee code: The employee code is letters, digits and - only, up to 20"]);
    expect(rest("username", "9bad name")).toEqual(["Username: A username is 3 to 30 letters, digits, dots or underscores, starting with a letter"]);
    expect(rest("password", "weak")).toEqual(["Password: Password must be 8-72 characters with an uppercase letter, a lowercase letter, a number and a special character"]);
    expect(rest("designation", "x".repeat(61))).toEqual(["Designation: Keep the designation under 60 characters"]);
    expect(rest("address", "12 <b>Road")).toEqual(["Address: The address cannot contain < or >"]);
    // The problem knows its box, so the table can take the person there.
    expect(prepare(["name", "mobile", "email"], ["Meena", "9876543210", "x"]).problems[0].fields).toEqual(["email"]);
  });

  it("splits the subjects and says which are new to the school (a warning, never a problem)", () => {
    const p = prepare(["name", "mobile", "subjects"], ["Meena", "9876543210", "Maths ; science, Sanskrit / maths"], ["Maths", "Science"]);
    expect(p.problems).toEqual([]);
    expect(p.subjects).toEqual(["Maths", "science", "Sanskrit"]);
    expect(p.input.subjectNames).toEqual(["Maths", "science", "Sanskrit"]);
    expect(p.warnings).toEqual(["New subject, added to your school: Sanskrit"]);
    expect(prepare(["name", "mobile", "subjects"], ["Meena", "9876543210", "Maths"], ["maths"]).warnings).toEqual([]);
  });

  it("refuses more subjects than a teacher may have", () => {
    const many = Array.from({ length: 31 }, (_, i) => `Subject ${i}`).join(", ");
    expect(messages(prepare(["name", "mobile", "subjects"], ["Meena", "9876543210", many]))).toEqual(["Subjects: Up to 30 subjects"]);
  });

  it("does not need a login box: no username and no password is sent when the file has none", () => {
    const p = prepare(["name", "mobile", "username", "password"], ["Meena", "9876543210", "", ""]);
    expect(p.input).not.toHaveProperty("username");
    expect(p.input).not.toHaveProperty("password");
  });

  it("reads a row whose columns are in another order, and ignores a column it does not know", () => {
    const mapping = autoMapTeachers(["S.No", "Phone", "Teacher Name", "Remarks"]);
    const p = prepareTeacherRow({ row: 7, cells: ["1", "98765 43210", "Dev Patel", "left in May"] }, mapping, new Set());
    expect(p.input).toEqual({ row: 7, teacher: { name: "Dev Patel", mobile: "9876543210" }, subjectNames: [] });
  });
});

describe("the same teacher twice in one file", () => {
  it("marks the later row, not the first: the same mobile number, employee code, username or email", () => {
    const row = (n: number, cells: string[]) => prepareTeacherRow({ row: n, cells }, mappingOf(["name", "mobile", "employeeCode", "username", "email"]), new Set());
    const rows = [
      row(3, ["Meena Singh", "9876543210", "EMP-1", "meena.s", "m@school.example"]),
      row(4, ["Another", "98765 43210", "EMP-2", "another", "a@school.example"]),
      row(5, ["Third", "9876543299", "emp-1", "Meena.S", "M@school.example"]),
      row(6, ["Fourth", "9876543298", "EMP-4", "fourth", "f@school.example"]),
    ];
    const crossed = crossCheckTeachers(rows);
    expect(crossed.has(3)).toBe(false);
    expect(crossed.get(4)).toEqual([{ label: "Mobile", message: "Same mobile number as row 3", fields: ["mobile"] }]);
    expect(crossed.get(5)?.map((p) => p.label).sort()).toEqual(["Email", "Employee code", "Username"]);
    expect(crossed.get(5)?.find((p) => p.label === "Username")?.message).toBe("Same username as row 3");
    expect(crossed.has(6)).toBe(false);
  });

  it("counts the rows already uploaded from the same file first (they are passed ahead)", () => {
    const one = (n: number) => prepareTeacherRow({ row: n, cells: ["Meena", "9876543210"] }, mappingOf(["name", "mobile"]), new Set());
    const crossed = crossCheckTeachers([one(2), one(9)]);
    expect(crossed.get(9)?.[0].message).toBe("Same mobile number as row 2");
  });
});

describe("what the server says about a row", () => {
  it("is put in the box it names, in words that name the detail", () => {
    expect(serverTeacherProblem("mobile", "Meena Singh already has this mobile number")).toEqual({ label: "Mobile", message: "Meena Singh already has this mobile number", fields: ["mobile"] });
    expect(serverTeacherProblem("address.pincode", "PIN code is 6 digits")).toMatchObject({ label: "PIN code", fields: ["pincode"] });
    expect(serverTeacherProblem("address.line1", "x")).toMatchObject({ label: "Address", fields: ["address"] });
    expect(serverTeacherProblem("username", "This username is taken")).toMatchObject({ label: "Username", fields: ["username"] });
    expect(serverTeacherProblem("employeeCode", "x")).toMatchObject({ label: "Employee code", fields: ["employeeCode"] });
    expect(serverTeacherProblem("subjects", "x")).toMatchObject({ label: "Subjects", fields: ["subjects"] });
    expect(serverTeacherProblem("", "A school can have up to 300 teachers.")).toEqual({ label: "Row", message: "A school can have up to 300 teachers.", fields: [] });
  });
});

describe("the files the page makes", () => {
  it("lists the logins to hand out as a CSV Excel opens (UTF-8 mark, quoted when needed)", async () => {
    const blob = loginsCsv(
      [
        { name: "Meena Singh", mobile: "9876543210", username: "meena.singh_41", password: "Ab3$xyzPqr" },
        { name: 'Dev "D" Patel, Sr', mobile: "9876500000", username: "dev.patel_12", password: "Zz9@kkkkkk" },
      ],
      "https://school.example/login"
    );
    expect(blob.type).toContain("text/csv");
    // jsdom has no Blob.text(): the bytes are read, and the first three are the UTF-8 byte-order mark.
    const bytes = new Uint8Array(
      await new Promise<ArrayBuffer>((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as ArrayBuffer);
        reader.readAsArrayBuffer(blob);
      })
    );
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    expect(new TextDecoder().decode(bytes.slice(3)).split("\r\n")).toEqual([
      "Name,Mobile,Username,Password,Sign in at",
      "Meena Singh,9876543210,meena.singh_41,Ab3$xyzPqr,https://school.example/login",
      '"Dev ""D"" Patel, Sr",9876500000,dev.patel_12,Zz9@kkkkkk,https://school.example/login',
    ]);
  });

  it("sends a file in parts of 10 rows (a request makes a login, and so a password's hash, for each)", () => {
    const rows = Array.from({ length: 23 }, (_, i) => i);
    expect(inTeacherParts(rows).map((part) => part.length)).toEqual([10, 10, 3]);
    expect(inTeacherParts([])).toEqual([]);
  });
});
