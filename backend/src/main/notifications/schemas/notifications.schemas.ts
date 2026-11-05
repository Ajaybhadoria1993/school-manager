import { z } from "zod";

const objectId = z.string().regex(/^[a-f\d]{24}$/i, "Invalid id");

export const notificationIdSchema = z.object({ id: objectId });

/** A page of the bell: `limit` (1-50, 20 when not said) older than the notification `before`. */
export const bellQuerySchema = z.object({
  before: objectId.optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});
export type BellQueryInput = z.infer<typeof bellQuerySchema>;
