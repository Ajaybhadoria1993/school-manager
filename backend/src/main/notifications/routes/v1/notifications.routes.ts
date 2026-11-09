import { Router } from "express";
import { requireAuth } from "../../../../middleware/auth";
import { validate } from "../../../../middleware/validate";
import { listNotifications, readAllNotifications, readNotification } from "../../controllers/notifications.controller";
import { bellQuerySchema, notificationIdSchema } from "../../schemas/notifications.schemas";

/**
 * `/api/v1/notifications`: the signed-in person's own bell (docs/notifications.md), whatever their role. New ones also arrive live on the
 * socket (src/realtime/socket.ts); reading here tells the person's other tabs the new unread count.
 */
const router = Router();
router.use(requireAuth);

router.get("/", validate(bellQuerySchema, "query"), listNotifications);
router.post("/read-all", readAllNotifications);
router.post("/:id/read", validate(notificationIdSchema, "params"), readNotification);

export default router;
