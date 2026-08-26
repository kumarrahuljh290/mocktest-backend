import prisma from "../config/prisma.js";
import slugify from "slugify";
import crypto from "crypto";

export class TestService {
    // ==========================================
    // 1. SECURITY & ENTITLEMENT RESOLUTION
    // ==========================================
    // ==========================================
    // 5. COLLECTION MANAGEMENT (ADMIN)
    // ==========================================

    /**
     * Creates a new Collection (Category, Exam, Test Series, etc.)
     * Supports infinite nesting via parentId.
     */
    static async createCollection(collectionData) {
        const { name, type, parentId, isPublished } = collectionData;

        if (!name || !type) {
            throw new Error("Missing required fields: 'name' and 'type' are required.");
        }

        // Generate a unique slug to prevent collisions (e.g., "sbi-po-prelims-8f7a6b")
        const baseSlug = slugify(name, { lower: true, strict: true });
        const uniqueSlug = `${baseSlug}-${crypto.randomBytes(4).toString("hex")}`;

        // If a parentId is provided, verify it actually exists first to provide a clean error
        if (parentId) {
            const parentExists = await prisma.collection.findUnique({ where: { id: parentId } });
            if (!parentExists) {
                throw new Error("Invalid parentId: Parent collection does not exist.");
            }
        }

        // Create the collection
        const collection = await prisma.collection.create({
            data: {
                name,
                slug: uniqueSlug,
                type,
                parentId: parentId || null,
                isPublished: isPublished || false,
            },
        });

        return collection;
    }

    /**
     * Fetch a lightweight list of collections.
     * Ideal for listing pages, home screens, and trending grids.
     */
    static async getAllCollections(filters = {}) {
        const { parentId, type, isPublished } = filters;

        // Build query conditions dynamically
        const where = {};
        
        // If parentId is explicitly 'null', fetch root collections
        if (parentId !== undefined) {
            where.parentId = parentId === 'null' ? null : parentId;
        }
        if (type) where.type = type;
        if (isPublished !== undefined) {
            where.isPublished = isPublished === 'true' || isPublished === true;
        }

        const collections = await prisma.collection.findMany({
            where,
            orderBy: { createdAt: 'desc' }, // Show newest first
            select: {
                id: true,
                name: true,
                slug: true,
                type: true,
                parentId: true,
                isPublished: true,
                // MAGIC TRICK: Get counts without fetching the actual heavy data!
                _count: {
                    select: {
                        children: true, // Number of sub-categories inside
                        tests: false     // Number of tests mapped to this collection
                    }
                }
            }
        });

        return collections;
    }
    /**
     * Fetch a single collection and its immediate contents (children & tests)
     */
    static async getCollectionDetails(collectionId) {
        const collection = await prisma.collection.findUnique({
            where: { id: collectionId },
            include: {
                // 1. Fetch Sub-collections (Folders inside this folder)
                children: {
                    where: { isPublished: true },
                    select: { id: true, name: true, type: true, slug: true }
                },
                // 2. Fetch Actual Tests mapped to this collection
                tests: {
                    orderBy: { order: 'asc' },
                    include: {
                        test: {
                            select: { 
                                id: true, title: true, type: true, 
                                totalDuration: true, totalMarks: true 
                            }
                        }
                    }
                }
            }
        });

        if (!collection) throw new Error("Collection not found");
        return collection;
    }


    /**
     * Enterprise Access Check using Recursive CTE.
     * Resolves access if the user bought the exact test OR any parent collection nested infinitely deep.
     */
    static async verifyStudentAccess(userId, testId) {
        // Highly optimized raw SQL for recursive graph traversal
        const accessCheck = await prisma.$queryRaw`
            WITH RECURSIVE CollectionTree AS (
                -- Base Case: Get all collections the user has DIRECTly unlocked via active subscriptions
                SELECT c.id 
                FROM "Collection" c
                JOIN "ProductEntitlement" pe ON c.id = pe."collectionId"
                JOIN "Subscription" s ON pe."productId" = s."productId"
                WHERE s."userId" = ${userId}
                  AND s.status = 'ACTIVE' 
                  AND s."endDate" > NOW()
                  
                UNION ALL
                
                -- Recursive Case: Get all children of the unlocked collections
                SELECT child.id 
                FROM "Collection" child
                INNER JOIN CollectionTree ct ON child."parentId" = ct.id
            )
            SELECT EXISTS (
                -- Check 1: Does the user have a direct entitlement to this test?
                SELECT 1 FROM "ProductEntitlement" pe
                JOIN "Subscription" s ON pe."productId" = s."productId"
                WHERE s."userId" = ${userId} AND s.status = 'ACTIVE' AND s."endDate" > NOW() AND pe."testId" = ${testId}
                
                UNION
                
                -- Check 2: Is the test mapped to any collection in the user's unlocked tree?
                SELECT 1 FROM "CollectionTest" ct
                WHERE ct."testId" = ${testId} AND ct."collectionId" IN (SELECT id FROM CollectionTree)
            ) AS "hasAccess";
        `;

        if (!accessCheck[0]?.hasAccess) {
            throw new Error("PAYMENT_REQUIRED: You do not have access to this test.");
        }
        return true;
    }

