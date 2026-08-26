import prisma from "../config/prisma.js";

export class UserService {
    // ==========================================
    // GET USER PROFILE
    // ==========================================
    static async getUserProfile(userId) {
        const user = await prisma.user.findUnique({
            where: { id: userId },
            select: {
                id: true,
                name: true,
                email: true,
                role: true,
                isVerified: true,
                createdAt: true,
                // Do NOT include the password field here!
            }
        });

        if (!user) {
            throw new Error("USER_NOT_FOUND");
        }

        return user;
    }

    // ==========================================
    // UPDATE USER PROFILE
    // ==========================================
    static async updateUserProfile(userId, updateData) {
        // Strict Data Sanitization: Only allow specific fields to be updated.
        // This prevents malicious users from sending { role: "SUPERADMIN" } in the body.
        const allowedUpdates = {};
        if (updateData.name) allowedUpdates.name = updateData.name;
        // If you have phone or avatarUrl in your schema, add them here:
        // if (updateData.phone) allowedUpdates.phone = updateData.phone;

        if (Object.keys(allowedUpdates).length === 0) {
            throw new Error("NO_VALID_FIELDS_TO_UPDATE");
        }

        return await prisma.user.update({
            where: { id: userId },
            data: allowedUpdates,
            select: {
                id: true,
                name: true,
                email: true,
                role: true,
                isVerified: true
            }
        });
    }
}