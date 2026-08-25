import { AuthService } from "../services/authService.js";
import { createJwtToken } from "../config/jwt.js";

// Helper for strict, secure cookies
const setAuthCookie = (res, token) => {
    res.cookie("access_token", token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7 Days
    });
};

export const register = async (req, res) => {
    try {
        const user = await AuthService.registerUser(req.body);
        const token = createJwtToken(user);
        
        setAuthCookie(res, token);

        return res.status(201).json({
            success: true,
            message: "Registration successful. Please verify your email.",
            data: { user } // Token excluded from body for security
        });
    } catch (error) {
        if (error.code === "EMAIL_ALREADY_EXISTS") {
            return res.status(409).json({ success: false, message: "Email already in use." });
        }
        console.error("[Register Error]:", error);
        return res.status(500).json({ success: false, message: "Internal server error" });
    }
};

export const login = async (req, res) => {
    try {
        const user = await AuthService.loginUser(req.body);

        // 1. Check verification FIRST
        if (!user.isVerified) {
            
            // Generate and send the OTP (you need to create this function in AuthService)
            await AuthService.resendVerificationOtp(user.email); 
            

            // Tell frontend to go to the OTP screen
            return res.status(200).json({
                success: true, // Returning 200 is fine if your frontend expects the 'action' flag
                message: "Please verify your account. A new OTP has been sent.",
                data: { action: "VERIFY_ACCOUNT", email: user.email }
            });
        }

        // 2. Generate token ONLY if the user is verified
        const token = createJwtToken(user);
        setAuthCookie(res, token);

        // 3. Send successful login response
        return res.status(200).json({
            success: true,
            message: "Login successful",
            data: { user }
        });

    } catch (error) {
        if (error.code === "INVALID_CREDENTIALS") {
            return res.status(401).json({ success: false, message: "Invalid email or password" });
        }
        if (error.code === "ACCOUNT_SUSPENDED" || error.code === "ACCOUNT_DEACTIVATED") {
            return res.status(403).json({ success: false, message: error.message });
        }
        
        console.error("[Login Error]:", error);
        return res.status(500).json({ success: false, message: "Internal server error" });
    }
};

export const verifyOtp = async (req, res) => {
  try {
    const { email, otp } = req.body;
    
    // 1. Verify OTP against the database
    const user = await AuthService.verifyOTP(email, otp);

    // 2. Generate JWT token and set HttpOnly cookie
    const token = createJwtToken(user);
    setAuthCookie(res, token);

    // 3. Return a success response to the frontend
    return res.status(200).json({
      success: true,
      message: "Account verified and logged in successfully.",
      user: {
        id: user._id, // Adjust based on your DB (e.g., user.id for SQL)
        email: user.email,
        name: user.name // Send back basic info the frontend UI might need
      }
    });

  } catch (error) {
    // 4. Handle known client errors
    if (error.code === "INVALID_OTP") {
      return res.status(400).json({ success: false, message: "Invalid OTP provided." });
    }
    
    if (error.code === "EXPIRED_OTP") {
      return res.status(400).json({ success: false, message: "OTP has expired. Please request a new one." });
    }
    
    if (error.code === "USER_NOT_FOUND") {
      return res.status(404).json({ success: false, message: "User not found." });
    }

    // 5. Catch-all for unexpected server errors
    console.error("[AuthController] Verify OTP Error:", error);
    return res.status(500).json({ 
      success: false, 
      message: "An internal server error occurred during verification." 
    });
  }
};


// ==========================================
// Auth0 / OAuth Controller
// ==========================================
export const auth0Callback = async (req, res) => {
    try {
        // In a real Auth0 setup, this data comes from the Auth0 SDK or decoded ID token
        const { provider, providerUserId, email, name, tokens } = req.body; 

        const user = await AuthService.handleOAuthLogin({
            provider,
            providerUserId,
            email,
            name,
            tokens
        });

        const token = createJwtToken(user);
        setAuthCookie(res, token);

        return res.status(200).json({
            success: true,
            message: "OAuth Login successful",
            data: { user }
        });
    } catch (error) {
        console.error("[OAuth Error]:", error);
        return res.status(500).json({ success: false, message: "OAuth login failed" });
    }
};

export const logout = async (req, res) => {
    res.clearCookie("access_token");
    return res.status(200).json({ success: true, message: "Logged out successfully" });
};