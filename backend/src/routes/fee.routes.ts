import { Router } from "express";
import { FeeHead } from "../models/Fee";
import { crudFactory } from "../utils/crudFactory";
import { requireAuth, requireRole } from "../middleware/auth";
import {
  upsertFeeStructure,
  listFeeStructures,
  createConcession,
  listConcessions,
  getStudentFeeSummary,
  collectOfflinePayment,
  markChequeBounced,
  listTransactions,
  createOnlineOrder,
  verifyOnlinePayment,
  feeDashboard,
  outstandingDuesReport,
} from "../controllers/fee.controller";
import { createRefundRequest, listRefunds, decideRefund, processRefund } from "../controllers/feeRefund.controller";

const router = Router();
const feeHeadCtrl = crudFactory(FeeHead);

router.use(requireAuth);

// Fee heads
router.get("/heads", feeHeadCtrl.list);
router.post("/heads", requireRole("super_admin", "school_admin", "accountant"), feeHeadCtrl.create);
router.patch("/heads/:id", requireRole("super_admin", "school_admin", "accountant"), feeHeadCtrl.update);
router.delete("/heads/:id", requireRole("super_admin", "school_admin"), feeHeadCtrl.remove);

// Fee structure
router.get("/structures", listFeeStructures);
router.post("/structures", requireRole("super_admin", "school_admin", "accountant"), upsertFeeStructure);

// Concessions
router.get("/concessions", listConcessions);
router.post("/concessions", requireRole("super_admin", "school_admin", "accountant"), createConcession);

// Student summary
router.get("/students/:studentId/summary", getStudentFeeSummary);

// Offline collection
router.post("/collect", requireRole("super_admin", "school_admin", "accountant"), collectOfflinePayment);
router.patch("/transactions/:id/bounce", requireRole("super_admin", "school_admin", "accountant"), markChequeBounced);
router.get("/transactions", listTransactions);

// Online payment (Razorpay)
router.post("/online/order", requireRole("parent", "school_admin", "accountant", "super_admin"), createOnlineOrder);
router.post("/online/verify", requireRole("parent", "school_admin", "accountant", "super_admin"), verifyOnlinePayment);

// Refunds (S-5.5)
router.post("/refunds", requireRole("super_admin", "school_admin", "accountant"), createRefundRequest);
router.get("/refunds", listRefunds);
router.patch("/refunds/:id/decide", requireRole("super_admin", "school_admin", "principal"), decideRefund);
router.patch("/refunds/:id/process", requireRole("super_admin", "school_admin", "accountant"), processRefund);

// Reports
router.get("/dashboard", feeDashboard);
router.get("/reports/outstanding", outstandingDuesReport);

export default router;
