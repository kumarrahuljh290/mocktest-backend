import { QuestionService } from "../services/questionService.js";

// ==========================================
// 1. QUESTION CONTEXT (RC Passages & DI Tables)
// ==========================================
export const createQuestionContext = async (req, res) => {
    try {
        // payload expects: { title, content: { EN: "...", HI: "..." }, mediaUrls: ["url1"] }
        const context = await QuestionService.createQuestionContext(req.body);
        res.status(201).json({ success: true, data: context });
    } catch (error) {
        console.error("[Context Creation Error]:", error);
        res.status(500).json({ 
            success: false, 
            message: "Failed to create question context",
            error: error.message
        });
    }
};

// ==========================================
// 2. SINGLE QUESTION
// ==========================================
export const createQuestion = async (req, res) => {
    try {
        const question = await QuestionService.createQuestion(req.body);
        res.status(201).json({ success: true, data: question });
    } catch (error) {
        console.error("[Question Creation Error]:", error);
        res.status(500).json({ 
            success: false, 
            message: "Failed to create question",
            error: error.message
        });
    }
};

// ==========================================
// 3. BULK UPLOAD
// ==========================================
export const bulkUploadQuestions = async (req, res) => {
    try {
        const { questions } = req.body;
        
        if (!Array.isArray(questions) || questions.length === 0) {
            return res.status(400).json({ 
                success: false, 
                message: "Invalid payload. Expected an array of questions." 
            });
        }

        const result = await QuestionService.bulkCreateQuestions(questions);
        res.status(201).json({ success: true, ...result });
    } catch (error) {
        console.error("[Bulk Upload Error]:", error);
        res.status(500).json({ 
            success: false, 
            message: "Failed to process bulk upload. Entire batch rolled back.",
            error: error.message
        });
    }
};

// ==========================================
// 4. FETCHING & FILTERING
// ==========================================
export const getQuestions = async (req, res) => {
    try {
        const filters = {
            page: Number(req.query.page) || 1,
            limit: Number(req.query.limit) || 20,
            subject: req.query.subject,
            topic: req.query.topic,
            difficulty: req.query.difficulty,
            type: req.query.type, 
            creatorId: req.query.creatorId // NEW: Allows Admins to filter by specific creator or 'null' for official content
        };

        // NEW: Pass req.user as the second argument to enforce strict Data Isolation
        const result = await QuestionService.getQuestions(filters, req.user);
        
        res.status(200).json({ success: true, ...result });
    } catch (error) {
        console.error("[Fetch Questions Error]:", error);
        res.status(500).json({ 
            success: false, 
            message: "Failed to fetch questions",
            error: error.message
        });
    }
};