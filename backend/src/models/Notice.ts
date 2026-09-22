import { Schema, model, Types } from "mongoose";

export type NoticeAudience = "all" | "class" | "section";

export interface INotice {
  _id: Types.ObjectId;
  tenantId: Types.ObjectId;
  branchId: Types.ObjectId;
  title: string;
  body: string;
  audienceType: NoticeAudience;
  classId?: Types.ObjectId;
  sectionId?: Types.ObjectId;
  createdBy: Types.ObjectId; // User
  publishedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const noticeSchema = new Schema<INotice>(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: "Tenant", required: true, index: true },
    branchId: { type: Schema.Types.ObjectId, ref: "Branch", required: true, index: true },
    title: { type: String, required: true, trim: true },
    body: { type: String, required: true },
    audienceType: { type: String, enum: ["all", "class", "section"], required: true },
    classId: { type: Schema.Types.ObjectId, ref: "ClassMaster" },
    sectionId: { type: Schema.Types.ObjectId, ref: "Section" },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    publishedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

noticeSchema.index({ branchId: 1, publishedAt: -1 });

export const Notice = model<INotice>("Notice", noticeSchema);

// FR-7.1 acceptance criteria: read-receipt tracking available to sender.
export interface INoticeRead {
  _id: Types.ObjectId;
  noticeId: Types.ObjectId;
  userId: Types.ObjectId;
  readAt: Date;
}

const noticeReadSchema = new Schema<INoticeRead>({
  noticeId: { type: Schema.Types.ObjectId, ref: "Notice", required: true, index: true },
  userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
  readAt: { type: Date, default: Date.now },
});

noticeReadSchema.index({ noticeId: 1, userId: 1 }, { unique: true });

export const NoticeRead = model<INoticeRead>("NoticeRead", noticeReadSchema);
