import dotenv from "dotenv";

dotenv.config();

// 1. Fail-Fast Configuration
const REQUIRED_ENV_VARS = ["BREVO_API_KEY", "SENDER_EMAIL"];
for (const envVar of REQUIRED_ENV_VARS) {
  if (!process.env[envVar]) {
    throw new Error(`CRITICAL: Missing environment variable: ${envVar}`);
  }
}

// 2. Direct API Email Service (Bypasses all SMTP Firewalls)
export const sendOtpEmail = async (to, otp) => {
  console.info(`[EmailService] Preparing to send OTP to: ${to}`);

  if (!to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
    throw new Error("Invalid recipient email address provided.");
  }
  if (!otp) {
    throw new Error("OTP payload is missing.");
  }

  const maskedEmail = to.replace(/(.{2})(.*)(?=@)/, (match, p1, p2) => p1 + "*".repeat(p2.length));

  const payload = {
    sender: {
      name: "PrepMaster Security",
      email: process.env.SENDER_EMAIL, // Must be the email you registered Brevo with
    },
    to: [
      {
        email: to,
      },
    ],
    subject: "Your OTP Code - Action Required",
    textContent: `Your OTP is: ${otp}. This OTP expires in 10 minutes. If you didn't request this, please ignore.`,
    htmlContent: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #333;">
        <h2>Verify Your Account</h2>
        <p>Your OTP is:</p>
        <h1 style="letter-spacing: 5px; background: #f4f4f4; padding: 15px; border-radius: 8px; text-align: center;">
          ${otp}
        </h1>
        <p style="font-size: 14px; color: #666;">This OTP expires in 10 minutes. If you did not request this, please ignore this email.</p>
      </div>
    `,
  };

  try {
    console.info(`[EmailService] Attempting to send OTP via API to ${maskedEmail}`);
    
    // Making a secure HTTPS request directly to Brevo
    const response = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        "Accept": "application/json",
        "Content-Type": "application/json",
        "api-key": process.env.BREVO_API_KEY,
      },
      body: JSON.stringify(payload),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || "Failed to send email via Brevo API");
    }

    console.info(`[EmailService] SUCCESS: OTP sent to ${maskedEmail} | MessageID: ${data.messageId}`);
    return { success: true, messageId: data.messageId };

  } catch (err) {
    console.error(`[EmailService] ERROR sending to ${maskedEmail}:`, err.message);
    throw new Error("Failed to send verification email. Please try again later.");
  }
};