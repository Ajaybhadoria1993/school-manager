import { Router } from "express";
import { requireAuth, requireRole } from "../../../../middleware/auth";
import { requireSchoolPermission } from "../../../../middleware/permission";
import { validate } from "../../../../middleware/validate";
import { yearView } from "../../../../middleware/yearView";
import { DASHBOARD_READERS } from "../../constants";
import { schoolDashboard, schoolTrend } from "../../controllers/dashboard.controller";
import { dashboardQuerySchema, trendQuerySchema } from "../../schemas/dashboard.schemas";

/**
 * `/api/v1/dashboard`: the home pages' numbers, each in one answer. The student numbers follow the year a school admin is looking at
 * (X-Academic-Year); what is about today (attendance, leaves, the calendar) is always today.
 */
const router = Router();

router.use(requireAuth, yearView);

// `?from=&to=`: the days the head picked (none: today), each figure with the same number of days just before it.
router.get("/school", requireSchoolPermission("dashboard.view"), validate(dashboardQuerySchema, "query"), schoolDashboard);
// `?period=week|month`: the children's attendance day by day, for the chart.
router.get("/school/trend", requireSchoolPermission("dashboard.view"), validate(trendQuerySchema, "query"), schoolTrend);

export default router;
