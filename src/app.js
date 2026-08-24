import express from "express";
import cookieParser from "cookie-parser";
import dotenv from "dotenv";
import cors from 'cors'
import authRoutes from './routes/authRoute.js'
import testRoutes from './routes/testRoute.js'
import questionRoutes from './routes/questionRoute.js'
import attemptRoutes from './routes/attemptRoute.js'
import analyticsRoutes from './routes/analyticsRoute.js'
import monetizationRoutes from './routes/monetizationRoute.js'
const app = express();
const allowedOrigins = [
    "https://yourdomain.com",
    "https://www.yourdomain.com",
    "https://app.yourdomain.com",
    "http://localhost:5173"
];


dotenv.config();
app.use(express.json());
app.use(cookieParser());

app.use(cors())
app.use("/api/v1/auth", authRoutes);
app.use("/api/v1/tests", testRoutes);             // For Admin Test Management & Student fetching
app.use("/api/v1/questions", questionRoutes);     // Admin Question Bank
app.use("/api/v1/attempts", attemptRoutes);       // Student Exam Taking Engine
app.use("/api/v1/analytics", analyticsRoutes);    // Student Reports & Live Leaderboards
app.use("/api/v1/billing", monetizationRoutes);   // Razorpay, Subscriptions & Refunds

export default app;