    // ==========================================
    // 2. EXAM ENGINE: START, SYNC, SUBMIT
    // ==========================================

    static async startTestAttempt(userId, testId) {
        const test = await prisma.test.findUnique({ where: { id: testId } });
        if (!test) throw new Error("TEST_NOT_FOUND");

        await this.verifyStudentAccess(userId, testId);

        // Determine Mode: LIVE vs PRACTICE
        let attemptMode = "PRACTICE";
        const now = new Date();
        
        if (test.type === "LIVE") {
            if (!test.liveStartTime || !test.liveEndTime) {
                throw new Error("LIVE_WINDOW_NOT_CONFIGURED");
            }
            if (now < test.liveStartTime) {
                throw new Error("TEST_NOT_YET_STARTED");
            }
            // If currently in the window, it's a competitive live attempt
            if (now >= test.liveStartTime && now <= test.liveEndTime) {
                attemptMode = "LIVE_LEADERBOARD";
            }
        }

        // Return existing attempt if in progress
        const existingAttempt = await prisma.testAttempt.findFirst({
            where: { userId, testId, status: "IN_PROGRESS" }
        });

        if (existingAttempt) return existingAttempt;

        return await prisma.testAttempt.create({
            data: { 
                userId, 
                testId, 
                status: "IN_PROGRESS",
                testMode: attemptMode
            }
        });
    }

    static async syncUserAnswer(userId, attemptId, payload) {
        const { testQuestionId, selectedOptionIds, textResponse, state, timeSpentSec } = payload;
        
        const attempt = await prisma.testAttempt.findUnique({ where: { id: attemptId } });
        if (!attempt || attempt.userId !== userId || attempt.status !== "IN_PROGRESS") {
            throw new Error("INVALID_OR_COMPLETED_ATTEMPT");
        }

        return await prisma.userAnswer.upsert({
            where: {
                attemptId_testQuestionId: { attemptId, testQuestionId }
            },
            update: {
                selectedOptionIds: selectedOptionIds || [],
                textResponse: textResponse || null,
                state: state,
                timeTakenSec: { increment: timeSpentSec || 0 } // Incremental time tracking
            },
            create: {
                attemptId,
                testQuestionId,
                selectedOptionIds: selectedOptionIds || [],
                textResponse: textResponse || null,
                state,
                timeTakenSec: timeSpentSec || 0
            }
        });
    }

