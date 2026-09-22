import { Schema, model, Types } from "mongoose";

// ---- Fee Head (Tuition, Admission, Lab, Transport, Development Fund, ...) ----
export interface IFeeHead {
  _id: Types.ObjectId;
  tenantId: Types.ObjectId;
  branchId: Types.ObjectId;
  name: string;
  description?: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const feeHeadSchema = new Schema<IFeeHead>(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: "Tenant", required: true, index: true },
    branchId: { type: Schema.Types.ObjectId, ref: "Branch", required: true, index: true },
    name: { type: String, required: true, trim: true },
    description: { type: String },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);
feeHeadSchema.index({ branchId: 1, name: 1 }, { unique: true });
export const FeeHead = model<IFeeHead>("FeeHead", feeHeadSchema);

// ---- Fee Structure: class-wise, per academic year, with installment schedule ----
export interface IFeeStructureInstallment {
  _id?: Types.ObjectId;
  name: string; // e.g. "Term 1"
  dueDate: Date;
  items: { feeHeadId: Types.ObjectId; amount: number }[];
}

export interface IFeeStructure {
  _id: Types.ObjectId;
  tenantId: Types.ObjectId;
  branchId: Types.ObjectId;
  classId: Types.ObjectId;
  academicYearId: Types.ObjectId;
  name: string;
  installments: IFeeStructureInstallment[];
  createdAt: Date;
  updatedAt: Date;
}

const feeStructureSchema = new Schema<IFeeStructure>(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: "Tenant", required: true, index: true },
    branchId: { type: Schema.Types.ObjectId, ref: "Branch", required: true, index: true },
    classId: { type: Schema.Types.ObjectId, ref: "ClassMaster", required: true, index: true },
    academicYearId: { type: Schema.Types.ObjectId, ref: "AcademicYear", required: true, index: true },
    name: { type: String, required: true, default: "Standard Fee Structure" },
    installments: [
      {
        name: { type: String, required: true },
        dueDate: { type: Date, required: true },
        items: [
          {
            feeHeadId: { type: Schema.Types.ObjectId, ref: "FeeHead", required: true },
            amount: { type: Number, required: true, min: 0 },
          },
        ],
      },
    ],
  },
  { timestamps: true }
);
feeStructureSchema.index({ branchId: 1, classId: 1, academicYearId: 1 }, { unique: true });
export const FeeStructure = model<IFeeStructure>("FeeStructure", feeStructureSchema);

// ---- Fee Concession / Scholarship (student-wise) ----
export type ConcessionType = "flat" | "percentage";

export interface IFeeConcession {
  _id: Types.ObjectId;
  tenantId: Types.ObjectId;
  branchId: Types.ObjectId;
  studentId: Types.ObjectId;
  academicYearId: Types.ObjectId;
  feeHeadId?: Types.ObjectId; // omitted = applies across all heads
  type: ConcessionType;
  value: number; // flat amount (INR) or percentage (0-100)
  reason: string;
  approvedBy: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const feeConcessionSchema = new Schema<IFeeConcession>(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: "Tenant", required: true, index: true },
    branchId: { type: Schema.Types.ObjectId, ref: "Branch", required: true, index: true },
    studentId: { type: Schema.Types.ObjectId, ref: "Student", required: true, index: true },
    academicYearId: { type: Schema.Types.ObjectId, ref: "AcademicYear", required: true },
    feeHeadId: { type: Schema.Types.ObjectId, ref: "FeeHead" },
    type: { type: String, enum: ["flat", "percentage"], required: true },
    value: { type: Number, required: true, min: 0 },
    reason: { type: String, required: true },
    approvedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true }
);
export const FeeConcession = model<IFeeConcession>("FeeConcession", feeConcessionSchema);

// ---- Fee Transaction (payment record - online & offline) ----
export type PaymentMode = "cash" | "cheque" | "dd" | "upi" | "card" | "netbanking";
export type TransactionStatus = "pending" | "success" | "failed" | "bounced" | "reversed";

