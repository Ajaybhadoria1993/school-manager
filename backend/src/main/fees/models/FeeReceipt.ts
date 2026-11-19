import { Schema, model, Types } from "mongoose";
import { tenantScope } from "../../tenants/plugins/tenantScope";
import { MAX_NOTE, PAYMENT_MODES, type PaymentMode } from "../constants";

/**
 * A receipt: money taken from a family for one student on one day, and exactly which charges it settled. Receipts are numbered in order for
 * each school and session ("2026-2027/0001") and are never edited or deleted: a mistake is CANCELLED (with a reason), which gives the money back
 * to the charges, and a new receipt is made. The student's name and class are kept as they were, so the receipt reads the same for ever.
 */
export interface IFeeReceipt {
  _id: Types.ObjectId;
  tenantId: Types.ObjectId;
  academicYearId: Types.ObjectId;
  /** 1, 2, 3 ... in the school and session; unique. */
  seq: number;
  number: string;
  studentId: Types.ObjectId;
  studentName: string;
  admissionNumber: string;
  classLabel: string | null;
  mode: PaymentMode;
  /** A cheque or draft number, a UPI or bank reference. */
  reference: string | null;
  paidOn: Date;
  items: { chargeId: Types.ObjectId; label: string; amount: number }[];
  /** Late fine taken with it (not part of any charge). */
  lateFine: number;
  total: number;
  note: string | null;
  status: "valid" | "cancelled";
  receivedBy: { userId: Types.ObjectId; name: string };
  cancelledAt: Date | null;
  cancelReason: string | null;
  cancelledBy: { userId: Types.ObjectId; name: string } | null;
  createdAt: Date;
  updatedAt: Date;
}

const personSchema = new Schema({ userId: { type: Schema.Types.ObjectId, required: true }, name: { type: String, required: true } }, { _id: false });
const itemSchema = new Schema({ chargeId: { type: Schema.Types.ObjectId, required: true }, label: { type: String, required: true }, amount: { type: Number, required: true, min: 0.01 } }, { _id: false });

const receiptSchema = new Schema<IFeeReceipt>(
  {
    academicYearId: { type: Schema.Types.ObjectId, ref: "AcademicYear", required: true, immutable: true },
    seq: { type: Number, required: true, immutable: true, min: 1 },
    number: { type: String, required: true, immutable: true },
    studentId: { type: Schema.Types.ObjectId, ref: "Student", required: true, immutable: true },
    studentName: { type: String, required: true, immutable: true },
    admissionNumber: { type: String, required: true, immutable: true },
    classLabel: { type: String, default: null, immutable: true },
    mode: { type: String, enum: PAYMENT_MODES, required: true, immutable: true },
    reference: { type: String, default: null, trim: true, maxlength: 60, immutable: true },
    paidOn: { type: Date, required: true, immutable: true },
    items: { type: [itemSchema], required: true, immutable: true },
    lateFine: { type: Number, default: 0, min: 0, immutable: true },
    total: { type: Number, required: true, min: 0.01, immutable: true },
    note: { type: String, default: null, trim: true, maxlength: MAX_NOTE, immutable: true },
    status: { type: String, enum: ["valid", "cancelled"], default: "valid" },
    receivedBy: { type: personSchema, required: true, immutable: true },
    cancelledAt: { type: Date, default: null },
    cancelReason: { type: String, default: null, trim: true, maxlength: MAX_NOTE },
    cancelledBy: { type: personSchema, default: null },
  },
  { timestamps: true }
);

receiptSchema.plugin(tenantScope);
// The next number is "the highest so far + 1": two receipts made at the same moment cannot both have it (the unique index lets one win; the other tries again).
receiptSchema.index({ tenantId: 1, academicYearId: 1, seq: 1 }, { unique: true, name: "one_receipt_per_number" });
receiptSchema.index({ tenantId: 1, studentId: 1, academicYearId: 1 });
receiptSchema.index({ tenantId: 1, paidOn: 1 });

export const FeeReceipt = model<IFeeReceipt>("FeeReceipt", receiptSchema);
