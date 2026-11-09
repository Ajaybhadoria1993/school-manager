import { Schema, model, Types } from "mongoose";
import { tenantScope } from "../../tenants/plugins/tenantScope";
import { CUSTOM_FIELD_TYPES, CUSTOM_KEY, FIELD_MODES, MAX_CUSTOM_LABEL, MAX_CUSTOM_OPTION, type CustomFieldDef } from "../../students/constants";

/**
 * How one school keeps its teachers' details beyond the usual ones: its own fields (a PAN number, a blood group, house duty...), each
 * a name, the kind of answer, the choices of a list, and needed / optional / not asked. The same definition as the students' own
 * fields (`CustomFieldDef`); a teacher's answers are kept in `Teacher.custom` by the field's `c_` key. One per school.
 */
export interface ITeacherSettings {
  _id: Types.ObjectId;
  tenantId: Types.ObjectId;
  customFields: CustomFieldDef[];
  updatedBy: Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

const teacherSettingsSchema = new Schema<ITeacherSettings>(
  {
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
    updatedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true }
);

teacherSettingsSchema.plugin(tenantScope);
teacherSettingsSchema.index({ tenantId: 1 }, { unique: true, name: "one_teacher_settings_per_school" });

export const TeacherSettings = model<ITeacherSettings>("TeacherSettings", teacherSettingsSchema);
