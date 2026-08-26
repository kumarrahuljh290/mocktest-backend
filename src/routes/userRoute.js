import { Router } from "express";
import { getMyProfile, updateMyProfile } from "../controllers/userController.js";
import { authMiddleware } from "../middlewares/authMiddleware.js";

const userRoute = Router();

// All profile routes require the user to be logged in
userRoute.use(authMiddleware);

// GET /api/v1/users/me - Fetch logged-in user's details
userRoute.get("/me", getMyProfile);

// PATCH /api/v1/users/me - Update logged-in user's details (e.g., name)
userRoute.patch("/me", updateMyProfile);

export default userRoute;