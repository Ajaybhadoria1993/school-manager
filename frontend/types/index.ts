export type UserRole =
  | "super_admin"
  | "school_admin"
  | "principal"
  | "accountant"
  | "teacher"
  | "parent"
  | "student";

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  tenantId: string | null;
  branchId: string | null;
}

export interface UserAccount {
  _id: string;
  name: string;
  email: string;
  phone?: string;
  role: UserRole;
  isActive: boolean;
  staffProfileId?: { _id: string; name: string; designation: string } | string;
  guardianProfileId?: { _id: string; name: string; phone: string } | string;
  studentProfileId?: { _id: string; firstName: string; lastName: string; admissionNumber: string } | string;
  createdAt: string;
}

export interface Tenant {
  _id: string;
  name: string;
  slug: string;
  subscriptionTier: "basic" | "standard" | "premium";
  isActive: boolean;
  modules: Record<string, boolean>;
  contactEmail: string;
  contactPhone: string;
  createdAt: string;
}

export interface Branch {
  _id: string;
  tenantId: string;
  name: string;
  code: string;
  board: string;
  udisePlusCode?: string;
  registrationNumber?: string;
  address?: { line1: string; city: string; state: string; pincode: string };
  isActive: boolean;
}

export interface AcademicYear {
  _id: string;
  branchId: string;
  name: string;
  startDate: string;
  endDate: string;
  isActive: boolean;
}

export interface ClassMaster {
  _id: string;
  name: string;
  order: number;
}

export interface Section {
  _id: string;
  classId: string;
  name: string;
}

export interface Subject {
  _id: string;
  classId: string;
  name: string;
  isElective: boolean;
}

export interface Guardian {
  _id: string;
  name: string;
  relation: string;
  phone: string;
  email?: string;
  userId?: string;
  studentIds?: { _id: string; firstName: string; lastName: string; admissionNumber: string }[];
}

export interface Student {
  _id: string;
  admissionNumber: string;
  enrollmentNumber: string;
  rollNumber?: string;
  firstName: string;
  lastName: string;
  dob: string;
  gender: "male" | "female" | "other";
  category?: string;
  house?: string;
  status: "active" | "inactive" | "alumni" | "transferred";
  classId: ClassMaster | string;
  sectionId: Section | string;
  guardians?: { guardianId: Guardian | string; relation: string }[];
  apaarId?: string;
  apaarConsent?: { granted: boolean; guardianName: string; consentedAt: string };
  branchId: string;
  academicYearId: string;
  createdAt: string;
}

export interface Staff {
  _id: string;
  employeeId: string;
  name: string;
  category: "teaching" | "admin" | "transport" | "support";
  designation: string;
  phone: string;
  email?: string;
  qualification?: string;
  isActive: boolean;
}

export type LeaveType = "casual" | "sick" | "earned" | "other";
export type LeaveStatus = "pending" | "approved" | "rejected" | "cancelled";

export interface LeaveRequest {
  _id: string;
  staffId: Staff | string;
  leaveType: LeaveType;
  startDate: string;
  endDate: string;
  reason: string;
  status: LeaveStatus;
  decisionNote?: string;
  decidedAt?: string;
  createdAt: string;
}

export interface LeaveBalance {
  _id: string;
  staffId: string;
  year: number;
  allocations: { leaveType: LeaveType; allocated: number; used: number }[];
}

export interface TeacherAllocation {
  _id: string;
  staffId: Staff | string;
  classId: ClassMaster | string;
  sectionId: Section | string;
  subjectId: Subject | string;
  isClassTeacher: boolean;
}

export interface Substitution {
  _id: string;
  leaveRequestId: string;
  originalStaffId: Staff | string;
  substituteStaffId: Staff | string;
  allocationId: TeacherAllocation | string;
  startDate: string;
  endDate: string;
}

export interface TimetableSlot {
  _id: string;
  sectionId: Section | string;
  dayOfWeek: number;
  periodNumber: number;
  startTime: string;
  endTime: string;
  isBreak: boolean;
  subjectId?: Subject | string;
  staffId?: Staff | string;
}

export interface Homework {
  _id: string;
  classId: ClassMaster | string;
  sectionId: Section | string;
  subjectId: Subject | string;
  title: string;
  description: string;
  attachmentUrl?: string;
  dueDate: string;
  assignedBy: Staff | string;
  publishedAt: string;
}

export type ExamType = "unit_test" | "mid_term" | "final" | "other";

export interface Exam {
  _id: string;
  classId: ClassMaster | string;
  academicYearId: string;
  name: string;
  examType: ExamType;
  startDate: string;
  endDate: string;
}

