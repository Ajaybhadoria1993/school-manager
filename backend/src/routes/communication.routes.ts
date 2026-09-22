import { Router } from "express";
import { createNotice, listNotices, markNoticeRead, getReadReceipts } from "../controllers/notice.controller";
import { startConversation, listConversations, listMessages, sendMessage } from "../controllers/message.controller";
import { requireAuth, requireRole } from "../middleware/auth";

const router = Router();

router.use(requireAuth);

router.get("/notices", listNotices);
router.post("/notices", requireRole("super_admin", "school_admin", "principal", "teacher"), createNotice);
router.post("/notices/:id/read", markNoticeRead);
router.get(
  "/notices/:id/read-receipts",
  requireRole("super_admin", "school_admin", "principal", "teacher"),
  getReadReceipts
);

router.post("/conversations", requireRole("parent", "teacher", "school_admin", "principal", "super_admin"), startConversation);
router.get("/conversations", listConversations);
router.get("/conversations/:id/messages", listMessages);
router.post("/conversations/:id/messages", sendMessage);

export default router;
