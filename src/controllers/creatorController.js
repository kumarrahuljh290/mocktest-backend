import { CreatorService } from "../services/CreatorService.js";
import prisma from "../config/prisma.js";

// ==========================================
// 1. CREATOR LIFECYCLE (STUDENT / CREATOR)
// ==========================================

/**
 * Apply to become a Creator / Sign copyright agreement
 * POST /api/v1/creators/apply
 */
export const applyForCreator = async (req, res) => {
    try {
        const userId = req.user.id;
        const { brandName, bio, acceptedCopyrightPolicy } = req.body;

        if (!brandName || !brandName.trim()) {
            return res.status(400).json({ 
                success: false, 
                message: "Brand/Academy name is required." 
            });
        }

        const profile = await CreatorService.applyToBeCreator(userId, {
            brandName: brandName.trim(),
            bio: bio?.trim(),
            acceptedCopyrightPolicy: Boolean(acceptedCopyrightPolicy)
        });

        res.status(201).json({
            success: true,
            message: "Creator application submitted successfully. Pending administrator review.",
            data: profile
        });
    } catch (error) {
        console.error("[Apply Creator Error]:", error);
        if (error.message.includes("LEGAL_AGREEMENT_REQUIRED")) {
            return res.status(400).json({ success: false, message: error.message });
        }
        res.status(500).json({ success: false, message: "Failed to submit creator application." });
    }
};

/**
 * Public Storefront Endpoint (SEO & Shareable Link)
 * GET /api/v1/creators/storefront/:slug
 */
export const getCreatorStorefront = async (req, res) => {
    try {
        const { slug } = req.params;
        const storefrontData = await CreatorService.getPublicStorefront(slug);

        res.status(200).json({
            success: true,
            data: storefrontData
        });
    } catch (error) {
        console.error("[Get Storefront Error]:", error);
        if (error.message === "CREATOR_NOT_FOUND_OR_INACTIVE") {
            return res.status(404).json({ 
                success: false, 
                message: "Creator storefront not found or currently inactive." 
            });
        }
        res.status(500).json({ success: false, message: "Failed to load creator storefront." });
    }
};

/**
 * Creator Private Analytics & Financial Metrics
 * GET /api/v1/creators/dashboard/stats
 */
export const getDashboardStats = async (req, res) => {
    try {
        const creatorId = req.user.id;
        const stats = await CreatorService.getCreatorDashboardStats(creatorId);

        res.status(200).json({
            success: true,
            data: stats
        });
    } catch (error) {
        console.error("[Creator Dashboard Error]:", error);
        res.status(500).json({ success: false, message: "Failed to fetch creator dashboard statistics." });
    }
};

// ==========================================
// 2. SUPERADMIN APPROVAL & COMPLIANCE
// ==========================================

/**
 * List pending creator applications
 * GET /api/v1/creators/admin/pending
 */
export const getPendingApplications = async (req, res) => {
    try {
        const pendingCreators = await prisma.creatorProfile.findMany({
            where: { status: "PENDING" },
            include: {
                user: {
                    select: { id: true, name: true, email: true, phone: true, createdAt: true }
                }
            },
            orderBy: { createdAt: "asc" }
        });

        res.status(200).json({
            success: true,
            data: pendingCreators
        });
    } catch (error) {
        console.error("[Get Pending Creators Error]:", error);
        res.status(500).json({ success: false, message: "Failed to fetch pending applications." });
    }
};

/**
 * Approve, Reject, or Suspend a Creator Profile
 * PATCH /api/v1/creators/admin/:creatorProfileId/status
 */
export const updateCreatorStatus = async (req, res) => {
    try {
        const { creatorProfileId } = req.params;
        const { status, commissionRate } = req.body;

        const validStatuses = ["PENDING", "ACTIVE", "SUSPENDED", "REJECTED"];
        if (!validStatuses.includes(status)) {
            return res.status(400).json({ 
                success: false, 
                message: `Invalid status. Must be one of: ${validStatuses.join(", ")}` 
            });
        }

        const updatePayload = { status };
        if (commissionRate !== undefined) {
            updatePayload.commissionRate = Number(commissionRate);
        }

        const updated = await prisma.creatorProfile.update({
            where: { id: creatorProfileId },
            data: updatePayload
        });

        res.status(200).json({
            success: true,
            message: `Creator status updated to ${status}.`,
            data: updated
        });
    } catch (error) {
        console.error("[Update Creator Status Error]:", error);
        res.status(500).json({ success: false, message: "Failed to update creator status." });
    }
};