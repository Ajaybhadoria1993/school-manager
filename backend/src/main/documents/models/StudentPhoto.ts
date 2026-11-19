import { Schema, model, Types } from "mongoose";
import { tenantScope } from "../../tenants/plugins/tenantScope";

/**
 * A student's photo, one per student, for the ID card. Kept apart from the student's own record (which is read all the time) so the picture is only
 * loaded when it is asked for, and it is never served at a public address: a child's face is shown only to people who may see the student. Only
 * pictures checked by their first bytes are stored (see PhotoService).
 */
export interface IStudentPhoto {
  _id: Types.ObjectId;
  tenantId: Types.ObjectId;
  studentId: Types.ObjectId;
  data: Buffer;
  contentType: string;
  createdAt: Date;
  updatedAt: Date;
}

const studentPhotoSchema = new Schema<IStudentPhoto>(
  {
    studentId: { type: Schema.Types.ObjectId, ref: "Student", required: true, immutable: true },
    data: { type: Buffer, required: true },
    contentType: { type: String, required: true },
  },
  { timestamps: true }
);

studentPhotoSchema.plugin(tenantScope);
studentPhotoSchema.index({ tenantId: 1, studentId: 1 }, { unique: true, name: "one_photo_per_student" });

export const StudentPhoto = model<IStudentPhoto>("StudentPhoto", studentPhotoSchema);
