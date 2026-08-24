import prisma from "../config/prisma.js";

export class QuestionService {
    
    // ==========================================
    // 1. SHARED CONTEXT CREATION (RC & DI)
    // ==========================================
    static async createQuestionContext(data) {
        return await prisma.questionContext.create({
            data: {
                title: data.title,
                content: data.content,     // Expects JSON { "EN": "<p>Passage...</p>" }
                mediaUrls: data.mediaUrls || [], 
            }
        });
    }

    // ==========================================
    // 2. SINGLE QUESTION CREATION
    // ==========================================
    static async createQuestion(data) {
        // OPTIMIZATION: Using Prisma's Nested Writes. 
        // This inserts the Question and Options in a single DB roundtrip.
        const optionsData = data.options && data.options.length > 0 
            ? data.options.map((opt, index) => ({
                content: opt.content,
                isCorrect: opt.isCorrect || false,
                order: index + 1
            }))
            : [];

        return await prisma.question.create({
            data: {
                subject: data.subject,
                topic: data.topic,
                difficulty: data.difficulty || "MEDIUM",
                type: data.type || "SINGLE_CHOICE",
                content: data.content,
                solution: data.solution || null,
                contextId: data.contextId || null,
                mediaUrls: data.mediaUrls || [],
                
                // Nested write: Creates options automatically linked to this question ID
                ...(optionsData.length > 0 && {
                    options: { create: optionsData }
                })
            },
            include: { options: true, context: true }
        });
    }

    // ==========================================
    // 3. BULK UPLOAD (HIGHLY OPTIMIZED)
    // ==========================================
    static async bulkCreateQuestions(questionsArray) {
        // We use a transaction to ensure either ALL 1,000 questions upload, or NONE do.
        // This prevents data corruption on partial network failures.
        return await prisma.$transaction(async (tx) => {
            const createdQuestionIds = [];

            for (const data of questionsArray) {
                const optionsData = data.options && data.options.length > 0 
                    ? data.options.map((opt, index) => ({
                        content: opt.content,
                        isCorrect: opt.isCorrect || false,
                        order: index + 1
                    }))
                    : [];

                const question = await tx.question.create({
                    data: {
                        subject: data.subject,
                        topic: data.topic,
                        difficulty: data.difficulty || "MEDIUM",
                        type: data.type || "SINGLE_CHOICE",
                        content: data.content,
                        solution: data.solution || null,
                        contextId: data.contextId || null,
                        mediaUrls: data.mediaUrls || [],
                        
                        // Nested write inside transaction
                        ...(optionsData.length > 0 && {
                            options: { create: optionsData }
                        })
                    }
                });

                createdQuestionIds.push(question.id);
            }

            return {
                message: `Successfully uploaded ${createdQuestionIds.length} questions.`,
                count: createdQuestionIds.length,
                questionIds: createdQuestionIds
            };
        }, {
            // Bulk uploads take time, so we extend the transaction timeout
            maxWait: 5000, 
            timeout: 20000 
        });
    }

    // ==========================================
    // 4. FETCHING & FILTERING FOR ADMINS
    // ==========================================
    static async getQuestions(filters = {}) {
        const { page = 1, limit = 20, subject, topic, difficulty, type } = filters;
        const skip = (page - 1) * limit;

        const where = {
            ...(subject && { subject }),
            ...(topic && { topic }),
            ...(difficulty && { difficulty }),
            ...(type && { type }),
        };

        // Run count and fetch concurrently
        const [questions, total] = await Promise.all([
            prisma.question.findMany({
                where,
                skip,
                take: limit,
                orderBy: { createdAt: "desc" },
                include: { 
                    options: true,
                    context: true 
                } 
            }),
            prisma.question.count({ where })
        ]);

        return {
            data: questions,
            meta: { total, page, limit, totalPages: Math.ceil(total / limit) }
        };
    }
}