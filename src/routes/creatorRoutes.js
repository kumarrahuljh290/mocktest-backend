import express from "express";
import { 
    applyForCreator, 
    getCreatorStorefront, 
    getDashboardStats, 
    getPendingApplications, 
    updateCreatorStatus 
} from "../controllers/creatorController.js";
import { verifyAuth, verifyAdmin } from "../middleware/authMiddleware.js";
import { verifyCreatorOrAdmin } from "../middleware/authMiddleware.js";

const router = express.Router();

// --- 1. PUBLIC STOREFRONT ROUTE ---
// Accessible without login (Sharable on WhatsApp, Telegram, YouTube)
router.get("/storefront/:slug", getCreatorStorefront);

// --- 2. ONBOARDING ROUTE ---
// Standard students apply to become creators
router.post("/apply", verifyAuth, applyForCreator);

// --- 3. CREATOR DASHBOARD ROUTES ---
// Protected: Only ACTIVE creators & Admins
router.get("/dashboard/stats", verifyAuth, verifyCreatorOrAdmin, getDashboardStats);

// --- 4. SUPERADMIN MODERATION ROUTES ---
// Protected: Admins / SuperAdmins only
router.get("/admin/pending", verifyAuth, verifyAdmin, getPendingApplications);
router.patch("/admin/:creatorProfileId/status", verifyAuth, verifyAdmin, updateCreatorStatus);

export default router;