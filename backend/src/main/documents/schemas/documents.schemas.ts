import { z } from "zod";

const OBJECT_ID = /^[a-f\d]{24}$/i;
export const objectId = z.string().regex(OBJECT_ID, "Invalid id");
export const idParamSchema = z.object({ id: objectId });
export const classCardsQuerySchema = z.object({ sectionId: objectId.optional() });
export const reportQuerySchema = z.object({ examId: objectId });
export const classReportQuerySchema = z.object({ examId: objectId, sectionId: objectId.optional() });

export const settingsSchema = z
  .object({
    passPercent: z.number({ required_error: "Enter the pass mark", invalid_type_error: "Enter the pass mark" }).int("The pass mark is a whole number").min(1, "The pass mark is 1 to 100").max(100, "The pass mark is 1 to 100"),
    gradeBands: z
      .array(
        z.object({
          min: z.number({ invalid_type_error: "Enter the starting percentage" }).int("Percentages are whole numbers").min(0, "A percentage is 0 to 100").max(100, "A percentage is 0 to 100"),
          grade: z
            .string({ required_error: "Enter the grade", invalid_type_error: "Enter the grade" })
            .trim()
            .min(1, "Enter the grade")
            .max(12, "A grade is up to 12 letters")
            .regex(/^[^<>]*$/, "A grade cannot contain < or >"),
        }),
        { required_error: "Add the grades" }
      )
      .min(2, "A scale has at least 2 grades")
      .max(12, "A scale has up to 12 grades"),
    showRank: z.boolean({ invalid_type_error: "Choose whether to show the rank" }).default(true),
    principalName: z
      .string({ invalid_type_error: "The name must be text" })
      .trim()
      .max(80, "Keep the name under 80 characters")
      .regex(/^[^<>]*$/, "The name cannot contain < or >")
      .nullish()
      .transform((v) => v || null),
  })
  .superRefine((v, ctx) => {
    const mins = v.gradeBands.map((b) => b.min);
    if (!mins.includes(0)) ctx.addIssue({ code: "custom", path: ["gradeBands"], message: "The lowest grade must start at 0, so every percentage has a grade" });
    if (new Set(mins).size !== mins.length) ctx.addIssue({ code: "custom", path: ["gradeBands"], message: "Two grades start at the same percentage" });
    const names = v.gradeBands.map((b) => b.grade.toLowerCase());
    if (new Set(names).size !== names.length) ctx.addIssue({ code: "custom", path: ["gradeBands"], message: "A grade is named once" });
  });
export type SettingsInput = z.output<typeof settingsSchema>;

export const remarkSchema = z.object({
  studentId: objectId,
  examId: objectId,
  remark: z
    .string({ invalid_type_error: "The remark must be text" })
    .trim()
    .max(300, "Keep the remark under 300 characters")
    .regex(/^[^<>]*$/, "The remark cannot contain < or >"),
});

export const issueCertificateSchema = z.object({
  type: z.enum(["bonafide", "character", "transfer"], { errorMap: () => ({ message: "Choose the kind of certificate" }) }),
  purpose: z
    .string({ invalid_type_error: "The purpose must be text" })
    .trim()
    .max(200, "Keep the purpose under 200 characters")
    .regex(/^[^<>]*$/, "The purpose cannot contain < or >")
    .nullish()
    .transform((v) => v || null),
  conduct: z
    .string({ invalid_type_error: "The conduct must be text" })
    .trim()
    .max(60, "Keep the conduct under 60 characters")
    .regex(/^[^<>]*$/, "The conduct cannot contain < or >")
    .nullish()
    .transform((v) => v || null),
});
export const cancelCertificateSchema = z.object({
  reason: z
    .string({ required_error: "Write why it is cancelled", invalid_type_error: "Write why it is cancelled" })
    .trim()
    .min(1, "Write why it is cancelled")
    .max(200, "Keep the reason under 200 characters")
    .regex(/^[^<>]*$/, "The reason cannot contain < or >"),
});
export const certificatesQuerySchema = z.object({ type: z.enum(["bonafide", "character", "transfer"]).optional(), studentId: objectId.optional() });

export const studentSearchQuerySchema = z.object({ q: z.string().trim().max(60).default("") });