export interface ExamSubject {
  _id: string;
  examId: string;
  subjectId: Subject | string;
  examDate?: string;
  maxInternal: number;
  maxWritten: number;
  isLocked: boolean;
  lockedAt?: string;
}

export interface MarksSheetRow {
  studentId: string;
  name: string;
  rollNumber?: string;
  internalMarks: number;
  writtenMarks: number;
  isAbsent: boolean;
}

export interface ReportCardSubject {
  subjectName: string;
  maxInternal: number;
  maxWritten: number;
  internalMarks: number;
  writtenMarks: number;
  isAbsent: boolean;
  obtained: number | null;
  maxTotal: number;
  grade: string;
}

export interface ReportCardData {
  exam: Exam;
  student: { id: string; name: string; admissionNumber: string; className: string; sectionName: string };
  subjects: ReportCardSubject[];
  totals: { obtained: number; max: number; percentage: number; grade: string };
  attendancePercentage: number | null;
  status: "draft" | "published";
  teacherRemarks: string;
  publishedAt?: string;
}

export type CertificateType = "transfer" | "bonafide" | "fee_paid";

export interface Certificate {
  _id: string;
  studentId: Student | string;
  type: CertificateType;
  serialNumber: string;
  status: "issued" | "superseded";
  data: Record<string, string | number>;
  issuedAt: string;
  supersedes?: string;
  branchName?: string;
}

export type NoticeAudience = "all" | "class" | "section";

export interface Notice {
  _id: string;
  title: string;
  body: string;
  audienceType: NoticeAudience;
  classId?: string;
  sectionId?: string;
  createdBy: { name: string; role: string } | string;
  publishedAt: string;
}

export interface NoticeReadReceipts {
  totalEligible: number;
  totalRead: number;
  readers: { name: string; readAt: string }[];
}

export interface Conversation {
  _id: string;
  studentId: Student | string;
  teacherStaffId: Staff | string;
  guardianId: Guardian | string;
  subject: string;
  lastMessageAt: string;
}

export interface Message {
  _id: string;
  conversationId: string;
  senderUserId: { name: string; role: string } | string;
  senderRole: string;
  body: string;
  createdAt: string;
}

export type AttendanceStatus = "present" | "absent" | "late" | "half_day" | "excused";

export interface AttendanceRecord {
  _id: string;
  studentId: Student | string;
  date: string;
  status: AttendanceStatus;
  isBackfilled: boolean;
}

export interface FeeHead {
  _id: string;
  name: string;
  description?: string;
  isActive: boolean;
}

export interface FeeStructureInstallment {
  name: string;
  dueDate: string;
  items: { feeHeadId: FeeHead | string; amount: number }[];
}

export interface FeeStructure {
  _id: string;
  classId: ClassMaster | string;
  academicYearId: string;
  name: string;
  installments: FeeStructureInstallment[];
}

export type PaymentMode = "cash" | "cheque" | "dd" | "upi" | "card" | "netbanking";
export type TransactionStatus = "pending" | "success" | "failed" | "bounced" | "reversed";

export interface FeeTransaction {
  _id: string;
  studentId: Student | string;
  installmentName: string;
  amount: number;
  mode: PaymentMode;
  status: TransactionStatus;
  receiptNumber?: string;
  createdAt: string;
  chequeDetails?: {
    chequeNumber: string;
    bankName: string;
    bouncedAt?: string;
    bounceReason?: string;
    bounceFine?: number;
  };
}

export type RefundStatus = "pending" | "approved" | "rejected" | "processed";
export type RefundMode = "cash" | "bank_transfer" | "upi" | "cheque";

export interface FeeRefund {
  _id: string;
  studentId: Student | string;
  amount: number;
  reason: string;
  status: RefundStatus;
  decisionNote?: string;
  refundMode?: RefundMode;
  referenceNote?: string;
  createdAt: string;
  processedAt?: string;
}

export interface InstallmentBreakdown {
  name: string;
  dueDate: string;
  grossAmount: number;
  concessionAmount: number;
  netAmount: number;
  paidAmount: number;
  outstanding: number;
  isOverdue: boolean;
  status: "paid" | "partial" | "unpaid";
}

export interface StudentFeeSummary {
  feeStructureId: string | null;
  installments: InstallmentBreakdown[];
  totals: { gross: number; concession: number; net: number; paid: number; outstanding: number };
}

export interface ApiResponse<T> {
  success: boolean;
  data: T;
  message?: string;
  meta?: { total: number; page: number; limit: number };
}
