import { Tenant } from "../../src/models/Tenant";
import { Branch } from "../../src/models/Branch";
import { AcademicYear } from "../../src/models/AcademicYear";
import { ClassMaster, Section, Subject } from "../../src/models/ClassSection";
import { User, hashPassword } from "../../src/models/User";
import { Staff } from "../../src/models/Staff";
import { Guardian } from "../../src/models/Guardian";
import { Student } from "../../src/models/Student";
import { signToken } from "../../src/utils/jwt";

export const PASSWORD = "Password@123";

/**
 * One full, minimal school setup (tenant/branch/year/class/section/subject +
 * one user per role + one student with one guardian), reused as the base
 * fixture across test files so each suite only adds what's specific to it.
 */
export async function buildBaseFixture() {
  const tenant = await Tenant.create({
    name: "Test School Trust",
    slug: `test-school-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    contactEmail: "admin@test.school",
    contactPhone: "9000000000",
  });

  const branch = await Branch.create({
    tenantId: tenant._id,
    name: "Test Main Campus",
    code: "TMC",
    board: "CBSE",
  });

  const academicYear = await AcademicYear.create({
    tenantId: tenant._id,
    branchId: branch._id,
    name: "2026-27",
    startDate: new Date("2026-04-01"),
    endDate: new Date("2027-03-31"),
    isActive: true,
  });

  const classMaster = await ClassMaster.create({ tenantId: tenant._id, branchId: branch._id, name: "Class 6", order: 0 });
  const section = await Section.create({ tenantId: tenant._id, branchId: branch._id, classId: classMaster._id, name: "A" });
  const subject = await Subject.create({ tenantId: tenant._id, branchId: branch._id, classId: classMaster._id, name: "Mathematics" });

  const passwordHash = await hashPassword(PASSWORD);

  async function makeUser(role: string, email: string, extra: Record<string, unknown> = {}) {
    const user = await User.create({
      name: `Test ${role}`,
      email,
      passwordHash,
      role,
      tenantId: tenant._id,
      branchId: branch._id,
      ...extra,
    });
    const token = signToken({
      userId: user._id.toString(),
      role,
      tenantId: tenant._id.toString(),
      branchId: branch._id.toString(),
    });
    return { user, token };
  }

  const schoolAdmin = await makeUser("school_admin", "school_admin@test.school");
  const principal = await makeUser("principal", "principal@test.school");
  const accountant = await makeUser("accountant", "accountant@test.school");

  const teacherStaff = await Staff.create({
    tenantId: tenant._id,
    branchId: branch._id,
    employeeId: "EMP-TEST-1",
    name: "Test Teacher",
    category: "teaching",
    designation: "TGT",
    phone: "9111111111",
  });
  const teacher = await makeUser("teacher", "teacher@test.school", { staffProfileId: teacherStaff._id });

  const guardian = await Guardian.create({
    tenantId: tenant._id,
    name: "Test Guardian",
    relation: "Father",
    phone: "9222222222",
    isPrimary: true,
  });

  const student = await Student.create({
    tenantId: tenant._id,
    branchId: branch._id,
    academicYearId: academicYear._id,
    classId: classMaster._id,
    sectionId: section._id,
    admissionNumber: "ADM-TEST-0001",
    enrollmentNumber: "ENR-TEST-0001",
    firstName: "Test",
    lastName: "Student",
    dob: new Date("2015-01-01"),
    gender: "male",
    guardians: [{ guardianId: guardian._id, relation: "Father" }],
    status: "active",
  });
  guardian.studentIds = [student._id];
  await guardian.save();

  const parent = await makeUser("parent", "parent@test.school", { guardianProfileId: guardian._id });
  guardian.userId = parent.user._id;
  await guardian.save();

  return {
    tenant,
    branch,
    academicYear,
    classMaster,
    section,
    subject,
    schoolAdmin,
    principal,
    accountant,
    teacher,
    teacherStaff,
    parent,
    guardian,
    student,
  };
}

export type BaseFixture = Awaited<ReturnType<typeof buildBaseFixture>>;

/** Second, unrelated family in the SAME school — for cross-family isolation tests. */
export async function buildSecondFamily(fixture: BaseFixture) {
  const passwordHash = await hashPassword(PASSWORD);
  const guardian = await Guardian.create({
    tenantId: fixture.tenant._id,
    name: "Other Guardian",
    relation: "Mother",
    phone: "9333333333",
    isPrimary: true,
  });
  const student = await Student.create({
    tenantId: fixture.tenant._id,
    branchId: fixture.branch._id,
    academicYearId: fixture.academicYear._id,
    classId: fixture.classMaster._id,
    sectionId: fixture.section._id,
    admissionNumber: "ADM-TEST-0002",
    enrollmentNumber: "ENR-TEST-0002",
    firstName: "Other",
    lastName: "Student",
    dob: new Date("2015-06-01"),
    gender: "female",
    guardians: [{ guardianId: guardian._id, relation: "Mother" }],
    status: "active",
  });
  guardian.studentIds = [student._id];
  await guardian.save();

  const user = await User.create({
    name: "Other Parent",
    email: "other_parent@test.school",
    passwordHash,
    role: "parent",
    tenantId: fixture.tenant._id,
    branchId: fixture.branch._id,
    guardianProfileId: guardian._id,
  });
  guardian.userId = user._id;
  await guardian.save();
  const token = signToken({
    userId: user._id.toString(),
    role: "parent",
    tenantId: fixture.tenant._id.toString(),
    branchId: fixture.branch._id.toString(),
  });

  return { guardian, student, parent: { user, token } };
}
