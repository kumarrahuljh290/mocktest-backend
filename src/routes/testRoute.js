import { Router } from "express";
import { 
    createCollection, updateCollection, deleteCollection,
    createTest, updateTest, deleteTest, getAllTests, getTestById,
    startTest, syncAnswer, submitTest 
} from "../controllers/testController.js";
import { authMiddleware, roleMiddleware } from "../middlewares/authMiddleware.js";

const testRoute = Router();

// Admins and Content Creators only
const adminOnly = [authMiddleware, roleMiddleware(["ADMIN", "CONTENT_CREATOR", "SUPERADMIN"])];

// ==========================================
// COLLECTIONS (Replaces TestSeries)
// ==========================================
testRoute.post("/collections", adminOnly, createCollection);
testRoute.patch("/collections/:collectionId", adminOnly, updateCollection);
testRoute.delete("/collections/:collectionId", adminOnly, deleteCollection);

// ==========================================
// TEST MANAGEMENT ROUTES (Admins)
// ==========================================
testRoute.post("/", adminOnly, createTest); // Body contains collectionIds: []
testRoute.get("/", adminOnly, getAllTests); 
testRoute.patch("/:testId", adminOnly, updateTest);
testRoute.delete("/:testId", adminOnly, deleteTest);

// ==========================================
// EXAM ENGINE ROUTES (Students)
// ==========================================
// 1. Fetch test data (Secured by recursive subscription check in controller)
testRoute.get("/:testId", authMiddleware, getTestById);

// 2. Start the test (Creates an Attempt, checks LIVE window)
testRoute.post("/:testId/start", authMiddleware, startTest);

// 3. Sync Answer (Fired when user clicks "Save & Next" or "Mark for Review")
testRoute.post("/attempt/:attemptId/sync", authMiddleware, syncAnswer);

// 4. Final Submit (Evaluates the test based on iON logic)
testRoute.post("/attempt/:attemptId/submit", authMiddleware, submitTest);

export default testRoute;