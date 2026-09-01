import express from "express";
// ... your existing imports
import { submitKycAndBankDetails } from "../controllers/creatorOnboardingController.js";
import { verifyAuth } from "../middleware/authMiddleware.js";

const router = express.Router();

// ... existing routes (apply, storefront, dashboard/stats, admin)

// --- ONBOARDING WIZARD ROUTES ---
// Step 1: Basic Profile & Legal Agreement (handled by existing applyForCreator)
// Step 2 & 3: KYC & Bank Linking
router.post("/onboarding/kyc-bank", verifyAuth, submitKycAndBankDetails);

export default router;