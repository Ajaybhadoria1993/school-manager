import { NextFunction, Request, Response } from "express";
import { ZodType } from "zod";

type Target = "body" | "params" | "query";

/**
 * Validates req.body / req.params / req.query with a Zod schema. The parsed (trimmed,
 * lower-cased, defaulted) value lands on req.validatedBody / validatedParams / validatedQuery;
 * controllers read only from there. A ZodError goes to the error handler (400, field list).
 */
export function validate<T>(schema: ZodType<T, any, any>, target: Target = "body") {
  return (req: Request, _res: Response, next: NextFunction) => {
    const parsed = schema.safeParse(req[target]);
    if (!parsed.success) return next(parsed.error);
    if (target === "body") req.validatedBody = parsed.data;
    else if (target === "params") req.validatedParams = parsed.data;
    else req.validatedQuery = parsed.data;
    next();
  };
}
