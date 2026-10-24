import { Request, Response } from "express";
import { ApiError } from "../../../utils/ApiError";
import { asyncHandler } from "../../../utils/asyncHandler";
import { sendCreated, sendOk } from "../../../utils/response";
import type {
  AcademicSettingsInput,
  AddClassesInput,
  ListClassesQuery,
  AssignDepartmentInput,
  CreateClassInput,
  CreateSectionInput,
  DepartmentInput,
  QuickSetupInput,
  UpdateClassInput,
  UpdateSectionInput,
} from "../schemas/academics.schemas";
import type { AcademicYearInput } from "../schemas/academicYear.schemas";
import { AcademicYearService } from "../services/academicYear.service";
import { AcademicSettingsService } from "../services/academicSettings.service";
import { ClassService } from "../services/class.service";
import { DepartmentService } from "../services/department.service";
import { SectionService } from "../services/section.service";
import { StructureService } from "../services/structure.service";

/** The caller's own school, taken from the signed-in user, never from the request. */
function tenantOf(req: Request): string {
  if (!req.user?.tenantId) throw ApiError.forbidden("You do not belong to a school", "FORBIDDEN");
  return req.user.tenantId;
}

const idOf = (req: Request) => (req.validatedParams as { id: string }).id;
const body = <T>(req: Request) => req.validatedBody as T;

export const getStructure = asyncHandler(async (req: Request, res: Response) => {
  return sendOk(res, await StructureService.get(tenantOf(req)));
});

export const currentAcademicYear = asyncHandler(async (req: Request, res: Response) => {
  return sendOk(res, await AcademicYearService.current(tenantOf(req)));
});

export const setUpFirstAcademicYear = asyncHandler(async (req: Request, res: Response) => {
  const year = await AcademicYearService.setUpFirst(tenantOf(req), body<AcademicYearInput>(req));
  return sendCreated(res, year, "Academic year set up");
});

export const academicSettings = asyncHandler(async (req: Request, res: Response) => {
  return sendOk(res, await AcademicSettingsService.get(tenantOf(req)));
});

export const updateAcademicSettings = asyncHandler(async (req: Request, res: Response) => {
  return sendOk(res, await AcademicSettingsService.update(tenantOf(req), body<AcademicSettingsInput>(req)), "Settings saved");
});

export const quickSetup = asyncHandler(async (req: Request, res: Response) => {
  const result = await StructureService.quickSetup(tenantOf(req), body<QuickSetupInput>(req));
  return sendCreated(res, result, "Classes created");
});

export const createDepartment = asyncHandler(async (req: Request, res: Response) => {
  const { name } = body<DepartmentInput>(req);
  return sendCreated(res, await DepartmentService.create(tenantOf(req), name), "Department created");
});

export const assignDepartment = asyncHandler(async (req: Request, res: Response) => {
  const { name, classIds } = body<AssignDepartmentInput>(req);
  const result = await DepartmentService.assign(tenantOf(req), name, classIds);
  return result.created ? sendCreated(res, result, "Department created") : sendOk(res, result, "Classes moved");
});

export const addClassesToDepartment = asyncHandler(async (req: Request, res: Response) => {
  return sendOk(res, await DepartmentService.addClasses(tenantOf(req), idOf(req), body<AddClassesInput>(req)), "Classes added");
});

export const renameDepartment = asyncHandler(async (req: Request, res: Response) => {
  const { name } = body<DepartmentInput>(req);
  return sendOk(res, await DepartmentService.rename(tenantOf(req), idOf(req), name), "Department renamed");
});

export const deleteDepartment = asyncHandler(async (req: Request, res: Response) => {
  return sendOk(res, await DepartmentService.remove(tenantOf(req), idOf(req)), "Department deleted");
});

export const listClasses = asyncHandler(async (req: Request, res: Response) => {
  return sendOk(res, await ClassService.list(tenantOf(req), req.validatedQuery as ListClassesQuery));
});

export const getClass = asyncHandler(async (req: Request, res: Response) => {
  return sendOk(res, await ClassService.get(tenantOf(req), idOf(req)));
});

export const createClass = asyncHandler(async (req: Request, res: Response) => {
  return sendCreated(res, await ClassService.create(tenantOf(req), body<CreateClassInput>(req)), "Class created");
});

export const updateClass = asyncHandler(async (req: Request, res: Response) => {
  return sendOk(res, await ClassService.update(tenantOf(req), idOf(req), body<UpdateClassInput>(req)), "Class updated");
});

export const deleteClass = asyncHandler(async (req: Request, res: Response) => {
  return sendOk(res, await ClassService.remove(tenantOf(req), idOf(req)), "Class deleted");
});

export const createSection = asyncHandler(async (req: Request, res: Response) => {
  return sendCreated(
    res,
    await SectionService.create(tenantOf(req), idOf(req), body<CreateSectionInput>(req)),
    "Section created"
  );
});

export const updateSection = asyncHandler(async (req: Request, res: Response) => {
  return sendOk(
    res,
    await SectionService.update(tenantOf(req), idOf(req), body<UpdateSectionInput>(req)),
    "Section updated"
  );
});

export const deleteSection = asyncHandler(async (req: Request, res: Response) => {
  await SectionService.remove(tenantOf(req), idOf(req));
  return sendOk(res, null, "Section deleted");
});
