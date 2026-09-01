import express from "express";
import { 
    applyForCreator, 
    getCreatorStorefront, 
    getDashboardStats, 
    getPendingApplications, 
    updateCreatorStatus 
} from "../controllers/creatorController.js";
import { authMiddleware, verifyCreatorOrAdmin } from "../middlewares/authMiddleware.js";

const creatorRoute = express.Router();

// --- 1. PUBLIC STOREFRONT ROUTE ---
// Accessible without login (Sharable on WhatsApp, Telegram, YouTube)
creatorRoute.get("/storefront/:slug", getCreatorStorefront);

// --- 2. ONBOARDING ROUTE ---
// Standard students apply to become creators
creatorRoute.post("/apply", authMiddleware, applyForCreator);

// --- 3. CREATOR DASHBOARD ROUTES ---
// Protected: Only ACTIVE creators & Admins
creatorRoute.get("/dashboard/stats", authMiddleware, verifyCreatorOrAdmin, getDashboardStats);

// --- 4. SUPERADMIN MODERATION ROUTES ---
// Protected: Admins / SuperAdmins only
creatorRoute.get("/admin/pending", authMiddleware, verifyCreatorOrAdmin, getPendingApplications);
creatorRoute.patch("/admin/:creatorProfileId/status", authMiddleware, verifyCreatorOrAdmin, updateCreatorStatus);

export default creatorRoute;