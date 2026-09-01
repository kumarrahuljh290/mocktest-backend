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
    /**
     * NEW: Takes `user` as the second parameter to stamp ownership.
     */
    static async createQuestion(data, user) {
        
        let assignedCreatorId = null;
        if (user?.role === 'CONTENT_CREATOR') {
            assignedCreatorId = user.id; // Enforce Creator Lock
        } else if (user?.role === 'ADMIN' || user?.role === 'SUPERADMIN') {
            assignedCreatorId = data.creatorId || null; // Allow Admins to assign or leave as PrepMaster Official
        }

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
                
                creatorId: assignedCreatorId, // <--- IP Protection Stamp
                
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
    /**
     * NEW: Takes `user` parameter to stamp ownership across thousands of questions instantly.
     */
    static async bulkCreateQuestions(questionsArray, user) {
        
        let assignedCreatorId = null;
        if (user?.role === 'CONTENT_CREATOR') {
            assignedCreatorId = user.id;
        }

        return await prisma.$transaction(async (tx) => {
            const createdQuestionIds = [];

            for (const data of questionsArray) {
                
                // If it's an admin doing the bulk upload, allow them to pass a specific creatorId per question in the array
                const specificCreatorId = user?.role === 'ADMIN' ? (data.creatorId || null) : assignedCreatorId;

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
                        
                        creatorId: specificCreatorId, // <--- IP Protection Stamp
                        
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
            maxWait: 5000, 
            timeout: 20000 
        });
    }

    // ==========================================
    // 4. FETCHING & FILTERING (STRICT ISOLATION)
    // ==========================================
    /**
     * NEW: Takes `user` parameter to filter the result set.
     */
    static async getQuestions(filters = {}, user) {
        const { page = 1, limit = 20, subject, topic, difficulty, type } = filters;
        const skip = (page - 1) * limit;

        const where = {
            ...(subject && { subject }),
            ...(topic && { topic }),
            ...(difficulty && { difficulty }),
            ...(type && { type }),
        };

        // MULTI-TENANCY ISOLATION:
        if (user?.role === 'CONTENT_CREATOR') {
            // A creator can ONLY ever see their own questions
            where.creatorId = user.id;
        } else if (user?.role === 'ADMIN' || user?.role === 'SUPERADMIN') {
            // An admin can filter by a specific creator, or view PrepMaster official (null)
            if (filters.creatorId !== undefined) {
                where.creatorId = filters.creatorId === 'null' ? null : filters.creatorId;
            }
        }

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