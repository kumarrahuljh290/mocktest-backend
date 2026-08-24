import prisma from "../config/prisma.js";

export class AttemptService {
    
    // ==========================================
    // 1. REAL-TIME STATE SAVING (High Throughput)
    // ==========================================
    static async syncAnswer(userId, attemptId, data) {
        // Fetch minimal data to verify ownership quickly
        const attempt = await prisma.testAttempt.findUnique({
            where: { id: attemptId },
            select: { userId: true, status: true, testMode: true, test: { select: { liveEndTime: true } } }
        });

        if (!attempt || attempt.userId !== userId) throw new Error("UNAUTHORIZED_ATTEMPT");
        if (attempt.status !== "IN_PROGRESS") throw new Error("ATTEMPT_LOCKED");

        // Hard cutoff for Live Tests - prevent late syncing
        if (attempt.testMode === "LIVE_LEADERBOARD" && attempt.test.liveEndTime < new Date()) {
            throw new Error("LIVE_WINDOW_CLOSED");
        }

        // Upsert ensures we create a new record if they visit for the first time, or update if they change state.
        return await prisma.userAnswer.upsert({
            where: {
                attemptId_testQuestionId: {
                    attemptId: attemptId,
                    testQuestionId: data.testQuestionId
                }
            },
            update: {
                state: data.state, 
                selectedOptionIds: data.selectedOptionIds || [],
                textResponse: data.textResponse || null,
                timeTakenSec: { increment: data.timeSpentOnQuestion || 0 } 
            },
            create: {
                attemptId: attemptId,
                testQuestionId: data.testQuestionId,
                state: data.state,
                selectedOptionIds: data.selectedOptionIds || [],
                textResponse: data.textResponse || null,
                timeTakenSec: data.timeSpentOnQuestion || 0
            }
        });
    }

    // ==========================================
    // 2. TEST SUBMISSION & EVALUATION 
    // ==========================================
    static async submitAndEvaluateTest(userId, attemptId) {
        return await prisma.$transaction(async (tx) => {
            const attempt = await tx.testAttempt.findUnique({
                where: { id: attemptId },
                include: { answers: true }
            });

            if (!attempt || attempt.userId !== userId) throw new Error("UNAUTHORIZED_ATTEMPT");
            if (attempt.status !== "IN_PROGRESS") return attempt; // Already submitted

            let totalScore = 0;
            let correctCount = 0;
            let incorrectCount = 0;
            let totalTimeSpent = 0;

            // Fetch all test questions with their mapped marks and correct options in ONE query
            const testQuestions = await tx.testQuestion.findMany({
                where: { section: { testId: attempt.testId } },
                include: {
                    question: { include: { options: true } }
                }
            });

            const answersToUpdate = [];

            // 1. Memory-based Evaluation Loop (Lightning Fast)
            for (const userAnswer of attempt.answers) {
                totalTimeSpent += userAnswer.timeTakenSec;

                if (["ANSWERED", "ANSWERED_AND_MARKED"].includes(userAnswer.state)) {
                    const tq = testQuestions.find(q => q.id === userAnswer.testQuestionId);
                    if (!tq) continue;

                    let isCorrect = false;
                    let marksAwarded = 0;

                    if (["SINGLE_CHOICE", "MULTIPLE_CHOICE"].includes(tq.question.type)) {
                        const correctOptionIds = tq.question.options
                            .filter(opt => opt.isCorrect)
                            .map(opt => opt.id)
                            .sort();
                        
                        const userSelectedIds = [...userAnswer.selectedOptionIds].sort();
                        isCorrect = JSON.stringify(correctOptionIds) === JSON.stringify(userSelectedIds);
                    } 
                    else if (tq.question.type === "NUMERIC_INPUT") {
                        // Extracting exact match from solution JSON
                        const expectedAnswer = tq.question.solution?.correctValue;
                        isCorrect = userAnswer.textResponse === String(expectedAnswer);
                    }

                    if (isCorrect) {
                        marksAwarded = Number(tq.marks);
                        totalScore += marksAwarded;
                        correctCount++;
                    } else {
                        marksAwarded = -Number(tq.negativeMarks);
                        totalScore += marksAwarded;
                        incorrectCount++;
                    }

                    answersToUpdate.push(tx.userAnswer.update({
                        where: { id: userAnswer.id },
                        data: { isCorrect, marksAwarded }
                    }));
                }
            }

            // 2. Concurrent DB Updates (Solves the N+1 Performance Bottleneck)
            // Instead of awaiting inside a loop, we fire all updates simultaneously
            if (answersToUpdate.length > 0) {
                await Promise.all(answersToUpdate);
            }

            const totalAttempted = correctCount + incorrectCount;
            const accuracy = totalAttempted > 0 ? (correctCount / totalAttempted) * 100 : 0;

            // 3. Finalize Attempt
            return await tx.testAttempt.update({
                where: { id: attemptId },
                data: {
                    status: "EVALUATED",
                    submittedAt: new Date(),
                    score: totalScore,
                    accuracy: accuracy,
                    timeSpent: totalTimeSpent
                }
            });
        });
    }
}