import { Request, Response, Router } from "express";
import { Types } from "mongoose";
import { ApiError } from "../../../../utils/ApiError";
import { asyncHandler } from "../../../../utils/asyncHandler";
import { SchoolLogo } from "../../models/SchoolLogo";

const router = Router();

/**
 * A school's logo. Open to anyone, because an image tag cannot send a sign-in, and a logo is printed on what the school hands out anyway.
 * The address carries a version (`?v=`), so a browser may keep it for a long time and still see a new one at once.
 */
router.get(
  "/schools/:id/logo",
  asyncHandler(async (req: Request, res: Response) => {
    const notFound = () => ApiError.notFound("This school has no logo", "NOT_FOUND");
    if (!Types.ObjectId.isValid(req.params.id)) throw notFound();
    const logo = await SchoolLogo.findOne({ tenantId: new Types.ObjectId(req.params.id) }).select("data contentType").lean();
    if (!logo) throw notFound();
    res.set({
      "Content-Type": logo.contentType,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "public, max-age=604800",
      // The web app can live on another address than the API.
      "Cross-Origin-Resource-Policy": "cross-origin",
    });
    res.send(Buffer.from(logo.data.buffer));
  })
);

export default router;
