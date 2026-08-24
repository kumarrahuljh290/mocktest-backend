import crypto from "crypto";
import prisma from "../config/prisma.js";
import { razorpay } from "../config/razorpay.js";
import slugify from "slugify";

export class MonetizationService {

    // ==========================================
    // 1. ADMIN: CREATE & MANAGE PRODUCTS
    // ==========================================
    
    static async createProduct(data) {
        const slug = slugify(data.name, { lower: true, strict: true }) + "-" + crypto.randomBytes(3).toString("hex");
        
        return await prisma.product.create({
            data: {
                name: data.name,
                slug: slug,
                description: data.description,
                price: data.price,
                discountPrice: data.discountPrice,
                validityDays: data.validityDays,
                features: data.features || [],
                
                // The Magic: Polymorphic Entitlements.
                // You pass an array of { collectionId: "..." } OR { testId: "..." }
                entitlements: {
                    create: data.entitlements?.map(ent => ({
                        collectionId: ent.collectionId || null,
                        testId: ent.testId || null
                    })) || []
                }
            },
            include: {
                entitlements: true // Return what this product unlocks
            }
        });
    }

    static async updateProduct(productId, data) {
        return await prisma.$transaction(async (tx) => {
            // If new entitlements are provided, wipe the old ones and set new ones
            if (data.entitlements) {
                await tx.productEntitlement.deleteMany({ where: { productId } });
                await tx.productEntitlement.createMany({
                    data: data.entitlements.map(ent => ({
                        productId,
                        collectionId: ent.collectionId || null,
                        testId: ent.testId || null
                    }))
                });
            }

            return await tx.product.update({
                where: { id: productId },
                data: {
                    name: data.name,
                    description: data.description,
                    price: data.price,
                    discountPrice: data.discountPrice,
                    validityDays: data.validityDays,
                    isActive: data.isActive,
                    features: data.features
                },
                include: { entitlements: true }
            });
        });
    }

    static async getAllProducts(filters = {}) {
        const where = {
            isActive: filters.includeInactive ? undefined : true,
        };

        return await prisma.product.findMany({
            where,
            include: {
                entitlements: {
                    include: {
                        collection: { select: { id: true, name: true, type: true } },
                        test: { select: { id: true, title: true, type: true } }
                    }
                }
            }
        });
    }
    
    // ==========================================
    // 2. STUDENT: INITIATE RAZORPAY ORDER
    // ==========================================
    
    static async initiatePurchase(userId, productId) {
        const product = await prisma.product.findUnique({ where: { id: productId } });
        if (!product || !product.isActive) throw new Error("PRODUCT_UNAVAILABLE");

        // Calculate price in smallest currency unit (Paise for INR)
        const finalPrice = product.discountPrice ? Number(product.discountPrice) : Number(product.price);
        if (finalPrice <= 0) throw new Error("INVALID_PRICE");
        
        const amountInPaise = Math.round(finalPrice * 100);

        // Create Order on Razorpay
        const razorpayOrder = await razorpay.orders.create({
            amount: amountInPaise,
            currency: "INR",
            receipt: `rcpt_${crypto.randomBytes(6).toString("hex")}`,
            notes: {
                userId,
                productId,
                productName: product.name
            }
        });

        // Record PENDING transaction in the database
        const transaction = await prisma.transaction.create({
            data: {
                userId,
                amount: finalPrice,
                currency: "INR",
                status: "PENDING",
                gatewayReferenceId: razorpayOrder.id // Stores the rzp_order_id
            }
        });

        return {
            orderId: razorpayOrder.id,
            amount: razorpayOrder.amount, // Passes paise to frontend
            currency: razorpayOrder.currency,
            keyId: process.env.RAZORPAY_KEY_ID,
            productName: product.name,
            transactionId: transaction.id
        };
    }

    // ==========================================
    // 3. VERIFY PAYMENT & ACTIVATE SUBSCRIPTION
    // ==========================================
    