export interface IFeeTransaction {
  _id: Types.ObjectId;
  tenantId: Types.ObjectId;
  branchId: Types.ObjectId;
  studentId: Types.ObjectId;
  academicYearId: Types.ObjectId;
  feeStructureId: Types.ObjectId;
  installmentName: string;
  amount: number;
  mode: PaymentMode;
  status: TransactionStatus;
  receiptNumber?: string;
  chequeDetails?: {
    chequeNumber: string;
    bankName: string;
    clearanceDate?: Date;
    bouncedAt?: Date;
    bounceReason?: string;
    bounceFine?: number;
  };
  gateway?: {
    provider: "razorpay";
    orderId?: string;
    paymentId?: string;
    signature?: string;
  };
  lateFee: number;
  lateFeeWaived: boolean;
  collectedBy?: Types.ObjectId; // accountant, for offline
  paidAt?: Date;
  remarks?: string;
  createdAt: Date;
  updatedAt: Date;
}

const feeTransactionSchema = new Schema<IFeeTransaction>(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: "Tenant", required: true, index: true },
    branchId: { type: Schema.Types.ObjectId, ref: "Branch", required: true, index: true },
    studentId: { type: Schema.Types.ObjectId, ref: "Student", required: true, index: true },
    academicYearId: { type: Schema.Types.ObjectId, ref: "AcademicYear", required: true },
    feeStructureId: { type: Schema.Types.ObjectId, ref: "FeeStructure", required: true },
    installmentName: { type: String, required: true },
    amount: { type: Number, required: true, min: 0 },
    mode: { type: String, enum: ["cash", "cheque", "dd", "upi", "card", "netbanking"], required: true },
    status: { type: String, enum: ["pending", "success", "failed", "bounced", "reversed"], default: "pending" },
    receiptNumber: { type: String },
    chequeDetails: {
      chequeNumber: { type: String },
      bankName: { type: String },
      clearanceDate: { type: Date },
      bouncedAt: { type: Date },
      bounceReason: { type: String },
      bounceFine: { type: Number },
    },
    gateway: {
      provider: { type: String, enum: ["razorpay"] },
      orderId: { type: String },
      paymentId: { type: String },
      signature: { type: String },
    },
    lateFee: { type: Number, default: 0 },
    lateFeeWaived: { type: Boolean, default: false },
    collectedBy: { type: Schema.Types.ObjectId, ref: "User" },
    paidAt: { type: Date },
    remarks: { type: String },
  },
  { timestamps: true }
);

feeTransactionSchema.index({ branchId: 1, receiptNumber: 1 }, { unique: true, sparse: true });
feeTransactionSchema.index({ studentId: 1, status: 1 });

export const FeeTransaction = model<IFeeTransaction>("FeeTransaction", feeTransactionSchema);

// ---- Fee Refund (S-5.5: withdrawal / overpayment refunds) ----
export type RefundStatus = "pending" | "approved" | "rejected" | "processed";
export type RefundMode = "cash" | "bank_transfer" | "upi" | "cheque";

export interface IFeeRefund {
  _id: Types.ObjectId;
  tenantId: Types.ObjectId;
  branchId: Types.ObjectId;
  studentId: Types.ObjectId;
  amount: number;
  reason: string;
  status: RefundStatus;
  requestedBy: Types.ObjectId;
  decidedBy?: Types.ObjectId;
  decidedAt?: Date;
  decisionNote?: string;
  refundMode?: RefundMode;
  referenceNote?: string;
  processedBy?: Types.ObjectId;
  processedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const feeRefundSchema = new Schema<IFeeRefund>(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: "Tenant", required: true, index: true },
    branchId: { type: Schema.Types.ObjectId, ref: "Branch", required: true, index: true },
    studentId: { type: Schema.Types.ObjectId, ref: "Student", required: true, index: true },
    amount: { type: Number, required: true, min: 1 },
    reason: { type: String, required: true },
    status: { type: String, enum: ["pending", "approved", "rejected", "processed"], default: "pending" },
    requestedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    decidedBy: { type: Schema.Types.ObjectId, ref: "User" },
    decidedAt: { type: Date },
    decisionNote: { type: String },
    refundMode: { type: String, enum: ["cash", "bank_transfer", "upi", "cheque"] },
    referenceNote: { type: String },
    processedBy: { type: Schema.Types.ObjectId, ref: "User" },
    processedAt: { type: Date },
  },
  { timestamps: true }
);

feeRefundSchema.index({ studentId: 1, status: 1 });

export const FeeRefund = model<IFeeRefund>("FeeRefund", feeRefundSchema);