    static async submitTest(userId, attemptId) {
        const attempt = await prisma.testAttempt.findUnique({ 
            where: { id: attemptId },
            include: { test: true }
        });

        if (!attempt || attempt.userId !== userId) throw new Error("INVALID_ATTEMPT");
        if (attempt.status !== "IN_PROGRESS") return attempt; 

        // Enforce Live Window cut-off
        if (attempt.testMode === "LIVE_LEADERBOARD" && new Date() > attempt.test.liveEndTime) {
            // Note: In a real app, a CRON job should auto-submit these.
        }

        const userAnswers = await prisma.userAnswer.findMany({
            where: { attemptId },
            include: {
                testQuestion: {
                    include: { question: { include: { options: true } } }
                }
            }
        });

        let score = 0;
        let correctCount = 0;
        let totalAnswered = 0;
        let totalTimeSpent = 0;

        for (const ans of userAnswers) {
            totalTimeSpent += ans.timeTakenSec;

            if (["ANSWERED", "ANSWERED_AND_MARKED"].includes(ans.state)) {
                totalAnswered++;
                const tq = ans.testQuestion;
                const q = tq.question;
                
                let isCorrect = false;

                // MULTIPLE CHOICE & SINGLE CHOICE EVALUATION
                if (q.type === "SINGLE_CHOICE" || q.type === "MULTIPLE_CHOICE") {
                    const correctOptionIds = q.options.filter(o => o.isCorrect).map(o => o.id).sort();
                    const userSelectedIds = [...(ans.selectedOptionIds || [])].sort();
                    
                    isCorrect = JSON.stringify(correctOptionIds) === JSON.stringify(userSelectedIds);
                } 
                // NUMERIC INPUT EVALUATION
                else if (q.type === "NUMERIC_INPUT") {
                    // Assuming q.solution holds the exact numeric answer or range
                    const expectedAnswer = q.solution?.correctValue; 
                    isCorrect = ans.textResponse === String(expectedAnswer);
                }

                if (isCorrect) {
                    score += Number(tq.marks);
                    correctCount++;
                    // Save evaluation to DB
                    await prisma.userAnswer.update({ where: { id: ans.id }, data: { isCorrect: true, marksAwarded: tq.marks } });
                } else {
                    score -= Number(tq.negativeMarks);
                    await prisma.userAnswer.update({ where: { id: ans.id }, data: { isCorrect: false, marksAwarded: -tq.negativeMarks } });
                }
            }
        }

        const accuracy = totalAnswered > 0 ? (correctCount / totalAnswered) * 100 : 0;

        // Finalize Attempt
        return await prisma.testAttempt.update({
            where: { id: attemptId },
            data: {
                status: "EVALUATED",
                submittedAt: new Date(),
                score: score,
                accuracy: accuracy,
                timeSpent: totalTimeSpent
            }
        });
    }

    // ==========================================
    // 3. SECURE DATA FETCHING (CLIENT)
    // ==========================================
    
    static async getTestForStudent(userId, testId) {
        // await this.verifyStudentAccess(userId, testId);

        const test = await prisma.test.findUnique({
            where: { id: testId },
            include: {
                sections: {
                    orderBy: { order: "asc" },
                    include: {
                        testQuestions: {
                            orderBy: { order: "asc" },
                            include: {
                                question: {
                                    include: {
                                        context: true,
                                        options: {
                                            orderBy: { order: "asc" },
                                            // SECURITY: Never leak 'isCorrect' or 'solution' to the client!
                                            select: { id: true, content: true, order: true }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        });

        if (!test) throw new Error("TEST_NOT_FOUND");
        
        // Strip solutions from questions payload
        test.sections.forEach(sec => {
            sec.testQuestions.forEach(tq => {
                delete tq.question.solution;
            });
        });

        return test;
    }

    // ==========================================
    // 4. CONTENT MANAGEMENT (ADMIN)
    // ==========================================

    static async createTestWithSections(testData) {
        const slug = slugify(testData.title, { lower: true, strict: true }) + "-" + crypto.randomBytes(4).toString("hex");

        return await prisma.$transaction(async (tx) => {
            const test = await tx.test.create({
                data: {
                    title: testData.title, 
                    slug,
                    type: testData.type || "FULL_MOCK",
                    totalDuration: testData.totalDuration, 
                    totalMarks: testData.totalMarks,
                    strictNavigation: testData.strictNavigation || false,
                    availableLanguages: testData.availableLanguages || ["EN"],
                    liveStartTime: testData.liveStartTime || null,
                    liveEndTime: testData.liveEndTime || null,
                }
            });

            // Map Test to Collections if provided
            if (testData.collectionIds?.length) {
                await tx.collectionTest.createMany({
                    data: testData.collectionIds.map(cId => ({
                        collectionId: cId,
                        testId: test.id,
                        order: 0
                    }))
                });
            }

            for (const sectionData of testData.sections) {
                const section = await tx.testSection.create({
                    data: { testId: test.id, name: sectionData.name, duration: sectionData.duration, order: sectionData.order }
                });

                if (sectionData.questions && sectionData.questions.length > 0) {
                    const testQuestions = sectionData.questions.map((q, index) => ({
                        sectionId: section.id, 
                        questionId: q.questionId, 
                        order: index + 1,
                        marks: q.marks, 
                        negativeMarks: q.negativeMarks
                    }));
                    await tx.testQuestion.createMany({ data: testQuestions });
                }
            }
            return test;
        });
    }
}