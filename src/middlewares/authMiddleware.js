import { verifyJwtToken } from "../config/jwt.js";

/**
 * Validates JWT from either:
 * 1. Authorization Header (`Bearer <token>`) -> Useful for mobile apps / external APIs
 * 2. HttpOnly Cookies (`access_token`) -> Best practice for web apps (prevents XSS)
 */
export const authMiddleware = (req, res, next) => {
    try {
        let token = null;
console.log("Auth Middleware: Checking for token in request...");
console.log("Auth Header: ", req.get("Authorization") || req.headers.authorization);
console.log("Cookies: ", req.cookies);
        // 1. Check Authorization header
        const authHeader = req.get("Authorization") || req.headers.authorization;
        if (authHeader && authHeader.startsWith("Bearer ")) {
            token = authHeader.split(" ")[1];
        } 
        // 2. Fallback to HttpOnly Cookie if header not found
        else if (req.cookies && req.cookies.access_token) {
            token = req.cookies.access_token;
        }

        if (!token) {
            return res.status(401).json({
                success: false,
                code: "TOKEN_MISSING",
                message: "Authentication required. Please sign in."
            });
        }

        // Verify token signature and expiration
        const decoded = verifyJwtToken(token);

        if (!decoded || !decoded.userId) {
            return res.status(401).json({
                success: false,
                code: "TOKEN_INVALID",
                message: "Invalid session token."
            });
        }

        // Standardize the user payload for all downstream controllers
        req.user = {
            id: decoded.userId,
            email: decoded.email,
            role: decoded.role || "STUDENT"
        };
        req.userId = decoded.userId; // Backward compatibility

        next();
    } catch (error) {
        console.error("JWT Verification Error:", error.message, error.name);
        if (error.name === "TokenExpiredError") {
            return res.status(401).json({
                success: false,
                code: "TOKEN_EXPIRED",
                message: "Session expired. Please log in again."
            });
        }

        return res.status(401).json({
            success: false,
            code: "AUTH_FAILED",
            message: "Authentication failed."
        });
    }
};

/**
 * Role-Based Access Control (RBAC) Middleware
 * Ensures only authorized roles (e.g. ADMIN, CONTENT_CREATOR) access specific endpoints.
 */
export const roleMiddleware = (allowedRoles = []) => {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({
                success: false,
                code: "UNAUTHENTICATED",
                message: "Authentication required."
            });
        }

        if (!allowedRoles.includes(req.user.role)) {
            return res.status(403).json({
                success: false,
                code: "FORBIDDEN",
                message: "You do not have permission to perform this action."
            });
        }

        next();
    };
};