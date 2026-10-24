import { z } from "zod";

/** The longest a school year may run. A guard against a typo in the year (2026 to 2062), not a rule about how schools work. */
export const MAX_ACADEMIC_YEAR_DAYS = 731;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * A calendar day as the form sends it, "2026-04-01", turned into midnight UTC of that day. A day that does not exist
 * (2026-02-30) is refused rather than rolled over into March.
 */
const calendarDay = (what: string) =>
  z
    .string({ required_error: `Choose the ${what}`, invalid_type_error: `Choose the ${what}` })
    .trim()
    .min(1, `Choose the ${what}`)
    // Empty is left to .min(): one message per box, not two.
    .regex(/^(\d{4}-\d{2}-\d{2})?$/, `Choose a valid ${what}`)
    .transform((value, ctx) => {
      // An empty box was already reported by .min() (Zod still runs this step): nothing more to say about it.
      if (!value) return z.NEVER;
      const day = new Date(`${value}T00:00:00.000Z`);
      if (Number.isNaN(day.getTime()) || day.toISOString().slice(0, 10) !== value) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Choose a valid ${what}` });
        return z.NEVER;
      }
      const year = day.getUTCFullYear();
      if (year < 2000 || year > 2100) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Choose a ${what} between 2000 and 2100` });
        return z.NEVER;
      }
      return day;
    });

/**
 * An academic year as a school names it: its name and its own first and last day. The dates are the school's choice
 * (April to March, June to May, January to December...); only the order is checked: the end must come after the start.
 */
export const academicYearInputSchema = z
  .object(
    {
    name: z
      .string({ required_error: "Enter the academic year name", invalid_type_error: "Enter the academic year name" })
      .trim()
      .min(4, "Enter the academic year name, for example 2026-2027")
      .max(20, "Keep the academic year name under 20 characters")
      .regex(/^[A-Za-z0-9 /._-]*$/, "Use only letters, digits, spaces and - / . _ in the name")
      .transform((value) => value.replace(/\s+/g, " ")),
    startDate: calendarDay("start date"),
    endDate: calendarDay("end date"),
    },
    { required_error: "Enter the academic year", invalid_type_error: "Enter the academic year" }
  )
  .superRefine((year, ctx) => {
    // Only two real days can be compared; a missing or impossible one already has its own message.
    if (!(year.startDate instanceof Date) || !(year.endDate instanceof Date)) return;
    if (year.endDate.getTime() <= year.startDate.getTime()) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["endDate"], message: "The end date must be after the start date" });
    } else if ((year.endDate.getTime() - year.startDate.getTime()) / DAY_MS > MAX_ACADEMIC_YEAR_DAYS) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["endDate"], message: "An academic year can be at most two years long" });
    }
  });

export type AcademicYearInput = z.infer<typeof academicYearInputSchema>;
