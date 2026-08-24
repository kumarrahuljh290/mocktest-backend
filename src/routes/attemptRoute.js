import { Router } from "express";
import { startTest, syncAnswer, submitTest } from "../controllers/attemptController.js";
import { authMiddleware } from "../middlewares/authMiddleware.js";

const attemptRoute = Router();

// Every endpoint here requires a logged-in user (Student)
attemptRoute.use(authMiddleware);

// ==========================================
// 1. START ATTEMPT
// ==========================================
// Called when a student clicks "Start Test". Creates the attempt and starts the timer.
// Note: Expects the TEST ID, not the attempt ID.
attemptRoute.post("/start/:testId", startTest);

// ==========================================
// 2. REAL-TIME SYNC
// ==========================================
// Called repeatedly by the frontend (e.g., every time a user clicks "Save & Next" or "Mark for Review")
// Using PUT since this performs an idempotent upsert in the database
attemptRoute.put("/:attemptId/sync", syncAnswer);

// ==========================================
// 3. FINAL SUBMIT
// ==========================================
// Called when the user clicks "Final Submit" or the live timer runs out
attemptRoute.post("/:attemptId/submit", submitTest);

export default attemptRoute;