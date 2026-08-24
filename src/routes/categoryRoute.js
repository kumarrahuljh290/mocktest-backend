import { Router } from "express";
import { createCategory, createExam } from "../controllers/categoryController.js";
import { authMiddleware, roleMiddleware } from "../middlewares/authMiddleware.js";

const categoryRoute = Router();
// Only Admins should create master categories and exams
categoryRoute.post("/category", authMiddleware, roleMiddleware(["ADMIN"]), createCategory);
categoryRoute.post("/exam", authMiddleware, roleMiddleware(["ADMIN"]), createExam);

export default categoryRoute;