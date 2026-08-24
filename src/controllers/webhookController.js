import { MonetizationService } from "../services/monetizationService.js";

// ==========================================
// 1. ADMIN: PRODUCT & ENTITLEMENT MANAGEMENT
// ==========================================

export const createProduct = async (req, res) => {
    try {
        // req.body should include entitlements: [{ collectionId: "..." }, { testId: "..." }]
        const newProduct = await MonetizationService.createProduct(req.body);
        res.status(201).json({ success: true, data: newProduct });
    } catch (error) {
        console.error("[Create Product Error]:", error);
        res.status(500).json({ success: false, message: "Failed to create product." });
    }
};

export const updateProduct = async (req, res) => {
    try {
        const updatedProduct = await MonetizationService.updateProduct(req.params.productId, req.body);
        res.status(200).json({ success: true, data: updatedProduct });
    } catch (error) {
        console.error("[Update Product Error]:", error);
        res.status(500).json({ success: false, message: "Failed to update product." });
    }
};

export const getAllProducts = async (req, res) => {
    try {
        const products = await MonetizationService.getAllProducts(req.query);
        res.status(200).json({ success: true, data: products });
    } catch (error) {
        console.error("[Fetch Products Error]:", error);
        res.status(500).json({ success: false, message: "Failed to fetch products." });
    }
};

// ==========================================
// 2. ADMIN: REFUND MANAGEMENT
// ==========================================

export const refundTransaction = async (req, res) => {
    try {
        const { transactionId } = req.params;
        const { reason } = req.body;

        // Ensure only admins can trigger this (assuming req.user contains role check in middleware)
        if (!["ADMIN", "SUPERADMIN"].includes(req.user.role)) {
            return res.status(403).json({ success: false, message: "Unauthorized to process refunds." });
        }

        const refundResult = await MonetizationService.processRefund(req.user.id, transactionId, reason);
        
        res.status(200).json({ 
            success: true, 
            message: refundResult.message,
            data: { refundId: refundResult.refundId }
        });
    } catch (error) {
        console.error("[Refund Processing Error]:", error);
        if (["TRANSACTION_NOT_FOUND", "ALREADY_REFUNDED", "CAN_ONLY_REFUND_SUCCESSFUL_TRANSACTIONS"].includes(error.message)) {
            return res.status(400).json({ success: false, message: error.message });
        }
        res.status(500).json({ success: false, message: "Failed to process refund." });
    }
};


// ==========================================
// 3. STUDENT: CHECKOUT & PAYMENTS
// ==========================================

export const initiateCheckout = async (req, res) => {
    try {
        const { productId } = req.body;
        const checkoutData = await MonetizationService.initiatePurchase(req.user.id, productId);
        
        res.status(200).json({ 
            success: true, 
            message: "Razorpay order created.",
            data: checkoutData 
        });
    } catch (error) {
        if (error.message === "PRODUCT_UNAVAILABLE") {
            return res.status(404).json({ success: false, message: "Product is currently unavailable." });
        }
        if (error.message === "INVALID_PRICE") {
            return res.status(400).json({ success: false, message: "Invalid product pricing configuration." });
        }
        console.error("[Checkout Init Error]:", error);
        res.status(500).json({ success: false, message: "Failed to initiate payment." });
    }
};

export const verifyCheckout = async (req, res) => {
    try {
        const { razorpay_order_id, razorpay_payment_id, razorpay_signature, productId } = req.body;

        const subscription = await MonetizationService.verifyAndActivateSubscription(req.user.id, {
            razorpayOrderId: razorpay_order_id,
            razorpayPaymentId: razorpay_payment_id,
            razorpaySignature: razorpay_signature,
            productId
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
        
        if (["TRANSACTION_NOT_FOUND", "PRODUCT_NOT_FOUND"].includes(error.message)) {
            return res.status(404).json({ success: false, message: error.message });
        }

        res.status(400).json({ success: false, message: error.message || "Payment verification failed." });
    }
};

// ==========================================
// 4. SYSTEM: WEBHOOK HANDLER
// ==========================================

export const handleRazorpayWebhook = async (req, res) => {
    try {
        const signature = req.headers["x-razorpay-signature"];
        // Note: Express must be configured to pass rawBody for webhooks to work correctly
        await MonetizationService.handleWebhook(signature, req.rawBody || JSON.stringify(req.body));
        
        res.status(200).json({ status: "ok" });
    } catch (error) {
        console.error("[Webhook Error]:", error);
        // Returning 400 tells Razorpay to retry the webhook later
        res.status(400).json({ status: "failed", message: error.message });
    }
};