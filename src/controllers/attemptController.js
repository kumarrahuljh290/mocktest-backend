import { AttemptService } from "../services/attemptService.js";
import { TestService } from "../services/testService.js";

// ==========================================
// 1. START ATTEMPT (Delegates to TestService for Entitlements)
// ==========================================
export const startTest = async (req, res) => {
    try {
        const attempt = await TestService.startTestAttempt(req.user.id, req.params.testId);
        res.status(200).json({ success: true, data: attempt });
    } catch (error) {
        console.error("[Start Test Error]:", error);
        
        if (error.message.includes("PAYMENT_REQUIRED")) {
            return res.status(402).json({ success: false, message: "Active subscription required to access this test." });
        }
        if (error.message === "TEST_NOT_YET_STARTED") {
            return res.status(403).json({ success: false, message: "This live test has not started yet." });
        }
        if (error.message === "LIVE_WINDOW_NOT_CONFIGURED") {
            return res.status(400).json({ success: false, message: "Live test timing is improperly configured." });
        }
        
        res.status(500).json({ success: false, message: "Failed to start test.", error: error.message });
    }
};

// ==========================================
// 2. REAL-TIME STATE SAVING (iON Palette Logic)
// ==========================================
export const syncAnswer = async (req, res) => {
    try {
        const { attemptId } = req.params;
        const result = await AttemptService.syncAnswer(req.user.id, attemptId, req.body);
        
        res.status(200).json({ success: true, data: result });
    } catch (error) {
        if (error.message === "UNAUTHORIZED_ATTEMPT") {
            return res.status(403).json({ success: false, message: "Unauthorized access to attempt." });
        }
        if (error.message === "ATTEMPT_LOCKED") {
            return res.status(400).json({ success: false, message: "Test has already been submitted." });
        }
        if (error.message === "LIVE_WINDOW_CLOSED") {
            return res.status(403).json({ success: false, message: "The live test time window has expired. Answers can no longer be synced." });
        }
        
        console.error("[Sync Answer Error]:", error);
        res.status(500).json({ success: false, message: "Failed to sync answer state." });
    }
};

// ==========================================
// 3. FINAL TEST SUBMISSION & EVALUATION
// ==========================================
export const submitTest = async (req, res) => {
    try {
        const { attemptId } = req.params;
        const evaluatedAttempt = await AttemptService.submitAndEvaluateTest(req.user.id, attemptId);
        
        res.status(200).json({ 
            success: true, 
            message: "Test submitted and evaluated successfully.",
            data: evaluatedAttempt 
        });
    } catch (error) {
        if (error.message === "UNAUTHORIZED_ATTEMPT") {
            return res.status(403).json({ success: false, message: "Unauthorized access to attempt." });
        }
        
        // Note: The service now gracefully handles "ALREADY_SUBMITTED" by just returning the evaluated attempt
        // rather than throwing an error, making it safer for double-clicks on the frontend.
        
        console.error("[Submit Test Error]:", error);
        res.status(500).json({ success: false, message: "Failed to evaluate test." });
    }
};