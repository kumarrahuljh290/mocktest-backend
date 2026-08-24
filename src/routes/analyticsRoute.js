import { Router } from "express";
import {
    generateLeaderboard,
    getLeaderboard,
    getScorecard,
    getQuestionReview,
} from "../controllers/analyticsController.js";
import { authMiddleware, roleMiddleware } from "../middlewares/authMiddleware.js";

const analyticsRoute = Router();

// ==========================================
// ADMIN ROUTES
// ==========================================
analyticsRoute.post(
    "/test/:testId/leaderboard/recalculate",
    authMiddleware,
    roleMiddleware(["ADMIN"]),
    generateLeaderboard
);

// ==========================================
// STUDENT & PUBLIC ROUTES
// ==========================================
// View test leaderboard (Shows top rankers and current student's standing)
analyticsRoute.get("/test/:testId/leaderboard", authMiddleware, getLeaderboard);

// View personal scorecard (Score, Rank, Percentile, Section Cutoffs)
analyticsRoute.get("/attempt/:attemptId/scorecard", authMiddleware, getScorecard);

// View detailed question solutions and explanation walkthrough
analyticsRoute.get("/attempt/:attemptId/review", authMiddleware, getQuestionReview);

export default analyticsRoute;