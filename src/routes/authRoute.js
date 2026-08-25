import { Router } from "express";
import { 
    login, 
    register, 
    logout,
    auth0Callback,
    verifyOtp
} from "../controllers/authController.js";

const authRoute = Router();

// Standard Auth
authRoute.post("/register", register);
authRoute.post("/login", login);
authRoute.post("/logout", logout);
authRoute.post("/verify-otp", verifyOtp); // Assuming you have a verifyOtp controller
// Auth0 / OAuth
authRoute.post("/oauth/callback", auth0Callback);

export default authRoute;