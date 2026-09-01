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

const creatorRoute = express.Router();

// --- 1. PUBLIC STOREFRONT ROUTE ---
// Accessible without login (Sharable on WhatsApp, Telegram, YouTube)
creatorRoute.get("/storefront/:slug", getCreatorStorefront);

// --- 2. ONBOARDING ROUTE ---
// Standard students apply to become creators
creatorRoute.post("/apply", verifyAuth, applyForCreator);

// --- 3. CREATOR DASHBOARD ROUTES ---
// Protected: Only ACTIVE creators & Admins
creatorRoute.get("/dashboard/stats", verifyAuth, verifyCreatorOrAdmin, getDashboardStats);

// --- 4. SUPERADMIN MODERATION ROUTES ---
// Protected: Admins / SuperAdmins only
creatorRoute.get("/admin/pending", verifyAuth, verifyAdmin, getPendingApplications);
creatorRoute.patch("/admin/:creatorProfileId/status", verifyAuth, verifyAdmin, updateCreatorStatus);

export default creatorRoute;