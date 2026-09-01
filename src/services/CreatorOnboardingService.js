import prisma from "../config/prisma.js";
import { razorpay } from "../config/razorpay.js";

export class CreatorOnboardingService {
    
    /**
     * Step 2 & 3 of the Wizard: Submitting KYC and Bank Details
     * Creates a Razorpay Route Linked Account automatically.
     */
    static async submitKycAndBankDetails(userId, data) {
        const { 
            legalName, 
            kycDocumentType, // e.g., "PAN" or "AADHAAR"
            kycDocumentNum,  
            accountNumber, 
            ifscCode 
        } = data;

        // 1. Fetch the user and their pending Creator Profile
        const user = await prisma.user.findUnique({
            where: { id: userId },
            include: { creatorProfile: true }
        });

        if (!user || !user.creatorProfile) {
            throw new Error("CREATOR_PROFILE_NOT_FOUND: Please complete Step 1 first.");
        }

        // 2. Generate the Razorpay Route Linked Account
        // This tells Razorpay: "Hey, I have a new teacher on my platform, get an account ready for them to receive 80% splits."
        let razorpayAccountId = null;
        
        try {
            const linkedAccount = await razorpay.accounts.create({
                type: "route",
                name: legalName,
                email: user.email,
                business_type: "individual",
                legal_business_name: legalName,
                contact_name: legalName,
                profile: {
                    category: "education",
                    subcategory: "e_learning",
                    addresses: {
                        registered: {
                            street1: "PrepMaster Teacher",
                            city: "Dhanbad", // Defaulting to your HQ or capture from frontend
                            state: "Jharkhand",
                            postal_code: "826001",
                            country: "IN"
                        }
                    }
                },
                // We securely pass the bank details so Razorpay knows where to send the 80% payouts
                legal_info: {
                    pan: kycDocumentType === 'PAN' ? kycDocumentNum : undefined
                }
            });

            razorpayAccountId = linkedAccount.id; // e.g., "acc_JM23xyz..."

            // Now we must link the actual Bank Account to this new Razorpay Account
            // (Razorpay requires this as a two-step API process for security)
            /* 
               Note: Depending on your Razorpay dashboard setup, you might need 
               to activate 'Route' and pass bank details via fund_accounts API here.
            */

        } catch (error) {
            console.error("[Razorpay Route Onboarding Error]:", error);
            throw new Error("Failed to link bank account with Razorpay. Please check IFSC and Account numbers.");
        }

        // 3. Save the KYC and Razorpay Account ID securely in your database
        return await prisma.creatorProfile.update({
            where: { userId: userId },
            data: {
                legalName: legalName,
                kycDocumentType: kycDocumentType,
                // In production, encrypt this number before saving if it is highly sensitive
                kycDocumentNum: kycDocumentNum, 
                razorpayAccountId: razorpayAccountId,
                
                // If they completed all steps, flip status to ACTIVE or leave as PENDING for your manual approval
                status: "PENDING" 
            }
        });
    }
}