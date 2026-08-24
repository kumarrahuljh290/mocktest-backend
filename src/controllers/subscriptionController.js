import { SubscriptionService } from "../services/subscriptionService";


export const create = async (req, res) => {
    const userId = req.user.id;
    const { planId } = req.body;
    const data =
        await SubscriptionService.createSubscription(
            userId,
            planId
        );
    return res.json({

        success: true,
        data
    });
}

export const cancel = async (req, res) => {
    const userId = req.user.id;
    await SubscriptionService.cancelSubscription(
        userId
    );
    return res.json({
        success: true
    });
}

export const mySubscription = async (
    req,
    res
) => {
    const userId = req.user.id;
    const sub =
        await SubscriptionService.getUserSubscription(
            userId
        );

    return res.json(sub);
}
