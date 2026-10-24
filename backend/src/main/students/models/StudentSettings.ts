import { Schema, model, Types } from "mongoose";
import { tenantScope } from "../../tenants/plugins/tenantScope";
import {
  CUSTOM_FIELD_TYPES,
  CUSTOM_KEY,
  EXPORT_COLUMNS,
  FIELD_MODES,
  MAX_CUSTOM_LABEL,
  MAX_CUSTOM_OPTION,
  MAX_EXPORT_HEADING,
  STUDENT_FORM_FIELDS,
  type CustomFieldDef,
  type ExportColumnKey,
  type FieldMode,
  type FormFieldKey,
} from "../constants";

/**
 * One column of the school's export: which detail (one of the list, or one of the school's own fields by its `c_` key), under which
 * heading (the school's own words), in the order of the list.
 */
export interface IExportColumn {
  key: ExportColumnKey | string;
  heading: string;
}

/**
 * How one school wants its students' details (Manage school > Students > Export: one list of fields for the form and the file): which details the admission
 * form needs, may leave empty or does not ask (`fields`; a detail not listed is as the defaults say), the school's own fields
 * (`customFields`), and the columns of its export (`exportColumns`, in order; null = the default layout). One per school. Year-free: a
 * school's way of keeping records does not change with the session.
 */
export interface IStudentSettings {
  _id: Types.ObjectId;
  tenantId: Types.ObjectId;
  fields: { key: FormFieldKey; mode: FieldMode }[];
  customFields: CustomFieldDef[];
  exportColumns: IExportColumn[] | null;
  updatedBy: Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

const BUILT_IN_COLUMNS = new Set<string>(EXPORT_COLUMNS.map((c) => c.key));

const studentSettingsSchema = new Schema<IStudentSettings>(
  {
    fields: {
      type: [
        new Schema(
          {
            key: { type: String, enum: STUDENT_FORM_FIELDS.map((f) => f.key), required: true },
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
              validate: { validator: (key: string) => BUILT_IN_COLUMNS.has(key) || CUSTOM_KEY.test(key), message: "Unknown column" },
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

studentSettingsSchema.plugin(tenantScope);
studentSettingsSchema.index({ tenantId: 1 }, { unique: true, name: "one_student_settings_per_school" });

export const StudentSettings = model<IStudentSettings>("StudentSettings", studentSettingsSchema);
