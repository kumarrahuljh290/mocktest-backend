import prisma from "../config/prisma.js";

export class AnalyticsService {
    // ==========================================
    // 1. RECALCULATE LEADERBOARD & PERCENTILES
    // ==========================================
    static async generateLeaderboard(testId) {
        // Fetch all evaluated attempts for this test
        const attempts = await prisma.testAttempt.findMany({
            where: {
                testId,
                status: "EVALUATED",
            },
            select: {
                id: true,
                userId: true,
                score: true,
                accuracy: true,
                timeSpent: true,
            },
            orderBy: [
                { score: "desc" },       // 1st Priority: Score
                { timeSpent: "asc" },     // 2nd Priority: Speed
                { accuracy: "desc" },     // 3rd Priority: Accuracy
            ],
        });

        const totalCandidates = attempts.length;
        if (totalCandidates === 0) {
            return { success: true, message: "No evaluated attempts found.", count: 0 };
        }

        const leaderboardEntries = [];
        const attemptUpdates = [];

        for (let i = 0; i < totalCandidates; i++) {
            const attempt = attempts[i];
            const rank = i + 1;

            // Calculate standard percentile
            let percentile = 100.00;
            if (totalCandidates > 1) {
                percentile = Number((((totalCandidates - rank) / (totalCandidates - 1)) * 100).toFixed(2));
            }

            leaderboardEntries.push({
                testId,
                userId: attempt.userId,
                score: attempt.score || 0,
                rank,
                percentile,
            });

            attemptUpdates.push(
                prisma.testAttempt.update({
                    where: { id: attempt.id },
                    data: { rank, percentile },
                })
            );
        }

        // Atomic update: flush existing leaderboard and replace with newly computed rankings
        await prisma.$transaction([
            prisma.leaderboard.deleteMany({ where: { testId } }),
            prisma.leaderboard.createMany({ data: leaderboardEntries }),
            ...attemptUpdates,
        ]);

        return {
            success: true,
            message: `Leaderboard successfully generated for ${totalCandidates} candidates.`,
            count: totalCandidates,
        };
    }

    // ==========================================
    // 2. FETCH PAGINATED TEST LEADERBOARD
    // ==========================================
    static async getLeaderboard(testId, { page = 1, limit = 20, currentUserId = null }) {
        const skip = (page - 1) * limit;

        const [rankers, total] = await prisma.$transaction([
            prisma.leaderboard.findMany({
                where: { testId },
                orderBy: { rank: "asc" },
                skip,
                take: limit,
                select: {
                    rank: true,
                    score: true,
                    percentile: true,
                    user: {
                        select: {
                            id: true,
                            name: true,
                            email: true,
                        },
                    },
                },
            }),
            prisma.leaderboard.count({ where: { testId } }),
        ]);

        // Fetch current user's specific rank if requested
        let userStanding = null;
        if (currentUserId) {
            userStanding = await prisma.leaderboard.findUnique({
                where: {
                    testId_userId: {
                        testId,
                        userId: currentUserId,
                    },
                },
                select: {
                    rank: true,
                    score: true,
                    percentile: true,
                },
            });
        }

        return {
            data: rankers,
            currentUser: userStanding,
            meta: {
                total,
                page,
                limit,
                totalPages: Math.ceil(total / limit),
            },
        };
    }

