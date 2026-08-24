import { Router } from "express";
import {
    createPackage,
    updatePackage,
    getAllPackages,
    initiateCheckout,
    verifyCheckout,
    handleRazorpayWebhook
} from "../controllers/monetizationController.js";
import { authMiddleware, roleMiddleware } from "../middlewares/authMiddleware.js";

const monetizationRoute = Router();

const adminOnly = [authMiddleware, roleMiddleware(["ADMIN", "SUPERADMIN"])];

// ==========================================
// ADMIN: PACKAGE (BUNDLE) MANAGEMENT
// ==========================================
monetizationRoute.post("/packages", adminOnly, createPackage);
monetizationRoute.patch("/packages/:packageId", adminOnly, updatePackage);

// ==========================================
// PUBLIC / STUDENT: CATALOG
// ==========================================
// Anyone can view available packages (supports query params like ?includeInactive=true for admins)
monetizationRoute.get("/packages", getAllPackages);

// ==========================================
// STUDENT: CHECKOUT FLOW
// ==========================================
monetizationRoute.post("/checkout/initiate", authMiddleware, initiateCheckout);
monetizationRoute.post("/checkout/verify", authMiddleware, verifyCheckout);

// ==========================================
// SYSTEM: WEBHOOK (Razorpay)
// ==========================================
// Note: Ensure your Express app passes the raw body buffer for this endpoint to verify signature
monetizationRoute.post("/webhook/razorpay", handleRazorpayWebhook);

export default monetizationRoute;