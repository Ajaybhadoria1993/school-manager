import { Schema, model, Types } from "mongoose";

// A conversation is scoped to a specific student, so both sides have shared
// context ("about Rohan") — the natural unit of a parent-teacher chat.
export interface IConversation {
  _id: Types.ObjectId;
  tenantId: Types.ObjectId;
  branchId: Types.ObjectId;
  studentId: Types.ObjectId;
  teacherStaffId: Types.ObjectId;
  guardianId: Types.ObjectId;
  subject: string;
  lastMessageAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const conversationSchema = new Schema<IConversation>(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: "Tenant", required: true, index: true },
    branchId: { type: Schema.Types.ObjectId, ref: "Branch", required: true, index: true },
    studentId: { type: Schema.Types.ObjectId, ref: "Student", required: true, index: true },
    teacherStaffId: { type: Schema.Types.ObjectId, ref: "Staff", required: true, index: true },
    guardianId: { type: Schema.Types.ObjectId, ref: "Guardian", required: true, index: true },
    subject: { type: String, required: true, trim: true },
    lastMessageAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

conversationSchema.index({ studentId: 1, teacherStaffId: 1, guardianId: 1 }, { unique: true });

export const Conversation = model<IConversation>("Conversation", conversationSchema);

// FR-7.2 acceptance criteria: messages timestamped, non-deletable (no delete
// route is ever exposed), exportable for dispute resolution.
export type SenderRole = "teacher" | "parent" | "school_admin" | "principal";

export interface IMessage {
  _id: Types.ObjectId;
  conversationId: Types.ObjectId;
  senderUserId: Types.ObjectId;
  senderRole: SenderRole;
  body: string;
  createdAt: Date;
}

const messageSchema = new Schema<IMessage>(
  {
    conversationId: { type: Schema.Types.ObjectId, ref: "Conversation", required: true, index: true },
    senderUserId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    senderRole: { type: String, enum: ["teacher", "parent", "school_admin", "principal"], required: true },
    body: { type: String, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

export const Message = model<IMessage>("Message", messageSchema);
