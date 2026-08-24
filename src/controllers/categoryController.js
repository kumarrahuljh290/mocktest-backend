// --- controllers/categoryController.js ---
import { CategoryService } from "../services/categoryService.js";

export const createCategory = async (req, res) => {
    try {
        const category = await CategoryService.createCategory(req.body);
        res.status(201).json({ success: true, data: category });
    } catch (error) {
        res.status(500).json({ success: false, message: "Error creating category" });
    }
};

export const createExam = async (req, res) => {
    try {
        const { categoryId, name } = req.body;
        const exam = await CategoryService.createExam(categoryId, name);
        res.status(201).json({ success: true, data: exam });
    } catch (error) {
        res.status(500).json({ success: false, message: "Error creating exam" });
    }
};

