import { CreatorOnboardingService } from "../services/CreatorOnboardingService.js";

/**
 * Handles the KYC & Bank Details submission for new creators.
 * POST /api/v1/creators/onboarding/kyc-bank
 */
export const submitKycAndBankDetails = async (req, res) => {
    try {
        const userId = req.user.id;
        
        const { 
            legalName, 
            kycDocumentType, 
            kycDocumentNum, 
            accountNumber, 
            ifscCode 
        } = req.body;

        // 1. Strict Payload Validation
        if (!legalName || !kycDocumentType || !kycDocumentNum || !accountNumber || !ifscCode) {
            return res.status(400).json({ 
                success: false, 
                message: "All KYC and Banking fields are required to process payments." 
            });
        }

        // 2. Process the Wizard Data
        const updatedProfile = await CreatorOnboardingService.processOnboardingWizard(userId, req.body);

        // 3. Respond with clean UI state data
        res.status(200).json({
            success: true,
            message: "Bank details verified and linked successfully! Your application is now under review.",
            data: {
                status: updatedProfile.status, // Will be "PENDING"
                isKycVerified: updatedProfile.isKycVerified,
                hasBankDetailsLinked: !!updatedProfile.razorpayAccountId
            }
        });

    } catch (error) {
        console.error("[Creator Onboarding Error]:", error);
        
        // Map known errors to clean client messages
        if (error.message.includes("CREATOR_PROFILE_NOT_FOUND")) {
            return res.status(404).json({ success: false, message: error.message });
        }
        if (error.message.includes("ACCOUNT_ALREADY_LINKED")) {
            return res.status(400).json({ success: false, message: error.message });
        }

        res.status(500).json({ 
            success: false, 
            message: error.message || "An error occurred while linking your bank account." 
        });
    }
};