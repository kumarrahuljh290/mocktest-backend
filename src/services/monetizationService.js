import crypto from "crypto";
import prisma from "../config/prisma.js";
import { razorpay } from "../config/razorpay.js";
import slugify from "slugify";

export class MonetizationService {

  // ==========================================
    // 1. CREATE & MANAGE PRODUCTS (Multi-Tenant)
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
                creatorId: data.creatorId || null, // NEW: Links product to creator (null for PrepMaster Official)
                
                entitlements: {
                    create: data.entitlements?.map(ent => ({
                        collectionId: ent.collectionId || null,
                        testId: ent.testId || null
                    })) || []
                }
            },
            include: { entitlements: true }
        });
    }

    static async updateProduct(productId, data) {
        // ... (Your existing updateProduct logic remains exactly the same, just add creatorId if needed)
    }

    static async getAllProducts(filters = {}) {
        const where = {
            isActive: filters.includeInactive ? undefined : true,
            creatorId: filters.creatorId || undefined // NEW: Filter by specific creator for their storefront
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
    // 2. THE CHECKOUT ENGINE (Coupons & Razorpay Route)
    // ==========================================
    
    static async initiatePurchase(userId, productId, couponCode = null) {
        // 1. Fetch Product & Creator's Profile
        const product = await prisma.product.findUnique({ 
            where: { id: productId },
            include: {
                creator: { include: { creatorProfile: true } }
            }
        });

        if (!product || !product.isActive) throw new Error("PRODUCT_UNAVAILABLE");

        let baseAmount = product.discountPrice ? Number(product.discountPrice) : Number(product.price);
        let discountApplied = 0;
        let finalAmount = baseAmount;
        let validCoupon = null;

        // 2. Coupon Engine Validation (Same as before)
        if (couponCode) {
            validCoupon = await prisma.coupon.findUnique({ where: { code: couponCode } });

            if (!validCoupon || !validCoupon.isActive) throw new Error("INVALID_COUPON");
            if (validCoupon.expiresAt && validCoupon.expiresAt < new Date()) throw new Error("COUPON_EXPIRED");
            if (validCoupon.maxUses && validCoupon.usedCount >= validCoupon.maxUses) throw new Error("COUPON_LIMIT_REACHED");
            if (validCoupon.creatorId && validCoupon.creatorId !== product.creatorId) throw new Error("COUPON_NOT_APPLICABLE_TO_THIS_CREATOR");
            if (validCoupon.productId && validCoupon.productId !== product.id) throw new Error("COUPON_NOT_APPLICABLE_TO_THIS_PRODUCT");

            if (validCoupon.discountType === "PERCENTAGE") {
                discountApplied = baseAmount * (Number(validCoupon.discountValue) / 100);
            } else {
                discountApplied = Number(validCoupon.discountValue);
            }
            finalAmount = Math.max(0, baseAmount - discountApplied);
        }

        // 3. The Ledger Math
        let platformShare = finalAmount;
        let creatorShare = 0;
        let linkedAccountId = null;

        // ONLY calculate splits if this is a Creator's product (Not PrepMaster's)
        if (product.creatorId) {
            const commissionRate = Number(product.creator.creatorProfile?.commissionRate || 20);
            platformShare = finalAmount * (commissionRate / 100);
            creatorShare = finalAmount - platformShare;
            linkedAccountId = product.creator.creatorProfile?.razorpayAccountId;
        }

        // 4. Zero Rupee Bypass (100% Free)
        if (finalAmount === 0) {
            return await this.processFreeOrder(userId, product, validCoupon, baseAmount, discountApplied, platformShare, creatorShare);
        }

        // 5. Razorpay Order Generation with ROUTE (Split Payments)
        const amountInPaise = Math.round(finalAmount * 100);
        
        const orderPayload = {
            amount: amountInPaise,
            currency: "INR",
            receipt: `rcpt_${crypto.randomBytes(6).toString("hex")}`,
            notes: { userId, productId }
        };

        // THE MAGIC: If a creator exists AND they have a linked bank account, split the money!
        // If it's a PrepMaster course, this block is completely skipped, and you get 100%.
        if (creatorShare > 0 && linkedAccountId) {
            const creatorSharePaise = Math.round(creatorShare * 100);
            
            // Enterprise Safeguard: Hold the creator's money for 7 Days to handle refunds/disputes
            const sevenDaysFromNow = Math.floor(Date.now() / 1000) + (7 * 24 * 60 * 60);

            orderPayload.transfers = [
                {
                    account: linkedAccountId,      // The teacher's Razorpay Account ID
                    amount: creatorSharePaise,     // Their exact 80% cut
                    currency: "INR",
                    on_hold: true,                 // Do not settle immediately!
                    on_hold_until: sevenDaysFromNow, 
                    notes: {
                        splitType: "Creator Share",
                        productId: productId
                    }
                }
            ];
        }

        // Generate the order (Razorpay automatically handles the split based on the payload above)
        const razorpayOrder = await razorpay.orders.create(orderPayload);

        // 6. Log the transaction as PENDING
        const transaction = await prisma.transaction.create({
            data: {
                userId,
                creatorId: product.creatorId,
                amount: finalAmount, 
                baseAmount,
                discountApplied,
                finalAmount,
                platformShare,
                creatorShare,
                couponId: validCoupon?.id || null,
                currency: "INR",
                status: "PENDING",
                gatewayReferenceId: razorpayOrder.id 
            }
        });

        return {
            isFree: false, 
            orderId: razorpayOrder.id,
            amount: razorpayOrder.amount, 
            currency: razorpayOrder.currency,
            keyId: process.env.RAZORPAY_KEY_ID,
            productName: product.name,
            transactionId: transaction.id
        };
    }

    // Helper: Instantly activates 100% discounted orders
    static async processFreeOrder(userId, product, coupon, baseAmount, discountApplied, platformShare, creatorShare) {
        return await prisma.$transaction(async (tx) => {
            const endDate = new Date();
            endDate.setDate(endDate.getDate() + product.validityDays);

            const subscription = await tx.subscription.create({
                data: {
                    userId,
                    productId: product.id,
                    status: "ACTIVE",
                    endDate
                }
            });

            await tx.transaction.create({
                data: {
                    userId,
                    creatorId: product.creatorId,
                    amount: 0,
                    baseAmount,
                    discountApplied,
                    finalAmount: 0,
                    platformShare,
                    creatorShare,
                    couponId: coupon?.id,
                    status: "SUCCESS", // Instantly successful!
                    gatewayReferenceId: `free_${crypto.randomBytes(8).toString("hex")}`,
                    subscriptionId: subscription.id
                }
            });

            if (coupon) {
                await tx.coupon.update({
                    where: { id: coupon.id },
                    data: { usedCount: { increment: 1 } }
                });
            }

            return { isFree: true, success: true, message: "Subscription activated instantly." };
        });
    }

    // ==========================================
    // 3. VERIFY PAYMENT & ACTIVATE SUBSCRIPTION
    // ==========================================
    
    static async verifyAndActivateSubscription(userId, payload) {
        const { razorpayOrderId, razorpayPaymentId, razorpaySignature, productId } = payload;

        // Step A: Cryptographic Verification
        const generatedSignature = crypto
            .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
            .update(`${razorpayOrderId}|${razorpayPaymentId}`)
            .digest("hex");

        if (generatedSignature !== razorpaySignature) {
            throw new Error("INVALID_PAYMENT_SIGNATURE");
        }

        // Step B: Atomically activate subscription and update ledger
        return await prisma.$transaction(async (tx) => {
            const transaction = await tx.transaction.findUnique({
                where: { gatewayReferenceId: razorpayOrderId }
            });

            if (!transaction || transaction.userId !== userId) throw new Error("TRANSACTION_NOT_FOUND");
            if (transaction.status === "SUCCESS") {
                return tx.subscription.findFirst({ where: { id: transaction.subscriptionId } });
            }

            const product = await tx.product.findUnique({ where: { id: productId } });
            const endDate = new Date();
            endDate.setDate(endDate.getDate() + product.validityDays);

            // 1. Create Active Subscription
            const subscription = await tx.subscription.create({
                data: { userId, productId: product.id, status: "ACTIVE", endDate }
            });

            // 2. Update Transaction to SUCCESS
            await tx.transaction.update({
                where: { id: transaction.id },
                data: {
                    status: "SUCCESS",
                    subscriptionId: subscription.id
                }
            });

            // 3. Increment Coupon Use Count (if one was applied)
            if (transaction.couponId) {
                await tx.coupon.update({
                    where: { id: transaction.couponId },
                    data: { usedCount: { increment: 1 } }
                });
            }

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