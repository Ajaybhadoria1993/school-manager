import { Schema, model, Types } from "mongoose";
import { tenantScope } from "../../tenants/plugins/tenantScope";

export const PHOTO_OWNERS = ["user", "teacher", "staff"] as const;
export type PhotoOwnerType = (typeof PHOTO_OWNERS)[number];

/**
 * The profile photo of a person who works at the school (docs/profiles.md), one per record: a teacher's, a staff member's, or the login's
 * of someone who has neither (the school's administrator). Kept apart from those records, which are read all the time, and never served at
 * a public address. Only pictures checked by their first bytes are stored (see PersonPhotoService).
 */
export interface IPersonPhoto {
  _id: Types.ObjectId;
  tenantId: Types.ObjectId;
  ownerType: PhotoOwnerType;
  ownerId: Types.ObjectId;
  data: Buffer;
  contentType: string;
  createdAt: Date;
  updatedAt: Date;
}

const personPhotoSchema = new Schema<IPersonPhoto>(
  {
    ownerType: { type: String, enum: PHOTO_OWNERS, required: true, immutable: true },
    ownerId: { type: Schema.Types.ObjectId, required: true, immutable: true },
    data: { type: Buffer, required: true },
    contentType: { type: String, required: true },
  },
  { timestamps: true }
);

personPhotoSchema.plugin(tenantScope);
personPhotoSchema.index({ tenantId: 1, ownerType: 1, ownerId: 1 }, { unique: true, name: "one_photo_per_person_record" });

export const PersonPhoto = model<IPersonPhoto>("PersonPhoto", personPhotoSchema);
