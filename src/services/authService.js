import prisma from "../config/prisma.js";
import { hashValue, compareValue } from "../config/bcrypt.js";
import { generateOTP } from "../utils/helper.js";
import { sendOtpEmail } from "../config/brevoForTest.js";
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
                    role: "STUDENT", 
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
        // NEW: Fetch the creator profile along with the user data
        const user = await prisma.user.findUnique({ 
            where: { email },
            include: {
                creatorProfile: {
                    select: {
                        slug: true,
                        status: true,
                        brandName: true,
                        razorpayAccountId: true // Just to check existence, not exposing to frontend
                    }
                }
            }
        });

        // Generic error message to prevent email enumeration
        if (!user || !user.passwordHash || !(await compareValue(password, user.passwordHash))) {
            const error = new Error("Invalid email or password");
            error.code = "INVALID_CREDENTIALS";
            throw error;
        }

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

        const { passwordHash: _, creatorProfile, ...safeUser } = user;

        // NEW: Inject Creator state smoothly for the frontend
        if (safeUser.role === 'CONTENT_CREATOR' && creatorProfile) {
            safeUser.creatorParams = {
                isProfileComplete: true,
                slug: creatorProfile.slug,
                brandName: creatorProfile.brandName,
                status: creatorProfile.status, // "PENDING", "ACTIVE", "SUSPENDED"
                hasBankDetailsLinked: !!creatorProfile.razorpayAccountId // returns true/false
            };
        } else {
            safeUser.creatorParams = null;
        }

        return safeUser;
    }

    // ==========================================
    // Auth0 / OAuth Implementation
    // ==========================================
    static async handleOAuthLogin({ provider, providerUserId, email, name, tokens }) {
        return await prisma.$transaction(async (tx) => {
            // 1. Find or create the user (INCLUDE creatorProfile for OAuth teachers!)
            let user = await tx.user.findUnique({ 
                where: { email },
                include: {
                    creatorProfile: {
                        select: { slug: true, status: true, brandName: true, razorpayAccountId: true }
                    }
                }
            });

            if (!user) {
                user = await tx.user.create({
                    data: {
                        email,
                        name,
                        isVerified: true, 
                        role: "STUDENT"
                    }
                });
                user.creatorProfile = null; // New users are strictly students
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

            // 3. Format the response with the exact same payload structure as regular login
            const { creatorProfile, ...safeUser } = user;

            if (safeUser.role === 'CONTENT_CREATOR' && creatorProfile) {
                safeUser.creatorParams = {
                    isProfileComplete: true,
                    slug: creatorProfile.slug,
                    brandName: creatorProfile.brandName,
                    status: creatorProfile.status,
                    hasBankDetailsLinked: !!creatorProfile.razorpayAccountId
                };
            } else {
                safeUser.creatorParams = null;
            }

            return safeUser;
        });
    }

   static async verifyOTP(email, otp) {
    // 1. Find the most recent OTP for this email
    const record = await prisma.otp.findFirst({
        where: { email, type: "REGISTER" },
        orderBy: { createdAt: "desc" },
    });

    // 2. Validate OTP existence and expiration
    if (!record) {
        const err = new Error("No OTP found for this user.");
        err.code = "USER_NOT_FOUND";
        throw err;
    }
    
    if (record.expiresAt < new Date()) {
        const err = new Error("OTP has expired.");
        err.code = "EXPIRED_OTP";
        throw err;
    }

    // 3. Verify the actual code
    const isValid = await compareValue(otp, record.code); 
    if (!isValid) {
        const err = new Error("Invalid OTP provided.");
        err.code = "INVALID_OTP";
        throw err;
    }

    // 4. Atomic Transaction: Verify user AND delete the used OTP simultaneously
    const [updatedUser, deletedOtp] = await prisma.$transaction([
        prisma.user.update({ 
            where: { email }, 
            data: { isVerified: true } 
        }),
        prisma.otp.delete({ 
            where: { id: record.id } 
        })
    ]);

    return updatedUser;
}

    static async resendVerificationOtp(email) {
        const otp = generateOTP();
        const hashedOTP = await hashValue(otp);

        await prisma.otp.deleteMany({ where: { email } });

        await prisma.otp.create({
            data: {
                email,
                code: hashedOTP,
                type: "REGISTER", 
                expiresAt: new Date(Date.now() + 10 * 60000), 
            },
        });

        try {
            console.log("Attempting to send email via Nodemailer...");
            await sendOtpEmail(email, otp);
            console.log("Email sent successfully!");
        } catch (emailError) {
            console.error("CRITICAL EMAIL ERROR:", emailError);
        }
    }
}