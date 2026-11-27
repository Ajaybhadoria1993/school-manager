import { Types } from "mongoose";
import { ApiError } from "../../../utils/ApiError";
import { dataUrlOf } from "../../documents/services/photo.service";
import { pictureType } from "../../onboarding/services/onboarding.service";
import { StaffMember } from "../../staff/models/StaffMember";
import { Teacher } from "../../staff/models/Teacher";
import { recordsOfSchool } from "../../tenants/services/schoolSides";
import { PersonPhoto, type PhotoOwnerType } from "../models/PersonPhoto";

/** One record a person's photo is kept on. */
export interface PhotoOwner {
  tenantId: Types.ObjectId;
  ownerType: PhotoOwnerType;
  ownerId: Types.ObjectId;
}

const asId = (id: string | Types.ObjectId) => new Types.ObjectId(String(id));
const bad = (code: string, message: string) => ApiError.badRequest(message, code, [{ path: "photo", message }]);

/**
 * A person is one, whatever records they have: a staff member who also teaches has two, a teacher of two mediums one on each side. Their
 * photo is written to all of them, and read from the one asked for first, so it is the same from every page.
 */
export class PersonPhotoService {
  /** Every record of the person this teacher or staff record belongs to, the one asked for first. Empty when there is no such record. */
  static async ownersOf(tenantId: string, ownerType: "teacher" | "staff", id: string): Promise<PhotoOwner[]> {
    if (!Types.ObjectId.isValid(id)) return [];
    const school = asId(tenantId);
    const owners: PhotoOwner[] = [];
    const add = (tenant: Types.ObjectId, type: PhotoOwnerType, ownerId: Types.ObjectId) => {
      if (!owners.some((o) => o.ownerType === type && o.ownerId.equals(ownerId))) owners.push({ tenantId: tenant, ownerType: type, ownerId });
    };
    let userId: Types.ObjectId | null = null;
    if (ownerType === "teacher") {
      const teacher = await Teacher.findOne({ _id: asId(id), tenantId: school }).select("userId").lean();
      if (!teacher) return [];
      add(school, "teacher", teacher._id);
      userId = teacher.userId ?? null;
      for (const member of await StaffMember.find({ tenantId: school, teacherId: teacher._id }).select("userId").lean()) {
        add(school, "staff", member._id);
        userId ??= member.userId ?? null;
      }
    } else {
      const member = await StaffMember.findOne({ _id: asId(id), tenantId: school }).select("userId teacherId").lean();
      if (!member) return [];
      add(school, "staff", member._id);
      if (member.teacherId) add(school, "teacher", member.teacherId);
      userId = member.userId ?? null;
    }
    if (userId) for (const owner of await PersonPhotoService.ownersOfLogin(tenantId, userId)) add(owner.tenantId, owner.ownerType, owner.ownerId);
    return owners;
  }

  /** The teacher and staff records a login has, on every side of the school (the staff member first). */
  static async ownersOfLogin(tenantId: string, userId: string | Types.ObjectId): Promise<PhotoOwner[]> {
    const login = asId(userId);
    const owners: PhotoOwner[] = [];
    const sides = [asId(tenantId), ...(await recordsOfSchool(asId(tenantId))).map((id) => asId(id)).filter((id) => !id.equals(tenantId))];
    for (const side of sides) {
      const [members, teachers] = await Promise.all([
        StaffMember.find({ tenantId: side, userId: login }).select("teacherId").lean(),
        Teacher.find({ tenantId: side, userId: login }).select("_id").lean(),
      ]);
      for (const m of members) owners.push({ tenantId: side, ownerType: "staff", ownerId: m._id });
      const teacherIds = [...teachers.map((t) => t._id), ...members.flatMap((m) => (m.teacherId ? [m.teacherId] : []))];
      for (const id of teacherIds) if (!owners.some((o) => o.ownerType === "teacher" && o.ownerId.equals(id))) owners.push({ tenantId: side, ownerType: "teacher", ownerId: id });
    }
    return owners;
  }

  static async get(owners: PhotoOwner[]): Promise<{ photo: string | null }> {
    for (const owner of owners) {
      const found = await PersonPhoto.findOne(owner).lean();
      if (found) return { photo: dataUrlOf(found) };
    }
    return { photo: null };
  }

  static async save(owners: PhotoOwner[], file: Buffer | undefined): Promise<{ photo: string | null }> {
    if (!file || file.length === 0) throw bad("PHOTO_MISSING", "Choose a photo.");
    const contentType = pictureType(file);
    if (!contentType) throw bad("PHOTO_NOT_IMAGE", "The photo must be a PNG, JPG or WebP picture.");
    for (const owner of owners) await PersonPhoto.updateOne(owner, { $set: { data: file, contentType } }, { upsert: true });
    return PersonPhotoService.get(owners);
  }

  static async remove(owners: PhotoOwner[]): Promise<{ photo: null }> {
    for (const owner of owners) await PersonPhoto.deleteOne(owner);
    return { photo: null };
  }
}
