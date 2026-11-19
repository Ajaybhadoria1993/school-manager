import type { Request, Response } from "express";
import { Types } from "mongoose";
import { ApiError } from "../../../utils/ApiError";
import { asyncHandler } from "../../../utils/asyncHandler";
import { sendCreated, sendOk } from "../../../utils/response";
import { DocumentsService } from "../services/documents.service";
import { findStudents } from "../../transport/services/rider.service";
import { CertificateService } from "../services/certificate.service";
import { DocumentSettingsService } from "../services/settings.service";
import { PhotoService } from "../services/photo.service";

const school = (req: Request): string => {
  if (!req.user?.tenantId) throw ApiError.forbidden("You do not belong to a school", "FORBIDDEN");
  return req.user.tenantId;
};
const idOf = (req: Request) => (req.validatedParams as { id: string }).id;
const query = <T>(req: Request) => req.validatedQuery as T;

export const getOptions = asyncHandler(async (req: Request, res: Response) => sendOk(res, await DocumentsService.options(school(req))));
export const getIdCard = asyncHandler(async (req: Request, res: Response) => sendOk(res, await DocumentsService.idCard(school(req), idOf(req))));
export const getReportCard = asyncHandler(async (req: Request, res: Response) => sendOk(res, await DocumentsService.reportCard(school(req), idOf(req), query<{ examId: string }>(req).examId)));
export const getClassIdCards = asyncHandler(async (req: Request, res: Response) => sendOk(res, await DocumentsService.idCardsOfClass(school(req), idOf(req), query<{ sectionId?: string }>(req).sectionId)));
export const getClassReportCards = asyncHandler(async (req: Request, res: Response) => {
  const { examId, sectionId } = query<{ examId: string; sectionId?: string }>(req);
  return sendOk(res, await DocumentsService.reportCardsOfClass(school(req), idOf(req), examId, sectionId));
});

export const getPhoto = asyncHandler(async (req: Request, res: Response) => sendOk(res, await PhotoService.get(school(req), idOf(req))));
export const savePhoto = asyncHandler(async (req: Request, res: Response) => sendOk(res, await PhotoService.save(school(req), idOf(req), req.file?.buffer), "Photo saved"));
export const removePhoto = asyncHandler(async (req: Request, res: Response) => sendOk(res, await PhotoService.remove(school(req), idOf(req)), "Photo removed"));

// ---- the admit card, the remark, the grading, the certificates ---------------------------------------------------------------------------------
const userOf = (req: Request) => {
  if (!req.user) throw ApiError.forbidden("You do not belong to a school", "FORBIDDEN");
  return req.user.userId;
};
export const getAdmitCard = asyncHandler(async (req: Request, res: Response) => sendOk(res, await DocumentsService.admitCard(school(req), idOf(req), query<{ examId: string }>(req).examId)));
export const getClassAdmitCards = asyncHandler(async (req: Request, res: Response) => {
  const { examId, sectionId } = query<{ examId: string; sectionId?: string }>(req);
  return sendOk(res, await DocumentsService.admitCardsOfClass(school(req), idOf(req), examId, sectionId));
});
export const saveRemark = asyncHandler(async (req: Request, res: Response) => sendOk(res, await DocumentsService.saveRemark(school(req), userOf(req), req.validatedBody as { studentId: string; examId: string; remark: string }), "Remark saved"));

export const getSettings = asyncHandler(async (req: Request, res: Response) => sendOk(res, await DocumentSettingsService.get(school(req))));
export const saveSettings = asyncHandler(async (req: Request, res: Response) => sendOk(res, await DocumentSettingsService.save(school(req), userOf(req), req.validatedBody as never), "Saved"));
export const resetSettings = asyncHandler(async (req: Request, res: Response) => sendOk(res, await DocumentSettingsService.reset(school(req)), "Back to the usual grades"));

export const listCertificates = asyncHandler(async (req: Request, res: Response) => sendOk(res, await CertificateService.list(school(req), query(req))));
export const getCertificate = asyncHandler(async (req: Request, res: Response) => sendOk(res, await CertificateService.get(school(req), idOf(req))));
export const issueCertificate = asyncHandler(async (req: Request, res: Response) => sendCreated(res, await CertificateService.issue(school(req), userOf(req), idOf(req), req.validatedBody as never), "Certificate issued"));
export const cancelCertificate = asyncHandler(async (req: Request, res: Response) => sendOk(res, await CertificateService.cancel(school(req), userOf(req), idOf(req), (req.validatedBody as { reason: string }).reason), "Certificate cancelled"));

/** Students to choose from for a certificate (active students: by name or admission number). */
export const searchStudents = asyncHandler(async (req: Request, res: Response) => sendOk(res, { items: await findStudents(new Types.ObjectId(school(req)), query<{ q: string }>(req).q) }));