    static async verifyAndActivateSubscription(userId, payload) {
        const { razorpayOrderId, razorpayPaymentId, razorpaySignature, productId } = payload;

        // Step A: Cryptographic HMAC SHA256 Signature Verification
        const generatedSignature = crypto
            .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
            .update(`${razorpayOrderId}|${razorpayPaymentId}`)
            .digest("hex");

        if (generatedSignature !== razorpaySignature) {
            throw new Error("INVALID_PAYMENT_SIGNATURE");
        }

        // Step B: Atomically activate subscription and update transaction
        return await prisma.$transaction(async (tx) => {
            const transaction = await tx.transaction.findUnique({
                where: { gatewayReferenceId: razorpayOrderId }
            });

            if (!transaction || transaction.userId !== userId) {
                throw new Error("TRANSACTION_NOT_FOUND");
            }
            if (transaction.status === "SUCCESS") {
                return tx.subscription.findFirst({ where: { id: transaction.subscriptionId } });
            }

            const product = await tx.product.findUnique({ where: { id: productId } });
            if (!product) throw new Error("PRODUCT_NOT_FOUND");

            // Calculate exact expiry date
            const endDate = new Date();
            endDate.setDate(endDate.getDate() + product.validityDays);

            // 1. Create Active Subscription
            const subscription = await tx.subscription.create({
                data: {
                    userId,
                    productId: product.id,
                    status: "ACTIVE",
                    endDate
                }
            });

            // 2. Update Transaction to SUCCESS
            await tx.transaction.update({
                where: { id: transaction.id },
                data: {
                    status: "SUCCESS",
                    subscriptionId: subscription.id,
                    // Note: If you add gatewayPaymentId to your Transaction schema in the future, save razorpayPaymentId there.
                }
            });

            return subscription;
        });
    }

    // ==========================================
    // 4. ADMIN: REFUND MECHANISM
    // ==========================================
    
    static async processRefund(adminId, transactionId, reason) {
        return await prisma.$transaction(async (tx) => {
            // 1. Fetch transaction and verify eligibility
            const transaction = await tx.transaction.findUnique({ 
                where: { id: transactionId },
                include: { subscription: true } 
            });

            if (!transaction) throw new Error("TRANSACTION_NOT_FOUND");
            if (transaction.status === "REFUNDED") throw new Error("ALREADY_REFUNDED");
            if (transaction.status !== "SUCCESS") throw new Error("CAN_ONLY_REFUND_SUCCESSFUL_TRANSACTIONS");

            // 2. Fetch the Razorpay Payment ID associated with this Order ID
            const orderId = transaction.gatewayReferenceId;
            const payments = await razorpay.orders.fetchPayments(orderId);
            
            const successfulPayment = payments.items.find(p => p.status === 'captured');
            if (!successfulPayment) {
                throw new Error("NO_CAPTURED_PAYMENT_FOUND_ON_GATEWAY");
            }

            // 3. Initiate Refund on Razorpay
            const refund = await razorpay.payments.refund(successfulPayment.id, {
                amount: Math.round(Number(transaction.amount) * 100), // Full refund in paise
                notes: { reason, refundedBy: adminId }
            });

            // 4. Update Database: Mark Transaction as Refunded and Cancel Subscription
            await tx.transaction.update({
                where: { id: transaction.id },
                data: { status: "REFUNDED" }
            });

            if (transaction.subscriptionId) {
                await tx.subscription.update({
                    where: { id: transaction.subscriptionId },
                    data: { status: "CANCELED" } // Instantly revokes access
                });
            }

            return { success: true, refundId: refund.id, message: "Refund processed and access revoked." };
        });
    }

    // ==========================================
    // 5. RAZORPAY WEBHOOK HANDLER (Safety Net)
    // ==========================================
    
    static async handleWebhook(signature, rawBody) {
        const expectedSignature = crypto
            .createHmac("sha256", process.env.RAZORPAY_WEBHOOK_SECRET)
            .update(rawBody)
            .digest("hex");

        if (signature !== expectedSignature) {
            throw new Error("INVALID_WEBHOOK_SIGNATURE");
        }

        const event = JSON.parse(rawBody.toString());

        // Safety fallback if user closed browser during payment success
        if (event.event === "payment.captured") {
            const paymentEntity = event.payload.payment.entity;
            const orderId = paymentEntity.order_id;
            const notes = paymentEntity.notes;

            if (!notes?.productId || !notes?.userId) return { received: true };

            const existingTx = await prisma.transaction.findUnique({
                where: { gatewayReferenceId: orderId }
            });

            // Only process if it got stuck in PENDING
            if (existingTx && existingTx.status === "PENDING") {
                const product = await prisma.product.findUnique({ where: { id: notes.productId } });
                
                const endDate = new Date();
                endDate.setDate(endDate.getDate() + (product?.validityDays || 30));

                await prisma.$transaction([
                    prisma.subscription.create({
                        data: {
                            userId: notes.userId,
                            productId: notes.productId,
                            status: "ACTIVE",
                            endDate
                        }
                    }),
                    prisma.transaction.update({
                        where: { id: existingTx.id },
                        data: { status: "SUCCESS" }
                    })
                ]);
            }
        }
        
        return { received: true };
    }
}