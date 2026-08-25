import jwt from 'jsonwebtoken';

const getSecretKey = () => {
    const secretKey = process.env.JWT_SECRET;
    if (!secretKey) {
        throw new Error("FATAL: JWT_SECRET environment variable is not defined.");
    }
    return secretKey;
};

// Application constants for standardizing token validation


/**
 * Creates an Access Token
 * Expiry is set to 8h to comfortably cover longest competitive exams (e.g., UPSC/JEE)
 * without terminating the session mid-test.
 */
export const createJwtToken = (userData) => {
    const payload = {
        userId: userData.id,
        role: userData.role,
        email: userData.email
    };

    return jwt.sign(
        payload,
        getSecretKey(),
        {
            algorithm: "HS256",
            expiresIn: "8h", // Extended to prevent mid-exam lockouts
            issuer: process.env.JWT_ISSUER,
            audience: process.env.JWT_AUDIENCE
        }
    );
};

/**
 * Verifies the Token
 * Note: We intentionally do NOT use try/catch here. 
 * We want the TokenExpiredError or JsonWebTokenError to bubble up 
 * to the authMiddleware so it can send the correct 401 response code.
 */
export const verifyJwtToken = (token) => {
    // This will throw an error if the token is invalid or expired
    return jwt.verify(token, getSecretKey(), {
        algorithms: ["HS256"], // Strictly enforce algorithm to prevent downgrade attacks
        issuer: process.env.JWT_ISSUER,      // ✅ FIXED: Added process.env.
        audience: process.env.JWT_AUDIENCE   // ✅ FIXED: Added process.env.
    });
};