import prisma from "../config/prisma.js";
import crypto from "crypto";

export class RazorpayService {

    static verifySignature(
        body,
        signature
    ) {

        const expected = crypto
            .createHmac(
                "sha256",
                process.env.RAZORPAY_WEBHOOK_SECRET
            )
            .update(body)
            .digest("hex");

        return expected === signature;

    }




    static async handleSubscriptionActivated(data) {

        await prisma.subscription.update({

            where:
            {
                gatewaySubId: data.id
            },

            data:
            {
                status: "ACTIVE",

                currentPeriodStart:
                    new Date(data.current_start * 1000),

                currentPeriodEnd:
                    new Date(data.current_end * 1000)
            }
        });

    }



    static async handleSubscriptionCharged(data) {

        await prisma.transaction.create({

            data:
            {

                userId:
                    data.notes.userId,

                amount:
                    data.amount / 100,

                currency: data.currency,

                status: "SUCCESS",

                gatewayReferenceId: data.payment_id
            }
        });

    }




    static async handleSubscriptionCancelled(data) {

        await prisma.subscription.update({

            where:
            {
                gatewaySubId: data.id
            },

            data:
            {
                status: "CANCELED"
            }
        });

    }

}