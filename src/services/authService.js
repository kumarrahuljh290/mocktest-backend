import prisma from "../config/prisma.js";
import { hashValue, compareValue } from "../config/bcrypt.js";
import { generateOTP } from "../utils/helper.js";
import { sendOtpEmail } from "../config/mailer.js";
import { addMinutes } from "date-fns";

export class AuthService {
    static async registerUser({ name, email, password }) {
        const existingUser = await prisma.user.findUnique({ where: { email } });
        
        if (existingUser) {
            const error = new Error("EMAIL_ALREADY_EXISTS");
            error.code = "EMAIL_ALREADY_EXISTS";
            throw error;
        }

        const hashedPassword = await hashValue(password);
        
        // Wrapped in a transaction to ensure User and OTP are created together safely
        const result = await prisma.$transaction(async (tx) => {
            const user = await tx.user.create({
                data: {
                    name,
                    email,
                    passwordHash: hashedPassword,
                    role: "STUDENT", // Updated to match new schema
                }
            });

            const otp = generateOTP();
            const hashedOTP = await hashValue(otp);

            await tx.otp.create({
                data: {
                    email,
                    code: hashedOTP,
                    type: "REGISTER",
                    expiresAt: addMinutes(new Date(), 10),
                },
            });

            return { user, otp };
        });

        // Send Email asynchronously (don't block the return)
        sendOtpEmail(email, result.otp).catch(console.error);

        const { passwordHash: _, ...safeUser } = result.user;
        return safeUser;
    }

    static async loginUser({ email, password }) {
        const user = await prisma.user.findUnique({ where: { email } });

        // Generic error message to prevent email enumeration
        if (!user || !user.passwordHash || !(await compareValue(password, user.passwordHash))) {
            const error = new Error("Invalid email or password");
            error.code = "INVALID_CREDENTIALS";
            throw error;
        }

        // NEW: Check if the account is suspended or deactivated
        if (user.accountStatus === "SUSPENDED_BY_ADMIN") {
            const error = new Error("This account has been suspended.");
            error.code = "ACCOUNT_SUSPENDED";
            throw error;
        }
        
        if (user.accountStatus === "DEACTIVATED_BY_USER") {
            const error = new Error("This account was deactivated. Please contact support.");
            error.code = "ACCOUNT_DEACTIVATED";
            throw error;
        }

        const { passwordHash: _, ...safeUser } = user;
        return safeUser;
    }

    // ==========================================
    // Auth0 / OAuth Implementation
    // ==========================================
    static async handleOAuthLogin({ provider, providerUserId, email, name, tokens }) {
        return await prisma.$transaction(async (tx) => {
            // 1. Find or create the user
            let user = await tx.user.findUnique({ where: { email } });

            if (!user) {
                user = await tx.user.create({
                    data: {
                        email,
                        name,
                        isVerified: true, // OAuth providers already verify emails
                        role: "STUDENT"
                    }
                });
            }

            // 2. Upsert the OAuth Account linkage
            await tx.oAuthAccount.upsert({
                where: {
                    provider_providerUserId: {
                        provider,
                        providerUserId
                    }
                },
                update: {
                    accessToken: tokens.accessToken,
                    refreshToken: tokens.refreshToken,
                    idToken: tokens.idToken
                },
                create: {
                    userId: user.id,
                    provider,
                    providerUserId,
                    accessToken: tokens.accessToken,
                    refreshToken: tokens.refreshToken,
                    idToken: tokens.idToken
                }
            });

            return user;
        });
    }

    static async verifyOTP(email, otp) {
        const record = await prisma.otp.findFirst({
            where: { email, type: "REGISTER", used: false },
            orderBy: { createdAt: "desc" },
        });

        if (!record) throw new Error("OTP_NOT_FOUND");
        if (record.expiresAt < new Date()) throw new Error("OTP_EXPIRED");

        const isValid = await compareValue(otp, record.code);
        if (!isValid) throw new Error("INVALID_OTP");

        await prisma.$transaction([
            prisma.user.update({ where: { email }, data: { isVerified: true } }),
            prisma.otp.update({ where: { id: record.id }, data: { used: true } })
        ]);

        return true;
    }
}