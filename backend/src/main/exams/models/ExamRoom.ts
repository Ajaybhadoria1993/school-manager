import { Schema, model, Types } from "mongoose";
import { tenantScope } from "../../tenants/plugins/tenantScope";
import { MAX_ROLL_NUMBER } from "../../students/constants";
import { MAX_ROOM } from "../constants";

/**
 * Where children sit for an exam (2026-11-27, the user: "Room number: kitne se kitne bacche kis room mein rahenge"): a room holds a run of roll
 * numbers (`fromRoll`..`toRoll`, both in) of one class, or of one section of a class that has sections. A room can hold runs of several classes
 * (one record each); the runs of one class or section never overlap in an exam. The children are not stored: a child is in the room whose run
 * holds their roll number, so a roll number given later finds its room by itself.
 */
export interface IExamRoom {
  _id: Types.ObjectId;
  tenantId: Types.ObjectId;
  academicYearId: Types.ObjectId;
  examId: Types.ObjectId;
  room: string;
  classId: Types.ObjectId;
  sectionId: Types.ObjectId | null;
  fromRoll: number;
  toRoll: number;
  createdAt: Date;
  updatedAt: Date;
}

const examRoomSchema = new Schema<IExamRoom>(
  {
    academicYearId: { type: Schema.Types.ObjectId, ref: "AcademicYear", required: true },
    examId: { type: Schema.Types.ObjectId, ref: "Exam", required: true },
    room: { type: String, required: true, trim: true, maxlength: MAX_ROOM },
    classId: { type: Schema.Types.ObjectId, ref: "SchoolClass", required: true },
    sectionId: { type: Schema.Types.ObjectId, ref: "Section", default: null },
    fromRoll: { type: Number, required: true, min: 1, max: MAX_ROLL_NUMBER },
    toRoll: { type: Number, required: true, min: 1, max: MAX_ROLL_NUMBER },
  },
  { timestamps: true }
);

examRoomSchema.plugin(tenantScope);
examRoomSchema.index({ tenantId: 1, examId: 1, classId: 1, sectionId: 1, fromRoll: 1 });

export const ExamRoom = model<IExamRoom>("ExamRoom", examRoomSchema);
