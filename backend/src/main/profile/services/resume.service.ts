import { ApiError } from "../../../utils/ApiError";
import { TeacherResume } from "../models/TeacherResume";
import type { PhotoOwner } from "./personPhoto.service";

export interface ResumeInfo {
  name: string;
  /** In bytes. */
  size: number;
  uploadedAt: string;
}

const DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const ENDINGS: Record<string, string> = { "application/pdf": "pdf", "application/msword": "doc", [DOCX]: "docx" };
const bad = (code: string, message: string) => ApiError.badRequest(message, code, [{ path: "resume", message }]);

/** What the file really is, from its bytes (its name and its stated type can say anything): a PDF or a Word file, or null. */
export function documentType(file: Buffer): string | null {
  if (file.length >= 5 && file.toString("latin1", 0, 5) === "%PDF-") return "application/pdf";
  if (file.length >= 8 && file.subarray(0, 8).equals(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]))) return "application/msword";
  // A .docx is a zip with a "word/" folder inside; any other zip is not a resume.
  const zip = file.length >= 4 && file.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 0x03, 0x04]));
  return zip && file.includes("[Content_Types].xml") && file.includes("word/") ? DOCX : null;
}

/** The name it is downloaded under: the one it came with, without folders or odd characters, ending as the file really is. */
function nameOf(original: string, contentType: string): string {
  // multer reads a file's name as latin1; a Hindi name arrives as UTF-8 bytes.
  const utf8 = Buffer.from(original, "latin1").toString("utf8");
  const plain = (utf8.includes("�") ? original : utf8).split(/[\\/]/).pop() ?? "";
  const stem = plain.replace(/\.[A-Za-z0-9]{1,5}$/, "").replace(/[\u0000-\u001f<>:"|?*]+/g, " ").trim().slice(0, 120);
  return `${stem || "resume"}.${ENDINGS[contentType]}`;
}

/** A teacher's resume. `owners`: the records of the one person (PersonPhotoService.ownersOf); the file is kept on each teacher record. */
export class ResumeService {
  private static teachers(owners: PhotoOwner[]) {
    return owners.filter((o) => o.ownerType === "teacher").map((o) => ({ tenantId: o.tenantId, teacherId: o.ownerId }));
  }

  private static async find(owners: PhotoOwner[], withFile: boolean) {
    for (const key of ResumeService.teachers(owners)) {
      const found = await TeacherResume.findOne(key)
        .select(withFile ? "data contentType fileName" : "fileName size updatedAt")
        .lean();
      if (found) return found;
    }
    return null;
  }

  static async info(owners: PhotoOwner[]): Promise<{ resume: ResumeInfo | null }> {
    const found = await ResumeService.find(owners, false);
    return { resume: found ? { name: found.fileName, size: found.size, uploadedAt: found.updatedAt.toISOString() } : null };
  }

  static async file(owners: PhotoOwner[]) {
    const found = await ResumeService.find(owners, true);
    if (!found) throw ApiError.notFound("No resume has been uploaded", "RESUME_NOT_FOUND");
    return { buffer: Buffer.from((found.data as unknown as { buffer: Uint8Array }).buffer), fileName: found.fileName, contentType: found.contentType };
  }

  static async save(owners: PhotoOwner[], file: { buffer: Buffer; originalname: string } | undefined) {
    if (!file || file.buffer.length === 0) throw bad("RESUME_MISSING", "Choose a file for the resume.");
    const contentType = documentType(file.buffer);
    if (!contentType) throw bad("RESUME_NOT_DOCUMENT", "The resume must be a PDF or Word file.");
    const set = { data: file.buffer, contentType, fileName: nameOf(file.originalname, contentType), size: file.buffer.length };
    for (const key of ResumeService.teachers(owners)) await TeacherResume.updateOne(key, { $set: set }, { upsert: true });
    return ResumeService.info(owners);
  }

  static async remove(owners: PhotoOwner[]): Promise<{ resume: null }> {
    for (const key of ResumeService.teachers(owners)) await TeacherResume.deleteOne(key);
    return { resume: null };
  }
}
