import nodemailer from "nodemailer";
import dotenv from "dotenv";

dotenv.config();

// 1. Fail-Fast Configuration
const REQUIRED_ENV_VARS = ["GMAIL_USER", "GMAIL_APP_PASSWORD"];
for (const envVar of REQUIRED_ENV_VARS) {
  if (!process.env[envVar]) {
    throw new Error(`CRITICAL: Missing environment variable: ${envVar}`);
  }
}

// 2. Resilient Transport Layer (Enterprise Gmail Setup)
export const transporter = nodemailer.createTransport({
  host: "smtp.gmail.com",
  port: 465, // Render allows 465. This bypasses the firewall!
  secure: true, // Must be true for port 465
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_APP_PASSWORD, // The 16-character App Password, no spaces
  },
  // Keep connection pooling for stability
  pool: true,
  maxConnections: 3, // Keep lower for Gmail to prevent rate-limiting
  maxMessages: 50,
  connectionTimeout: 10000,
  greetingTimeout: 5000,
  socketTimeout: 15000,
});

// 3. Robust Service Function
export const sendOtpEmail = async (to, otp) => {
  console.info(`[EmailService] Preparing to send OTP to: ${to}`);
  
  if (!to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
    throw new Error("Invalid recipient email address provided.");
  }
  if (!otp) {
    throw new Error("OTP payload is missing.");
  }

  // PII Masking for logs (e.g., jo***@gmail.com)
  const maskedEmail = to.replace(/(.{2})(.*)(?=@)/, (match, p1, p2) => p1 + "*".repeat(p2.length));

  const mailOptions = {
    from: `"PrepMaster Security" <${process.env.GMAIL_USER}>`,
    to: to,
    subject: "Your OTP Code - Action Required",
    text: `Your OTP is: ${otp}. This OTP expires in 10 minutes. If you didn't request this, please ignore.`,
    html: `
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
    console.info(`[EmailService] Attempting to send OTP to ${maskedEmail}`);
    const info = await transporter.sendMail(mailOptions);
    console.info(`[EmailService] SUCCESS: OTP sent to ${maskedEmail} | MessageID: ${info.messageId}`);
    return { success: true, messageId: info.messageId };
  } catch (err) {
    console.error(`[EmailService] ERROR sending to ${maskedEmail}:`, {
      message: err.message,
      code: err.code,
      command: err.command,
    });
    throw new Error("Failed to send verification email. Please try again later.");
  }
};