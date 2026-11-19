import { Types } from "mongoose";
import { ApiError } from "../../../utils/ApiError";
import { pictureType } from "../../onboarding/services/onboarding.service";
import { Student } from "../../students/models/Student";
import { StudentPhoto } from "../models/StudentPhoto";

const asId = (id: string | Types.ObjectId) => new Types.ObjectId(id.toString());
const NOT_FOUND = () => ApiError.notFound("Student not found", "STUDENT_NOT_FOUND");

/** A picture as an address a page can show without a second request: `data:image/jpeg;base64,...`. */
export const dataUrlOf = (p: { data: { buffer: Uint8Array }; contentType: string }) => `data:${p.contentType};base64,${Buffer.from(p.data.buffer).toString("base64")}`;

/** A student's photo for their ID card. Shown only through the answers of people who may see the student: it has no address of its own to open. */
export class PhotoService {
  private static async studentOf(school: Types.ObjectId, studentId: string) {
    const student = Types.ObjectId.isValid(studentId) ? await Student.findOne({ _id: studentId, tenantId: school }).select("_id").lean() : null;
    if (!student) throw NOT_FOUND();
    return student;
  }

  static async save(tenantId: string, studentId: string, file: Buffer | undefined) {
    const school = asId(tenantId);
    const student = await PhotoService.studentOf(school, studentId);
    if (!file || file.length === 0) throw ApiError.badRequest("Choose a photo.", "PHOTO_MISSING", [{ path: "photo", message: "Choose a photo." }]);
    const contentType = pictureType(file);
    if (!contentType) throw ApiError.badRequest("The photo must be a PNG, JPG or WebP picture.", "PHOTO_NOT_IMAGE", [{ path: "photo", message: "The photo must be a PNG, JPG or WebP picture." }]);
    await StudentPhoto.findOneAndUpdate({ tenantId: school, studentId: student._id }, { $set: { data: file, contentType } }, { upsert: true, setDefaultsOnInsert: true });
    return PhotoService.get(tenantId, studentId);
  }

  static async remove(tenantId: string, studentId: string) {
    const school = asId(tenantId);
    const student = await PhotoService.studentOf(school, studentId);
    await StudentPhoto.deleteOne({ tenantId: school, studentId: student._id });
    return { photo: null };
  }

  static async get(tenantId: string, studentId: string) {
    const school = asId(tenantId);
    const student = await PhotoService.studentOf(school, studentId);
    const photo = await StudentPhoto.findOne({ tenantId: school, studentId: student._id }).lean();
    return { photo: photo ? dataUrlOf(photo) : null };
  }

  /** The photos of many students at once, by student id (for a class's cards). */
  static async manyOf(school: Types.ObjectId, studentIds: Types.ObjectId[]): Promise<Map<string, string>> {
    const photos = studentIds.length > 0 ? await StudentPhoto.find({ tenantId: school, studentId: { $in: studentIds } }).lean() : [];
    return new Map(photos.map((p) => [p.studentId.toString(), dataUrlOf(p)]));
  }
}
