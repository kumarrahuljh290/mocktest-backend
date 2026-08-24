import { Router } from "express";
import { 
    createQuestionContext,
    createQuestion, 
    bulkUploadQuestions, 
    getQuestions 
} from "../controllers/questionController.js";
import { authMiddleware, roleMiddleware } from "../middlewares/authMiddleware.js";

const questionRoute = Router();

// Define allowed roles for modifying the global question bank
const contentCreators = [authMiddleware, roleMiddleware(["ADMIN", "CONTENT_CREATOR", "SUPERADMIN"])];

// ==========================================
// CONTEXT (RC Passages & DI Tables)
// ==========================================
// Create a shared context (Admin gets a contextId back to attach to questions)
questionRoute.post("/context", contentCreators, createQuestionContext);

// ==========================================
// QUESTIONS
// ==========================================
// Create single question
questionRoute.post("/", contentCreators, createQuestion);

// Bulk upload questions
questionRoute.post("/bulk", contentCreators, bulkUploadQuestions);

// Fetch questions (to view in admin panel before assigning to tests)
questionRoute.get("/", contentCreators, getQuestions);

export default questionRoute;