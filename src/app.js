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

// --- 1. CORS CONFIGURATION (TOP OF FILE) ---
const allowedOrigins = [
  "http://localhost:5173",           // Vite local
  "http://localhost:3000",           // React / Next.js local
  "https://your-frontend.vercel.app" // Replace with your actual live domain (no trailing slash)
];

const corsOptions = {
  origin: (origin, callback) => {
    // Allow requests with no origin (like Postman, mobile apps, curl, or server-to-server)
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error(`CORS policy blocked access from origin: ${origin}`));
    }
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "x-razorpay-signature"],
};

app.use(cors(corsOptions));


dotenv.config();
app.use(express.json());
app.use(cookieParser());


app.use("/api/v1/auth", authRoutes);
app.use("/api/v1/tests", testRoutes);             // For Admin Test Management & Student fetching
app.use("/api/v1/questions", questionRoutes);     // Admin Question Bank
app.use("/api/v1/attempts", attemptRoutes);       // Student Exam Taking Engine
app.use("/api/v1/analytics", analyticsRoutes);    // Student Reports & Live Leaderboards
app.use("/api/v1/billing", monetizationRoutes);   // Razorpay, Subscriptions & Refunds

export default app;