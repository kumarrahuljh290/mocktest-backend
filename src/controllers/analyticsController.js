import { AnalyticsService } from "../services/analyticsService.js";

// Triggered by Admin or Scheduled Worker
export const generateLeaderboard = async (req, res) => {
    try {
        const result = await AnalyticsService.generateLeaderboard(req.params.testId);
        return res.status(200).json({ success: true, ...result });
    } catch (error) {
        console.error("[Generate Leaderboard Error]:", error);
        return res.status(500).json({ success: false, message: "Failed to generate leaderboard." });
    }
};

// Public/Student View: Top Rankers
export const getLeaderboard = async (req, res) => {
    try {
        const filters = {
            page: Number(req.query.page) || 1,
            limit: Number(req.query.limit) || 20,
            currentUserId: req.user?.id || null,
        };

        const result = await AnalyticsService.getLeaderboard(req.params.testId, filters);
        return res.status(200).json({ success: true, ...result });
    } catch (error) {
        console.error("[Get Leaderboard Error]:", error);
        return res.status(500).json({ success: false, message: "Failed to fetch leaderboard." });
    }
};

// Student View: Personal Detailed Scorecard
export const getScorecard = async (req, res) => {
    try {
        const scorecard = await AnalyticsService.getAttemptScorecard(req.user.id, req.params.attemptId);
        return res.status(200).json({ success: true, data: scorecard });
    } catch (error) {
        if (error.message === "ATTEMPT_NOT_FOUND") {
            return res.status(404).json({ success: false, message: "Attempt not found." });
        }
        if (error.message === "UNAUTHORIZED") {
            return res.status(403).json({ success: false, message: "Unauthorized access to this attempt." });
        }
        console.error("[Scorecard Error]:", error);
        return res.status(500).json({ success: false, message: "Failed to generate scorecard." });
    }
};

// Student View: Full Solutions & Responses
export const getQuestionReview = async (req, res) => {
    try {
        const review = await AnalyticsService.getAttemptQuestionReview(req.user.id, req.params.attemptId);
        return res.status(200).json({ success: true, data: review });
    } catch (error) {
        if (error.message === "UNAUTHORIZED") {
            return res.status(403).json({ success: false, message: "Unauthorized access." });
        }
        console.error("[Question Review Error]:", error);
        return res.status(500).json({ success: false, message: "Failed to load question review." });
    }
};