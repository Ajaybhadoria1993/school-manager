import { z } from "zod";
import { MAX_RANGE_DAYS } from "../../attendance/constants";
import { dayText } from "../../classroom/schemas/classroom.schemas";

/** The request shapes of the school's home page. */

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * The days the head picked (2026-11-10: Today, This week, This month or any days): both or neither (neither is today), the first not
 * after the last, a year at most.
 */
export const dashboardQuerySchema = z
  .object({ from: dayText("first day").optional(), to: dayText("last day").optional() })
  .superRefine((v, ctx) => {
    if (!v.from && !v.to) return;
    if (!v.from || !v.to) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: [v.from ? "to" : "from"], message: "Choose the first and the last day" });
      return;
    }
    const days = (Date.parse(`${v.to}T00:00:00Z`) - Date.parse(`${v.from}T00:00:00Z`)) / DAY_MS + 1;
    if (days < 1) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["to"], message: "The last day cannot be before the first day" });
    else if (days > MAX_RANGE_DAYS) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["to"], message: "Choose a year or less" });
  });
export type DashboardQuery = z.infer<typeof dashboardQuerySchema>;

/** The children's attendance day by day: this week (Monday to Sunday) or this month. */
export const trendQuerySchema = z.object({ period: z.enum(["week", "month"], { message: "Choose week or month" }) });
export type TrendQuery = z.infer<typeof trendQuerySchema>;
