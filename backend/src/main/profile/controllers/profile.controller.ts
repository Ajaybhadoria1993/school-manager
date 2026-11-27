import { NextFunction, Request, Response } from "express";
import { ApiError } from "../../../utils/ApiError";
import { asyncHandler } from "../../../utils/asyncHandler";
import { sendFile, sendOk } from "../../../utils/response";
import { loadAccess } from "../../../middleware/permission";
import { FULL_ACCESS_ROLES } from "../../permissions/constants";
import type { OwnProfileInput } from "../schemas/profile.schemas";
import { PersonPhotoService } from "../services/personPhoto.service";
import { ProfileService } from "../services/profile.service";
import { ResumeService } from "../services/resume.service";

/** The side the person's own records are on: the school their login belongs to, whatever medium is open in the top bar. */
function homeOf(req: Request): string {
  const school = req.user?.homeTenantId ?? req.user?.tenantId;
  if (!school) throw ApiError.forbidden("You do not belong to a school", "FORBIDDEN");
  return school;
}
const myOwners = (req: Request) => ProfileService.photoOwners(homeOf(req), req.user!.userId);

// ---- My own ---------------------------------------------------------------------------------------------------------------------------
export const getMyProfile = asyncHandler(async (req: Request, res: Response) => sendOk(res, await ProfileService.get(homeOf(req), req.user!.userId)));
export const updateMyProfile = asyncHandler(async (req: Request, res: Response) =>
  sendOk(res, await ProfileService.update(homeOf(req), req.user!.userId, req.validatedBody as OwnProfileInput), "Saved")
);
export const getMyPhoto = asyncHandler(async (req: Request, res: Response) => sendOk(res, await PersonPhotoService.get(await myOwners(req))));
export const saveMyPhoto = asyncHandler(async (req: Request, res: Response) => sendOk(res, await PersonPhotoService.save(await myOwners(req), req.file?.buffer), "Photo saved"));
export const removeMyPhoto = asyncHandler(async (req: Request, res: Response) => sendOk(res, await PersonPhotoService.remove(await myOwners(req)), "Photo removed"));

// ---- A teacher's or a staff member's, from the school's pages ---------------------------------------------------------------------------
/** The records of the person, kept on the request: asked once by the "is there such a person" step, before the file is read. */
const found = (kind: "teacher" | "staff") =>
  asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
    const owners = await PersonPhotoService.ownersOf(req.user!.tenantId!, kind, req.params.id);
    if (owners.length === 0) {
      throw kind === "teacher" ? ApiError.notFound("Teacher not found", "TEACHER_NOT_FOUND") : ApiError.notFound("Staff member not found", "STAFF_NOT_FOUND");
    }
    res.locals.photoOwners = owners;
    next();
  });
export const teacherPhotoOwner = found("teacher");
export const staffPhotoOwner = found("staff");

export const getPersonPhoto = asyncHandler(async (_req: Request, res: Response) => sendOk(res, await PersonPhotoService.get(res.locals.photoOwners)));
export const removePersonPhoto = asyncHandler(async (_req: Request, res: Response) => sendOk(res, await PersonPhotoService.remove(res.locals.photoOwners), "Photo removed"));

// ---- A teacher's resume: from the school's pages, and the teacher's own ----------------------------------------------------------------
/** The signed-in person's teacher records; someone who does not teach has no resume. */
export const myTeacherRecords = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
  const owners = await PersonPhotoService.ownersOfLogin(homeOf(req), req.user!.userId);
  if (!owners.some((o) => o.ownerType === "teacher")) throw ApiError.notFound("Only a teacher has a resume", "TEACHER_NOT_FOUND");
  res.locals.photoOwners = owners;
  next();
});
export const getResume = asyncHandler(async (_req: Request, res: Response) => sendOk(res, await ResumeService.info(res.locals.photoOwners)));
export const downloadResume = asyncHandler(async (_req: Request, res: Response) => sendFile(res, await ResumeService.file(res.locals.photoOwners)));
export const removeResume = asyncHandler(async (_req: Request, res: Response) => sendOk(res, await ResumeService.remove(res.locals.photoOwners), "Resume removed"));
export const saveOwnResume = asyncHandler(async (req: Request, res: Response) => sendOk(res, await ResumeService.save(res.locals.photoOwners, req.file), "Resume saved"));

/** Replacing takes the `edit` permission; someone who may only add gives one where there is none. */
async function mayGive(req: Request, editKey: string, exists: () => Promise<boolean>) {
  const user = req.user!;
  const mayReplace = FULL_ACCESS_ROLES.includes(user.role) || (await loadAccess(user)).schoolPermissions.includes(editKey);
  if (!mayReplace && (await exists())) throw ApiError.forbidden("You do not have permission to change this", "FORBIDDEN");
}
export const saveResume = asyncHandler(async (req: Request, res: Response) => {
  await mayGive(req, "teachers.edit", async () => !!(await ResumeService.info(res.locals.photoOwners)).resume);
  return sendOk(res, await ResumeService.save(res.locals.photoOwners, req.file), "Resume saved");
});

/**
 * Giving a photo is part of adding a person, so the `add` permission is enough for someone who has none yet; replacing one takes the `edit`
 * permission.
 */
export const savePersonPhoto = (editKey: string) =>
  asyncHandler(async (req: Request, res: Response) => {
    await mayGive(req, editKey, async () => !!(await PersonPhotoService.get(res.locals.photoOwners)).photo);
    return sendOk(res, await PersonPhotoService.save(res.locals.photoOwners, req.file?.buffer), "Photo saved");
  });
