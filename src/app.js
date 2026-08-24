import express from "express";
import cookieParser from "cookie-parser";
import dotenv from "dotenv";
import cors from 'cors'
import authRoute from './routes/authRoute.js'
const app = express();
const allowedOrigins = [
    "https://yourdomain.com",
    "https://www.yourdomain.com",
    "https://app.yourdomain.com"
];


dotenv.config();
app.use(express.json());
app.use(cookieParser());

app.use(cors())
app.use("/users", authRoute);
app.use("/api/v1/collections", collectionRoutes); // (Previously series)
app.use("/api/v1/tests", testRoutes);             // For Admin Test Management & Student fetching
app.use("/api/v1/questions", questionRoutes);     // Admin Question Bank
app.use("/api/v1/attempts", attemptRoutes);       // Student Exam Taking Engine
app.use("/api/v1/analytics", analyticsRoutes);    // Student Reports & Live Leaderboards
app.use("/api/v1/billing", monetizationRoutes);   // Razorpay, Subscriptions & Refunds

export default app;