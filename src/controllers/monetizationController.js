import { MonetizationService } from "../services/monetizationService.js";


// ==========================================
// ADMIN: PACKAGE (BUNDLE) MANAGEMENT
// ==========================================

export const createPackage = async (req, res) => {
    try {
        // req.body should include testSeriesIds: ["id1", "id2"]
        const newPackage = await MonetizationService.createPackage(req.body);
        res.status(201).json({ success: true, data: newPackage });
    } catch (error) {
        console.error("[Create Package Error]:", error);
        res.status(500).json({ success: false, message: "Failed to create package bundle." });
    }
};

export const updatePackage = async (req, res) => {
    try {
        const updatedPackage = await MonetizationService.updatePackage(req.params.packageId, req.body);
        res.status(200).json({ success: true, data: updatedPackage });
    } catch (error) {
        console.error("[Update Package Error]:", error);
        res.status(500).json({ success: false, message: "Failed to update package." });
    }
};

export const getAllPackages = async (req, res) => {
    try {
        const packages = await MonetizationService.getAllPackages(req.query);
        res.status(200).json({ success: true, data: packages });
    } catch (error) {
        res.status(500).json({ success: false, message: "Failed to fetch packages." });
    }
};


export const initiateCheckout = async (req, res) => {
    try {
        const { packageId } = req.body;
        const checkoutData = await MonetizationService.initiatePurchase(req.user.id, packageId);
        
        res.status(200).json({ 
            success: true, 
            message: "Razorpay order created.",
            data: checkoutData 
        });
    } catch (error) {
        if (error.message === "PACKAGE_UNAVAILABLE") {
            return res.status(404).json({ success: false, message: "Package not available." });
        }
        console.error("[Checkout Init Error]:", error);
        res.status(500).json({ success: false, message: "Failed to initiate payment." });
    }
};

export const verifyCheckout = async (req, res) => {
    try {
        const { razorpay_order_id, razorpay_payment_id, razorpay_signature, packageId } = req.body;

        const subscription = await MonetizationService.verifyAndActivateSubscription(req.user.id, {
            razorpayOrderId: razorpay_order_id,
            razorpayPaymentId: razorpay_payment_id,
            razorpaySignature: razorpay_signature,
            packageId
        });

        res.status(200).json({ 
            success: true, 
            message: "Payment verified and subscription activated.",
            data: subscription 
        });
    } catch (error) {
        console.error("[Verification Error]:", error);
        if (error.message === "INVALID_PAYMENT_SIGNATURE") {
            return res.status(400).json({ success: false, message: "Payment tampering detected. Signature mismatch." });
        }
        res.status(400).json({ success: false, message: error.message || "Payment verification failed." });
    }
};

export const handleRazorpayWebhook = async (req, res) => {
    try {
        const signature = req.headers["x-razorpay-signature"];
        await MonetizationService.handleWebhook(signature, req.rawBody || JSON.stringify(req.body));
        res.status(200).json({ status: "ok" });
    } catch (error) {
        console.error("[Webhook Error]:", error);
        res.status(400).json({ status: "failed", message: error.message });
    }
};