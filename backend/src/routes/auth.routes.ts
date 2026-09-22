import { Router } from "express";
import { login, me } from "../controllers/auth.controller";
import { requireAuth } from "../middleware/auth";
import { loginLimiter } from "../middleware/rateLimit";

const router = Router();

router.post("/login", loginLimiter, login);
router.get("/me", requireAuth, me);

export default router;
