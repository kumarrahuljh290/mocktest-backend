import { Router } from "express";
import {
    createProduct, updateProduct, getAllProducts, refundTransaction,
    initiateCheckout, verifyCheckout, handleRazorpayWebhook
} from "../controllers/monetizationController.js";
import { authMiddleware, roleMiddleware } from "../middlewares/authMiddleware.js";

const monetizationRoute = Router();

const adminOnly = [authMiddleware, roleMiddleware(["ADMIN", "SUPERADMIN"])];

// ==========================================
// ADMIN: PRODUCT & REFUND MANAGEMENT
// ==========================================
monetizationRoute.post("/products", adminOnly, createProduct);
monetizationRoute.patch("/products/:productId", adminOnly, updateProduct);
monetizationRoute.post("/refunds/:transactionId", adminOnly, refundTransaction);

// ==========================================
// PUBLIC / STUDENT: CATALOG
// ==========================================
// Anyone can view the catalog (pass ?includeInactive=true for admins)
monetizationRoute.get("/products", getAllProducts);

// ==========================================
// STUDENT: CHECKOUT FLOW
// ==========================================
monetizationRoute.post("/checkout/initiate", authMiddleware, initiateCheckout);
monetizationRoute.post("/checkout/verify", authMiddleware, verifyCheckout);

// ==========================================
// SYSTEM: WEBHOOK (Razorpay)
// ==========================================
// CRITICAL: Razorpay webhooks require the raw body buffer to verify the signature. 
// Ensure your main express app uses express.raw({ type: 'application/json' }) for this specific route!
monetizationRoute.post("/webhook/razorpay", handleRazorpayWebhook);

export default monetizationRoute;