import { connectDB } from "../config/db";
import { Tenant } from "../models/Tenant";
import { Branch } from "../models/Branch";
import { AcademicYear } from "../models/AcademicYear";
import { ClassMaster, Section, Subject } from "../models/ClassSection";
import { User, hashPassword } from "../models/User";
import { Staff, TeacherAllocation } from "../models/Staff";
import { Guardian } from "../models/Guardian";
import { Student } from "../models/Student";
import { FeeHead, FeeStructure, FeeRefund } from "../models/Fee";
import { LeaveRequest, LeaveBalance, Substitution } from "../models/Leave";
import { TimetableSlot } from "../models/Timetable";
import { Homework } from "../models/Homework";
import { Exam, ExamSubject, Mark, ReportCard } from "../models/Exam";
import { Notice, NoticeRead } from "../models/Notice";
import { Conversation, Message } from "../models/Message";
import { Certificate } from "../models/Certificate";
import { generateAdmissionNumber, generateEnrollmentNumber } from "../utils/numbering";
import mongoose from "mongoose";

async function seed() {
  await connectDB();
  console.log("[seed] connected, clearing existing demo data...");

  await Promise.all([
    Tenant.deleteMany({}),
    Branch.deleteMany({}),
    AcademicYear.deleteMany({}),
    ClassMaster.deleteMany({}),
    Section.deleteMany({}),
    Subject.deleteMany({}),
    User.deleteMany({}),
    Staff.deleteMany({}),
    TeacherAllocation.deleteMany({}),
    Guardian.deleteMany({}),
    Student.deleteMany({}),
    FeeHead.deleteMany({}),
    FeeStructure.deleteMany({}),
    LeaveRequest.deleteMany({}),
    LeaveBalance.deleteMany({}),
    Substitution.deleteMany({}),
    TimetableSlot.deleteMany({}),
    Homework.deleteMany({}),
    Exam.deleteMany({}),
    ExamSubject.deleteMany({}),
    Mark.deleteMany({}),
    ReportCard.deleteMany({}),
    Notice.deleteMany({}),
    NoticeRead.deleteMany({}),
    Conversation.deleteMany({}),
    Message.deleteMany({}),
    Certificate.deleteMany({}),
    FeeRefund.deleteMany({}),
  ]);

  // ---- Super Admin (platform level, no tenant) ----
  const superAdminPassword = await hashPassword("SuperAdmin@123");
  await User.create({
    name: "Platform Super Admin",
    email: "superadmin@schoolerp.dev",
    passwordHash: superAdminPassword,
    role: "super_admin",
    tenantId: null,
    branchId: null,
  });

  // ---- Demo Tenant + Branch ----
  const tenant = await Tenant.create({
    name: "Sunrise Public School Trust",
    slug: "sunrise-public-school-trust",
    subscriptionTier: "standard",
    contactEmail: "admin@sunriseschool.in",
    contactPhone: "9876543210",
  });

  const branch = await Branch.create({
    tenantId: tenant._id,
    name: "Sunrise Public School - Main Campus",
    code: "MAIN",
    board: "CBSE",
    udisePlusCode: "23456789012",
    registrationNumber: "REG/2010/00123",
    address: { line1: "123 MG Road", city: "Pune", state: "Maharashtra", pincode: "411001" },
  });

  const academicYear = await AcademicYear.create({
    tenantId: tenant._id,
    branchId: branch._id,
    name: "2026-27",
    startDate: new Date("2026-04-01"),
    endDate: new Date("2027-03-31"),
    terms: [
      { name: "Term 1", startDate: new Date("2026-04-01"), endDate: new Date("2026-09-30") },
      { name: "Term 2", startDate: new Date("2026-10-01"), endDate: new Date("2027-03-31") },
    ],
    isActive: true,
  });

  // ---- Classes / Sections / Subjects ----
  const classNames = ["Class 5", "Class 6", "Class 8"];
  const classDocs: Record<string, mongoose.Types.ObjectId> = {};
  for (let i = 0; i < classNames.length; i++) {
    const c = await ClassMaster.create({ tenantId: tenant._id, branchId: branch._id, name: classNames[i], order: i });
    classDocs[classNames[i]] = c._id;
  }

  const sectionDocs: Record<string, mongoose.Types.ObjectId> = {};
  for (const className of classNames) {
    for (const sec of ["A", "B"]) {
      const s = await Section.create({
        tenantId: tenant._id,
        branchId: branch._id,
        classId: classDocs[className],
        name: sec,
      });
      sectionDocs[`${className}-${sec}`] = s._id;
    }
  }

  const subjectDocs: Record<string, mongoose.Types.ObjectId> = {};
  for (const className of classNames) {
    for (const subj of ["Mathematics", "Science", "English", "Social Studies"]) {
      const doc = await Subject.create({ tenantId: tenant._id, branchId: branch._id, classId: classDocs[className], name: subj });
      subjectDocs[`${className}-${subj}`] = doc._id;
    }
  }

  // ---- School Admin, Principal, Accountant, Teacher logins ----
  const password = await hashPassword("Password@123");
  const schoolAdmin = await User.create({
    name: "Anita Deshmukh",
    email: "admin@sunriseschool.in",
    phone: "9876543211",
    passwordHash: password,
    role: "school_admin",
    tenantId: tenant._id,
    branchId: branch._id,
  });

  await User.create({
    name: "Dr. V. K. Nair",
    email: "principal@sunriseschool.in",
    phone: "9876543212",
    passwordHash: password,
    role: "principal",
    tenantId: tenant._id,
    branchId: branch._id,
  });

  await User.create({
    name: "Sunita Verma",
    email: "accountant@sunriseschool.in",
    phone: "9876543213",
    passwordHash: password,
    role: "accountant",
    tenantId: tenant._id,
    branchId: branch._id,
  });

  const teacherStaff = await Staff.create({
    tenantId: tenant._id,
    branchId: branch._id,
    employeeId: "EMP-0001",
    name: "Rajesh Kumar",
    category: "teaching",
    designation: "TGT - Mathematics",
    phone: "9876543214",
    email: "teacher@sunriseschool.in",
    qualification: "M.Sc, B.Ed",
  });

  const teacherUser = await User.create({
    name: "Rajesh Kumar",
    email: "teacher@sunriseschool.in",
    phone: "9876543214",
    passwordHash: password,
    role: "teacher",
    tenantId: tenant._id,
    branchId: branch._id,
    staffProfileId: teacherStaff._id,
  });
  void teacherUser;

  // Second teacher, kept login-less, so the substitute-teacher pool isn't empty.
  const substituteStaff = await Staff.create({
    tenantId: tenant._id,
    branchId: branch._id,
    employeeId: "EMP-0002",
    name: "Meera Iyer",
    category: "teaching",
    designation: "TGT - Science",
    phone: "9876543215",
    qualification: "M.Sc, B.Ed",
  });

  // Rajesh's teaching allocations, so Leave -> Substitute has real data to demo.
  await TeacherAllocation.create([
    {
      tenantId: tenant._id,
      branchId: branch._id,
      staffId: teacherStaff._id,
      classId: classDocs["Class 6"],
      sectionId: sectionDocs["Class 6-A"],
      subjectId: subjectDocs["Class 6-Mathematics"],
      isClassTeacher: true,
    },
    {
      tenantId: tenant._id,
      branchId: branch._id,
      staffId: teacherStaff._id,
      classId: classDocs["Class 8"],
      sectionId: sectionDocs["Class 8-A"],
      subjectId: subjectDocs["Class 8-Mathematics"],
      isClassTeacher: false,
    },
  ]);

  // ---- Guardian + Parent login (2 siblings, same parent, S-2.1) ----
  const guardian = await Guardian.create({
    tenantId: tenant._id,
    name: "Priya Sharma",
    relation: "Mother",
    phone: "9876500001",
    email: "priya.sharma@example.com",
    isPrimary: true,
  });

  const parentUser = await User.create({
    name: "Priya Sharma",
    email: "parent@sunriseschool.in",
    phone: "9876500001",
    passwordHash: password,
    role: "parent",
    tenantId: tenant._id,
    branchId: branch._id,
    guardianProfileId: guardian._id,
  });
  guardian.userId = parentUser._id;

  // ---- Fee Heads + Fee Structure for Class 6 ----
  const tuitionHead = await FeeHead.create({ tenantId: tenant._id, branchId: branch._id, name: "Tuition Fee" });
  const labHead = await FeeHead.create({ tenantId: tenant._id, branchId: branch._id, name: "Computer Lab Fee" });
  const devHead = await FeeHead.create({ tenantId: tenant._id, branchId: branch._id, name: "Development Fund" });

  for (const className of classNames) {
    await FeeStructure.create({
      tenantId: tenant._id,
      branchId: branch._id,
      classId: classDocs[className],
      academicYearId: academicYear._id,
      name: "Standard Fee Structure",
      installments: [
        {
          name: "Term 1",
          dueDate: new Date("2026-06-15"),
          items: [
            { feeHeadId: tuitionHead._id, amount: 15000 },
            { feeHeadId: labHead._id, amount: 2000 },
            { feeHeadId: devHead._id, amount: 3000 },
          ],
        },
        {
          name: "Term 2",
          dueDate: new Date("2026-12-15"),
          items: [
            { feeHeadId: tuitionHead._id, amount: 15000 },
            { feeHeadId: labHead._id, amount: 2000 },
          ],
        },
      ],
    });
  }

  // ---- Students (siblings Rohan Class 6-A and Ananya Class 5... wait use Class 6/8 per scenario) ----
  const rohanAdm = await generateAdmissionNumber(branch._id.toString(), academicYear.name);
  const rohanEnr = await generateEnrollmentNumber(branch._id.toString(), academicYear.name);
  const rohan = await Student.create({
    tenantId: tenant._id,
    branchId: branch._id,
    academicYearId: academicYear._id,
    classId: classDocs["Class 6"],
    sectionId: sectionDocs["Class 6-A"],
    admissionNumber: rohanAdm,
    enrollmentNumber: rohanEnr,
    rollNumber: "12",
    firstName: "Rohan",
    lastName: "Sharma",
    dob: new Date("2015-05-12"),
    gender: "male",
    category: "General",
    house: "Blue House",
    apaarConsent: { granted: true, guardianName: "Priya Sharma", consentedAt: new Date() },
    guardians: [{ guardianId: guardian._id, relation: "Mother" }],
    status: "active",
  });

  const ananyaAdm = await generateAdmissionNumber(branch._id.toString(), academicYear.name);
  const ananyaEnr = await generateEnrollmentNumber(branch._id.toString(), academicYear.name);
  const ananya = await Student.create({
    tenantId: tenant._id,
    branchId: branch._id,
    academicYearId: academicYear._id,
    classId: classDocs["Class 5"],
    sectionId: sectionDocs["Class 5-B"],
    admissionNumber: ananyaAdm,
    enrollmentNumber: ananyaEnr,
    rollNumber: "07",
    firstName: "Ananya",
    lastName: "Sharma",
    dob: new Date("2017-02-20"),
    gender: "female",
    category: "General",
    house: "Green House",
    apaarConsent: { granted: true, guardianName: "Priya Sharma", consentedAt: new Date() },
    guardians: [{ guardianId: guardian._id, relation: "Mother" }],
    status: "active",
  });

  guardian.studentIds = [rohan._id, ananya._id];
  await guardian.save();

  // a few more students for a fuller class list
  const extraNames = [
    ["Kabir", "Mehta", "male"],
    ["Ishita", "Rao", "female"],
    ["Arjun", "Patel", "male"],
    ["Diya", "Singh", "female"],
  ] as const;
  for (const [first, last, gender] of extraNames) {
    const adm = await generateAdmissionNumber(branch._id.toString(), academicYear.name);
    const enr = await generateEnrollmentNumber(branch._id.toString(), academicYear.name);
    const g = await Guardian.create({
      tenantId: tenant._id,
      name: `${first === "Kabir" ? "Meena" : "Ravi"} ${last}`,
      relation: "Parent",
      phone: `98765${Math.floor(10000 + Math.random() * 89999)}`,
      isPrimary: true,
    });
    const student = await Student.create({
      tenantId: tenant._id,
      branchId: branch._id,
      academicYearId: academicYear._id,
      classId: classDocs["Class 6"],
      sectionId: sectionDocs["Class 6-A"],
      admissionNumber: adm,
      enrollmentNumber: enr,
      firstName: first,
      lastName: last,
      dob: new Date("2015-01-01"),
      gender,
      guardians: [{ guardianId: g._id, relation: "Parent" }],
      status: "active",
    });
    g.studentIds = [student._id];
    await g.save();
  }

  // ---- A few timetable slots + a homework item for Class 6-A ----
  await TimetableSlot.create([
    {
      tenantId: tenant._id,
      branchId: branch._id,
      academicYearId: academicYear._id,
      sectionId: sectionDocs["Class 6-A"],
      dayOfWeek: 1,
      periodNumber: 1,
      startTime: "09:00",
      endTime: "09:40",
      subjectId: subjectDocs["Class 6-Mathematics"],
      staffId: teacherStaff._id,
    },
    {
      tenantId: tenant._id,
      branchId: branch._id,
      academicYearId: academicYear._id,
      sectionId: sectionDocs["Class 6-A"],
      dayOfWeek: 1,
      periodNumber: 2,
      startTime: "09:40",
      endTime: "10:20",
      isBreak: true,
    },
  ]);

  await Homework.create({
    tenantId: tenant._id,
    branchId: branch._id,
    academicYearId: academicYear._id,
    classId: classDocs["Class 6"],
    sectionId: sectionDocs["Class 6-A"],
    subjectId: subjectDocs["Class 6-Mathematics"],
    title: "Chapter 4 — Fractions worksheet",
    description: "Complete Q1-Q10 from the textbook and bring it for correction tomorrow.",
    dueDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
    assignedBy: teacherStaff._id,
  });

  console.log("[seed] done.");
  console.log("----------------------------------------------------");
  console.log("Super Admin  : superadmin@schoolerp.dev / SuperAdmin@123");
  console.log("School Admin : admin@sunriseschool.in    / Password@123");
  console.log("Principal    : principal@sunriseschool.in/ Password@123");
  console.log("Accountant   : accountant@sunriseschool.in/Password@123");
  console.log("Teacher      : teacher@sunriseschool.in   / Password@123");
  console.log("Parent       : parent@sunriseschool.in    / Password@123");
  console.log("----------------------------------------------------");
  void schoolAdmin;

  await mongoose.disconnect();
  process.exit(0);
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
