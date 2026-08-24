import crypto from "crypto";
import prisma from "../config/prisma.js";
import { razorpay } from "../config/razorpay.js";

export const createSubscription = async (userId, planId) => {
    const plan = await prisma.subscriptionPlan.findFirst({
        where:
        {
            id: planId,
            isActive: true
        }
    });

    if (!plan)
        throw new Error("Plan not found");
    const existing = await prisma.subscription.findFirst({
        where:
        {
            userId,
            status: "ACTIVE"
        }
    });

    if (existing)
        throw new Error("Active subscription already exists");

    const razorSub = await razorpay.subscriptions.create({
        plan_id: plan.gatewayPlanId,
        customer_notify: 1,
        total_count:
            plan.billingPeriod === "MONTHLY" ? 12 :
                plan.billingPeriod === "YEARLY" ? 5 : 1
    });

    const subscription = await prisma.subscription.create({
        data:
        {
            userId,
            planId,
            gatewaySubId: razorSub.id,
            status: "INACTIVE",
            currentPeriodStart: new Date(),
            currentPeriodEnd: new Date()
        }
    });

    return {
        subscriptionId: subscription.id,
        gatewaySubId: razorSub.id
    };
}



export const cancelSubscription = async (userId) => {
    const sub = await prisma.subscription.findFirst({

        where:
        {
            userId,
            status: "ACTIVE"
        }
    });

    if (!sub)
        throw new Error("No active subscription");


    await razorpay.subscriptions.cancel(
        sub.gatewaySubId,
        true
    );


    await prisma.subscription.update({
        where: { id: sub.id },
        data:
        {
            cancelAtPeriodEnd: true
        }
    });
    return true;
}

export const getUserSubscription = async (userId) => {
    return prisma.subscription.findFirst({
        where:
        {
            userId
        },
        include:
        {
            plan: true
        },
        orderBy:
        {
            createdAt: "desc"
        }
    });
}

