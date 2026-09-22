import { Request, Response } from "express";
import { Guardian } from "../models/Guardian";
import { asyncHandler } from "../utils/asyncHandler";
import { ApiError } from "../utils/ApiError";

function scopeFilter(req: Request) {
  const filter: Record<string, unknown> = {};
  if (req.user?.role !== "super_admin") filter.tenantId = req.user?.tenantId;
  return filter;
}

// User-supplied search text can never be interpolated into a $regex
// unescaped — special regex characters would either break the query or, in
// pathological cases, cause catastrophic backtracking (ReDoS).
function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Search by phone or name — used both to link a sibling's admission to an
// existing guardian (BR-07) and to pick a guardian when provisioning a
// parent portal login.
export const searchGuardians = asyncHandler(async (req: Request, res: Response) => {
  const q = String(req.query.q ?? "").trim();
  if (!q) return res.json({ success: true, data: [] });

  const pattern = escapeRegex(q);
  const guardians = await Guardian.find({
    ...scopeFilter(req),
    $or: [{ phone: { $regex: pattern, $options: "i" } }, { name: { $regex: pattern, $options: "i" } }],
  })
    .populate("studentIds", "firstName lastName admissionNumber")
    .limit(10);

  res.json({ success: true, data: guardians });
});

export const getGuardian = asyncHandler(async (req: Request, res: Response) => {
  const guardian = await Guardian.findOne({ _id: req.params.id, ...scopeFilter(req) }).populate(
    "studentIds",
    "firstName lastName admissionNumber"
  );
  if (!guardian) throw ApiError.notFound("Guardian not found");
  res.json({ success: true, data: guardian });
});
