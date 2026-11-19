import { Schema, model, Types } from "mongoose";
import { tenantScope } from "../../tenants/plugins/tenantScope";
import { CUSTOM_FIELD_TYPES, CUSTOM_KEY, FIELD_MODES, MAX_CUSTOM_LABEL, MAX_CUSTOM_OPTION, MAX_EXPORT_HEADING, type CustomFieldDef, type FieldMode } from "../../students/constants";
import { TEACHER_COLUMN_KEYS, TEACHER_DETAIL_KEYS, type TeacherDetailKey } from "../constants";

/** One column of the school's teacher Excel: a column of the list or one of the school's own fields (its `c_` key), under the school's heading. */
export interface ITeacherExportColumn {
  key: string;
  heading: string;
}

/**
 * How one school keeps its teachers' details (Teacher > Manage fields, the way Students > Manage fields works): which usual details Add
 * teacher needs, may leave empty or does not ask (`fields`; one not listed is optional), its own fields (a PAN number, a blood group, house
 * duty...: a name, the kind of answer, the choices of a list, and needed / optional / not asked, the same definition as the students' own
 * fields; a teacher's answers are kept in `Teacher.custom` by the field's `c_` key), and the columns of its Excel (`exportColumns`, in order,
 * each under its heading; null = the usual layout). One per school.
 */
export interface ITeacherSettings {
  _id: Types.ObjectId;
  tenantId: Types.ObjectId;
  fields: { key: TeacherDetailKey; mode: FieldMode }[];
  customFields: CustomFieldDef[];
  exportColumns: ITeacherExportColumn[] | null;
  updatedBy: Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

const teacherSettingsSchema = new Schema<ITeacherSettings>(
  {
    fields: {
      type: [
        new Schema(
          {
            key: { type: String, enum: TEACHER_DETAIL_KEYS, required: true },
            mode: { type: String, enum: FIELD_MODES, required: true },
          },
          { _id: false }
        ),
      ],
      default: [],
    },
    customFields: {
      type: [
        new Schema(
          {
            key: { type: String, match: CUSTOM_KEY, required: true },
            label: { type: String, required: true, trim: true, maxlength: MAX_CUSTOM_LABEL },
            type: { type: String, enum: CUSTOM_FIELD_TYPES, required: true },
            options: { type: [{ type: String, trim: true, maxlength: MAX_CUSTOM_OPTION }], default: [] },
            mode: { type: String, enum: FIELD_MODES, required: true },
          },
          { _id: false }
        ),
      ],
      default: [],
    },
    exportColumns: {
      type: [
        new Schema(
          {
            key: {
              type: String,
              required: true,
              validate: { validator: (key: string) => TEACHER_COLUMN_KEYS.has(key) || CUSTOM_KEY.test(key), message: "Unknown column" },
            },
            heading: { type: String, required: true, trim: true, maxlength: MAX_EXPORT_HEADING },
          },
          { _id: false }
        ),
      ],
      default: null,
    },
    updatedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true }
);

teacherSettingsSchema.plugin(tenantScope);
teacherSettingsSchema.index({ tenantId: 1 }, { unique: true, name: "one_teacher_settings_per_school" });

export const TeacherSettings = model<ITeacherSettings>("TeacherSettings", teacherSettingsSchema);
