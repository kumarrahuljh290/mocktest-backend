import prisma from "../config/prisma.js";
import slugify from "slugify";

export class CategoryService {
    static async createCategory(data) {
        const slug = slugify(data.name, { lower: true, strict: true });
        return await prisma.category.create({
            data: {
                name: data.name,
                slug: slug,
                parentId: data.parentId || null
            }
        });
    }

    static async getCategoriesHierarchy() {
        return await prisma.category.findMany({
            where: { parentId: null },
            include: {
                children: true,
                exams: { select: { id: true, name: true, slug: true } }
            }
        });
    }

    static async createExam(categoryId, name) {
        const slug = slugify(name, { lower: true, strict: true });
        return await prisma.exam.create({
            data: {
                categoryId,
                name,
                slug
            }
        });
    }
}