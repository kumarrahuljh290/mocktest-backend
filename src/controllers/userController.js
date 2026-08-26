import { UserService } from "../services/userService.js";

export const getMyProfile = async (req, res) => {
    try {
        // req.user.id is injected by your authMiddleware
        const user = await UserService.getUserProfile(req.user.id);
        
        res.status(200).json({ 
            success: true, 
            data: user 
        });
    } catch (error) {
        if (error.message === "USER_NOT_FOUND") {
            return res.status(404).json({ success: false, message: "User account not found." });
        }
        console.error("[Get Profile Error]:", error);
        res.status(500).json({ success: false, message: "Failed to fetch profile data." });
    }
};

export const updateMyProfile = async (req, res) => {
    try {
        const updatedUser = await UserService.updateUserProfile(req.user.id, req.body);
        
        res.status(200).json({ 
            success: true, 
            message: "Profile updated successfully.",
            data: updatedUser 
        });
    } catch (error) {
        if (error.message === "NO_VALID_FIELDS_TO_UPDATE") {
            return res.status(400).json({ success: false, message: "No valid fields provided for update." });
        }
        console.error("[Update Profile Error]:", error);
        res.status(500).json({ success: false, message: "Failed to update profile." });
    }
};