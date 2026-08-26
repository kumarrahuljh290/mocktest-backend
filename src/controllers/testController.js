import { TestService } from "../services/testService.js";

// ==========================================
// 1. COLLECTIONS (Replaces old TestSeries)
// ==========================================

export const createCollection = async (req, res) => {
    try {
        // Expected body: { name, type (e.g., "TEST_SERIES", "EXAM"), parentId (optional) }
        const collection = await TestService.createCollection(req.body);
        res.status(201).json({ success: true, data: collection });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

export const updateCollection = async (req, res) => {
    try {
        const collection = await TestService.updateCollection(req.params.collectionId, req.body);
        res.status(200).json({ success: true, data: collection });
    } catch (error) {
        res.status(500).json({ success: false, message: "Failed to update collection." });
    }
};

export const deleteCollection = async (req, res) => {
    try {
        await TestService.deleteCollection(req.params.collectionId);
        res.status(200).json({ success: true, message: "Collection deleted successfully." });
    } catch (error) {
        res.status(500).json({ success: false, message: "Failed to delete collection." });
    }
};

export const getAllCollections = async (req, res) => {
    try {
        // Extract optional filters from query string
        const { parentId, type, isPublished } = req.query;

        const collections = await TestService.getAllCollections({
            parentId,
            type,
            isPublished
        });

        res.status(200).json({
            success: true,
            count: collections.length,
            data: collections
        });
    } catch (error) {
        console.error("Get All Collections Error:", error);
        res.status(500).json({ 
            success: false, 
            message: "Failed to fetch collections", 
            error: error.message 
        });
    }
};

export const getCollectionDetails = async (req, res) => {
    try {
        const collection = await TestService.getCollectionDetails(req.params.collectionId);
        res.status(200).json({ success: true, data: collection });
    } catch (error) {
        res.status(500).json({ success: false, message: "Failed to fetch collection details." });
    }
};

export const getCollectionById = async (req, res) => {
    try {
        // Change req.params.collectionId to req.params.id
        const collectionId = req.params.collectionId; // Or whatever you named it in the route
        
        if (!collectionId) {
             return res.status(400).json({ success: false, message: "Collection ID is required." });
        }

        const collection = await TestService.getCollectionDetails(collectionId);
        
        res.status(200).json({ success: true, data: collection });

    } catch (error) {
        if (error.message === "Collection not found") {
            return res.status(404).json({ success: false, message: "Collection not found." });
        }
        console.error("Get Collection Error:", error);
        res.status(500).json({ success: false, message: "Failed to fetch collection." });
    }
};

// ==========================================
// 2. TESTS (Metadata & Admin Actions)
// ==========================================

export const getAllTests = async (req, res) => {
    try {
        const filters = {
            page: Number(req.query.page) || 1,
            limit: Number(req.query.limit) || 10,
            collectionId: req.query.collectionId, // Replaces seriesId
            search: req.query.search,
            type: req.query.type // e.g., "LIVE", "FULL_MOCK", "SECTIONAL"
        };
        
        const result = await TestService.getAllTests(filters);
        res.status(200).json({ success: true, ...result });
    } catch (error) {
        res.status(500).json({ success: false, message: "Failed to fetch tests." });
    }
};

export const getTestById = async (req, res) => {
    try {
        let test;
        // Admins & Creators bypass the entitlement/payment check
        if (["ADMIN", "CONTENT_CREATOR", "SUPERADMIN"].includes(req.user.role)) {
            test = await TestService.getTestById(req.params.testId);
        } else {
            // Students must pass the recursive subscription check
            test = await TestService.getTestForStudent(req.user.id, req.params.testId);
        }
        res.status(200).json({ success: true, data: test });
    } catch (error) {
        if (error.message === "TEST_NOT_FOUND") {
            return res.status(404).json({ success: false, message: "Test not found." });
        }
        if (error.message.includes("PAYMENT_REQUIRED")) {
            return res.status(402).json({ success: false, message: error.message });
        }
        res.status(500).json({ success: false, message: "Internal server error." });
    }
};

export const createTest = async (req, res) => {
    try {
        // req.body now accepts `collectionIds` array instead of relying on a URL param.
        // This allows you to map a test to "Banking Maha Pack" AND "Quant Pack" simultaneously.
        const test = await TestService.createTestWithSections(req.body);
        res.status(201).json({ success: true, data: test });
    } catch (error) {
        res.status(500).json({ success: false, message: "Failed to create test: " + error.message });
    }
};

export const updateTest = async (req, res) => {
    try {
        const test = await TestService.updateTest(req.params.testId, req.body);
        res.status(200).json({ success: true, data: test });
    } catch (error) {
        res.status(500).json({ success: false, message: "Failed to update test metadata." });
    }
};

export const deleteTest = async (req, res) => {
    try {
        await TestService.deleteTest(req.params.testId);
        res.status(200).json({ success: true, message: "Test deleted successfully." });
    } catch (error) {
        res.status(500).json({ success: false, message: "Failed to delete test." });
    }
};

// ==========================================
// 3. EXAM ENGINE (Student Actions)
// ==========================================

export const startTest = async (req, res) => {
    try {
        const attempt = await TestService.startTestAttempt(req.user.id, req.params.testId);
        res.status(200).json({ success: true, data: attempt });
    } catch (error) {
        // Handle specific Live Test timing constraints & Payments
        if (error.message.includes("PAYMENT_REQUIRED")) {
            return res.status(402).json({ success: false, message: "You need an active subscription." });
        }
        if (error.message === "LIVE_WINDOW_NOT_CONFIGURED") {
            return res.status(400).json({ success: false, message: "This live test has no scheduled time window." });
        }
        if (error.message === "TEST_NOT_YET_STARTED") {
            return res.status(403).json({ success: false, message: "This live test has not started yet." });
        }
        
        res.status(500).json({ success: false, message: "Failed to start test.", error: error.message });
    }
};

export const syncAnswer = async (req, res) => {
    try {
        // payload includes: testQuestionId, selectedOptionIds (array), textResponse, state, timeSpentSec
        const answer = await TestService.syncUserAnswer(req.user.id, req.params.attemptId, req.body);
        res.status(200).json({ success: true, data: answer });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
};

export const submitTest = async (req, res) => {
    try {
        const result = await TestService.submitTest(req.user.id, req.params.attemptId);
        res.status(200).json({ 
            success: true, 
            data: result, 
            message: "Test submitted successfully." 
        });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
};