import { MonetizationService } from "../services/monetizationService.js";

// ==========================================
// 1. ADMIN & CREATOR: PACKAGE / PRODUCT MANAGEMENT
// ==========================================

export const createPackage = async (req, res) => {
    try {
        const user = req.user;
        const payload = { ...req.body };

        // If a creator is creating the product, lock ownership to their userId
        if (user && user.role === "CONTENT_CREATOR") {
            payload.creatorId = user.id;
        } else if (user && (user.role === "ADMIN" || user.role === "SUPERADMIN")) {
            // Admins can specify a creatorId or leave it null for PrepMaster Official
            payload.creatorId = req.body.creatorId || null;
        }

        const newPackage = await MonetizationService.createProduct(payload);
        res.status(201).json({ success: true, data: newPackage });
    } catch (error) {
        console.error("[Create Package Error]:", error);
        res.status(500).json({ success: false, message: "Failed to create package bundle." });
    }
};

export const updatePackage = async (req, res) => {
    try {
        const targetId = req.params.packageId || req.params.productId;
        const updatedPackage = await MonetizationService.updateProduct(targetId, req.body);
        res.status(200).json({ success: true, data: updatedPackage });
    } catch (error) {
        console.error("[Update Package Error]:", error);
        res.status(500).json({ success: false, message: "Failed to update package." });
    }
};

export const getAllPackages = async (req, res) => {
    try {
        const filters = {
            includeInactive: req.query.includeInactive === "true",
            creatorId: req.query.creatorId || undefined
        };

        const packages = await MonetizationService.getAllProducts(filters);
        res.status(200).json({ success: true, data: packages });
    } catch (error) {
        console.error("[Get Packages Error]:", error);
        res.status(500).json({ success: false, message: "Failed to fetch packages." });
    }
};

// ==========================================
// 2. CHECKOUT & PAYMENT INITIATION
// ==========================================

export const initiateCheckout = async (req, res) => {
    try {
        // Accepts either packageId or productId from frontend payloads
        const targetId = req.body.packageId || req.body.productId;
        const couponCode = req.body.couponCode?.trim() || null;

        if (!targetId) {
            return res.status(400).json({ success: false, message: "Package/Product ID is required." });
        }

        const result = await MonetizationService.initiatePurchase(req.user.id, targetId, couponCode);

        // 100% Discount / Zero-Rupee Bypass handling
        if (result.isFree) {
            return res.status(200).json({
                success: true,
                isFree: true,
                message: "Package unlocked instantly with 100% discount.",
                data: result
            });
        }

        // Standard Razorpay Order response
        res.status(200).json({
            success: true,
            isFree: false,
            message: "Razorpay order created.",
            data: result
        });
    } catch (error) {
        console.error("[Checkout Init Error]:", error);

        const clientErrors = {
            "PRODUCT_UNAVAILABLE": { status: 404, msg: "Package is currently unavailable." },
            "PACKAGE_UNAVAILABLE": { status: 404, msg: "Package is currently unavailable." },
            "INVALID_PRICE": { status: 400, msg: "Invalid price configuration for this package." },
            "INVALID_COUPON": { status: 400, msg: "The coupon code entered is invalid or inactive." },
            "COUPON_EXPIRED": { status: 400, msg: "This coupon code has expired." },
            "COUPON_LIMIT_REACHED": { status: 400, msg: "This coupon has reached its maximum usage limit." },
            "COUPON_NOT_APPLICABLE_TO_THIS_CREATOR": { status: 400, msg: "This coupon is not valid for this creator's content." },
            "COUPON_NOT_APPLICABLE_TO_THIS_PRODUCT": { status: 400, msg: "This coupon is not valid for this package." }
        };

        const mapped = clientErrors[error.message];
        if (mapped) {
            return res.status(mapped.status).json({ success: false, message: mapped.msg });
        }

        res.status(500).json({ success: false, message: "Failed to initiate payment." });
    }
};

// ==========================================
// 3. PAYMENT VERIFICATION & SUBSCRIPTION ACTIVATION
// ==========================================

export const verifyCheckout = async (req, res) => {
    try {
        const {
            razorpay_order_id,
            razorpayOrderId,
            razorpay_payment_id,
            razorpayPaymentId,
            razorpay_signature,
            razorpaySignature,
            packageId,
            productId
        } = req.body;

        const targetId = packageId || productId;
        const orderId = razorpay_order_id || razorpayOrderId;
        const paymentId = razorpay_payment_id || razorpayPaymentId;
        const signature = razorpay_signature || razorpaySignature;

        if (!orderId || !paymentId || !signature || !targetId) {
            return res.status(400).json({
                success: false,
                message: "Missing required payment verification parameters."
            });
        }

        const subscription = await MonetizationService.verifyAndActivateSubscription(req.user.id, {
            razorpayOrderId: orderId,
            razorpayPaymentId: paymentId,
            razorpaySignature: signature,
            productId: targetId
        });

        res.status(200).json({
            success: true,
            message: "Payment verified and subscription activated.",
            data: subscription
        });
    } catch (error) {
        console.error("[Verification Error]:", error);

        if (error.message === "INVALID_PAYMENT_SIGNATURE") {
            return res.status(400).json({
                success: false,
                message: "Payment tampering detected. Cryptographic signature mismatch."
            });
        }
        if (error.message === "TRANSACTION_NOT_FOUND") {
            return res.status(404).json({ success: false, message: "Transaction record not found." });
        }
        if (error.message === "PRODUCT_NOT_FOUND") {
            return res.status(404).json({ success: false, message: "Associated product package not found." });
        }

        res.status(400).json({ success: false, message: error.message || "Payment verification failed." });
    }
};

// ==========================================
// 4. WEBHOOK HANDLER
// ==========================================

export const handleRazorpayWebhook = async (req, res) => {
    try {
        const signature = req.headers["x-razorpay-signature"];
        const rawBody = req.rawBody || JSON.stringify(req.body);

        await MonetizationService.handleWebhook(signature, rawBody);
        res.status(200).json({ status: "ok" });
    } catch (error) {
        console.error("[Webhook Error]:", error);
        res.status(400).json({ status: "failed", message: error.message });
    }
};