import { Schema, model, Types } from "mongoose";
import { tenantScope } from "../../tenants/plugins/tenantScope";

/** One grade of a school's scale: from this percentage up (and below the grade above it) the grade is this. */
export interface IGradeBand {
  min: number;
  grade: string;
}

/**
 * How a school grades and what it passes (2026-11-19), one per school, made on the first save; until then the school has the usual scale
 * (documents/constants.ts). The report cards, and nothing else, read it.
 */
export interface IDocumentSettings {
  _id: Types.ObjectId;
  tenantId: Types.ObjectId;
  /** A subject, and so an exam, is passed from this percentage up (1 to 100). */
  passPercent: number;
  /** Best grade first; the lowest band starts at 0. */
  gradeBands: IGradeBand[];
  /** Whether a report card says the child's place in the class ("Rank 3 of 38"). */
  showRank: boolean;
  /** The name printed under the principal's line on a report card or a certificate; empty = the line only. */
  principalName: string | null;
  updatedBy: Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

const gradeBandSchema = new Schema<IGradeBand>({ min: { type: Number, required: true, min: 0, max: 100 }, grade: { type: String, required: true, trim: true, maxlength: 12 } }, { _id: false });

const documentSettingsSchema = new Schema<IDocumentSettings>(
  {
    passPercent: { type: Number, required: true, min: 1, max: 100 },
    gradeBands: { type: [gradeBandSchema], required: true },
    showRank: { type: Boolean, default: true },
    principalName: { type: String, default: null, trim: true, maxlength: 80 },
    updatedBy: { type: Schema.Types.ObjectId, default: null },
  },
  { timestamps: true }
);

documentSettingsSchema.plugin(tenantScope);
documentSettingsSchema.index({ tenantId: 1 }, { unique: true, name: "one_document_settings_per_school" });

export const DocumentSettings = model<IDocumentSettings>("DocumentSettings", documentSettingsSchema);
