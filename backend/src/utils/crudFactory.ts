import { Request, Response } from "express";
import { Model } from "mongoose";
import { asyncHandler } from "./asyncHandler";
import { ApiError } from "./ApiError";

/**
 * Generic CRUD handlers for simple tenant/branch-scoped master data
 * (Branch, AcademicYear, ClassMaster, Section, Subject, FeeHead).
 * Every request is automatically scoped to req.user.tenantId (and
 * branchId when the model has one) so one tenant/branch can never
 * see or mutate another's masters.
 */
export function crudFactory<T extends { tenantId?: unknown; branchId?: unknown }>(
  model: Model<T>,
  options: { scopeToBranch?: boolean } = {}
) {
  const scopeToBranch = options.scopeToBranch ?? true;

  function scopeFilter(req: Request) {
    const filter: Record<string, unknown> = {};
    if (req.user?.role !== "super_admin") {
      filter.tenantId = req.user?.tenantId;
    }
    if (scopeToBranch && req.query.branchId) {
      filter.branchId = req.query.branchId;
    } else if (scopeToBranch && req.user?.branchId) {
      filter.branchId = req.user.branchId;
    }
    return filter;
  }

  const list = asyncHandler(async (req: Request, res: Response) => {
    const docs = await model.find(scopeFilter(req)).sort({ createdAt: -1 });
    res.json({ success: true, data: docs });
  });

  const getOne = asyncHandler(async (req: Request, res: Response) => {
    const doc = await model.findOne({ _id: req.params.id, ...scopeFilter(req) });
    if (!doc) throw ApiError.notFound();
    res.json({ success: true, data: doc });
  });

  const create = asyncHandler(async (req: Request, res: Response) => {
    const payload = {
      ...req.body,
      tenantId: req.user?.role === "super_admin" ? req.body.tenantId : req.user?.tenantId,
      ...(scopeToBranch ? { branchId: req.body.branchId ?? req.user?.branchId } : {}),
    };
    const doc = await model.create(payload);
    res.status(201).json({ success: true, data: doc });
  });

  const update = asyncHandler(async (req: Request, res: Response) => {
    const doc = await model.findOneAndUpdate({ _id: req.params.id, ...scopeFilter(req) }, req.body, {
      new: true,
      runValidators: true,
    });
    if (!doc) throw ApiError.notFound();
    res.json({ success: true, data: doc });
  });

  const remove = asyncHandler(async (req: Request, res: Response) => {
    const doc = await model.findOneAndDelete({ _id: req.params.id, ...scopeFilter(req) });
    if (!doc) throw ApiError.notFound();
    res.json({ success: true, data: { _id: req.params.id } });
  });

  return { list, getOne, create, update, remove, scopeFilter };
}