    // ==========================================
    // 3. STUDENT DETAILED SCORECARD & ANALYTICS
    // ==========================================
    static async getAttemptScorecard(userId, attemptId) {
        const attempt = await prisma.testAttempt.findUnique({
            where: { id: attemptId },
            include: {
                test: {
                    select: {
                        id: true,
                        title: true,
                        totalMarks: true,
                        totalDuration: true,
                        sections: {
                            orderBy: { order: "asc" },
                            select: {
                                id: true,
                                name: true,
                                cutoffMarks: true,
                                order: true,
                            },
                        },
                    },
                },
                answers: {
                    include: {
                        testQuestion: {
                            include: {
                                question: {
                                    select: {
                                        id: true,
                                        subject: true,
                                        topic: true,
                                        difficulty: true,
                                        type: true,
                                    },
                                },
                            },
                        },
                    },
                },
            },
        });

        if (!attempt) throw new Error("ATTEMPT_NOT_FOUND");
        if (attempt.userId !== userId) throw new Error("UNAUTHORIZED");

        // Topper / Average benchmark stats
        const testBenchmark = await prisma.testAttempt.aggregate({
            where: { testId: attempt.testId, status: "EVALUATED" },
            _avg: { score: true, accuracy: true, timeSpent: true },
            _max: { score: true },
        });

        // 1. Compute Section-wise Breakdown
        const sectionBreakdown = {};
        attempt.test.sections.forEach((sec) => {
            sectionBreakdown[sec.id] = {
                sectionName: sec.name,
                cutoffMarks: sec.cutoffMarks ? Number(sec.cutoffMarks) : null,
                totalQuestions: 0,
                attempted: 0,
                correct: 0,
                incorrect: 0,
                score: 0,
                timeSpentSec: 0,
                isCutoffCleared: false,
            };
        });

        // 2. Compute Topic-wise Analysis (Strengths & Weaknesses)
        const topicAnalysis = {};

        // Process answer records
        attempt.answers.forEach((ans) => {
            const secId = ans.testQuestion.sectionId;
            const topic = ans.testQuestion.question.topic;
            const marksAwarded = Number(ans.marksAwarded || 0);

            // Accumulate section metrics
            if (sectionBreakdown[secId]) {
                sectionBreakdown[secId].totalQuestions += 1;
                sectionBreakdown[secId].timeSpentSec += ans.timeTakenSec;

                if (ans.state === "ANSWERED" || ans.state === "ANSWERED_AND_MARKED") {
                    sectionBreakdown[secId].attempted += 1;
                    sectionBreakdown[secId].score += marksAwarded;

                    if (ans.isCorrect === true) sectionBreakdown[secId].correct += 1;
                    else if (ans.isCorrect === false) sectionBreakdown[secId].incorrect += 1;
                }
            }

            // Accumulate topic metrics
            if (!topicAnalysis[topic]) {
                topicAnalysis[topic] = {
                    subject: ans.testQuestion.question.subject,
                    total: 0,
                    attempted: 0,
                    correct: 0,
                    incorrect: 0,
                    accuracy: 0,
                };
            }

            topicAnalysis[topic].total += 1;
            if (ans.state === "ANSWERED" || ans.state === "ANSWERED_AND_MARKED") {
                topicAnalysis[topic].attempted += 1;
                if (ans.isCorrect === true) topicAnalysis[topic].correct += 1;
                else if (ans.isCorrect === false) topicAnalysis[topic].incorrect += 1;
            }
        });

        // Finalize section cutoffs & topic accuracy percentages
        Object.values(sectionBreakdown).forEach((sec) => {
            if (sec.cutoffMarks !== null) {
                sec.isCutoffCleared = sec.score >= sec.cutoffMarks;
            } else {
                sec.isCutoffCleared = true;
            }
        });

        Object.values(topicAnalysis).forEach((top) => {
            top.accuracy = top.attempted > 0 ? Number(((top.correct / top.attempted) * 100).toFixed(2)) : 0;
        });

        return {
            summary: {
                testTitle: attempt.test.title,
                score: Number(attempt.score || 0),
                totalMarks: attempt.test.totalMarks,
                rank: attempt.rank,
                percentile: Number(attempt.percentile || 0),
                accuracy: Number(attempt.accuracy || 0),
                timeSpentSec: attempt.timeSpent || 0,
                totalDurationSec: attempt.test.totalDuration,
            },
            benchmarks: {
                topperScore: Number(testBenchmark._max.score || 0),
                averageScore: Number(testBenchmark._avg.score ? testBenchmark._avg.score.toFixed(2) : 0),
                averageAccuracy: Number(testBenchmark._avg.accuracy ? testBenchmark._avg.accuracy.toFixed(2) : 0),
            },
            sectionBreakdown: Object.values(sectionBreakdown),
            topicAnalysis,
        };
    }

    // ==========================================
    // 4. QUESTION-BY-QUESTION SOLUTION REVIEW
    // ==========================================
    static async getAttemptQuestionReview(userId, attemptId) {
        const attempt = await prisma.testAttempt.findUnique({
            where: { id: attemptId },
            include: {
                answers: {
                    include: {
                        testQuestion: {
                            include: {
                                question: {
                                    include: {
                                        options: true,
                                    },
                                },
                            },
                        },
                    },
                },
            },
        });

        if (!attempt) throw new Error("ATTEMPT_NOT_FOUND");
        if (attempt.userId !== userId) throw new Error("UNAUTHORIZED");

        return attempt.answers.map((ans) => {
            const { question } = ans.testQuestion;

            return {
                testQuestionId: ans.testQuestionId,
                order: ans.testQuestion.order,
                marks: Number(ans.testQuestion.marks),
                negativeMarks: Number(ans.testQuestion.negativeMarks),
                state: ans.state,
                userSelectedOptionIds: ans.selectedOptionIds,
                userTextResponse: ans.textResponse,
                timeTakenSec: ans.timeTakenSec,
                isCorrect: ans.isCorrect,
                marksAwarded: Number(ans.marksAwarded || 0),
                question: {
                    type: question.type,
                    subject: question.subject,
                    topic: question.topic,
                    difficulty: question.difficulty,
                    content: question.content,
                    solution: question.solution,
                    options: question.options.map((opt) => ({
                        id: opt.id,
                        content: opt.content,
                        isCorrect: opt.isCorrect,
                        order: opt.order,
                    })),
                },
            };
        });
    }
}