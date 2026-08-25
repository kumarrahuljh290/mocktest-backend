import nodemailer from "nodemailer";
import dotenv from "dotenv";

// 1. Fail-Fast Configuration
// Enterprise apps crash immediately on startup if config is missing, rather than failing later.
dotenv.config();

const REQUIRED_ENV_VARS = ["BREVO_SMTP_USER", "BREVO_SMTP_KEY", "SENDER_EMAIL"];
for (const envVar of REQUIRED_ENV_VARS) {
  if (!process.env[envVar]) {
    throw new Error(`CRITICAL: Missing environment variable: ${envVar}`);
  }
}

// 2. Resilient Transport Layer
export const transporter = nodemailer.createTransport({
  host: "smtp-relay.brevo.com",
  port: 587, // Standard port for Brevo SMTP
  secure: false, // false for 587, Nodemailer will automatically upgrade to TLS via STARTTLS
  requireTLS: true, // Strictly enforce TLS encryption
  auth: {
    user: process.env.BREVO_SMTP_USER,
    pass: process.env.BREVO_SMTP_KEY, // Note: Use the Brevo SMTP API Key, NOT your login password
  },
  // Connection Pooling: Reuses connections for high throughput instead of creating a new one per email
  pool: true,
  maxConnections: 5,
  maxMessages: 100,
  // Timeouts: Prevents hanging connections from exhausting server memory if Brevo goes down
  connectionTimeout: 10000,
  greetingTimeout: 5000,
  socketTimeout: 15000,
});

// 3. Robust Service Function
export const sendOtpEmail = async (to, otp) => {
  // Input Validation
  if (!to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
    throw new Error("Invalid recipient email address provided.");
  }
  if (!otp) {
    throw new Error("OTP payload is missing.");
  }

  // PII Masking: e.g., converts "johndoe@gmail.com" to "jo***@gmail.com" for secure logging
  const maskedEmail = to.replace(/(.{2})(.*)(?=@)/, (match, p1, p2) => p1 + "*".repeat(p2.length));

  const mailOptions = {
    from: `"MockTest Security" <${process.env.SENDER_EMAIL}>`,
    to: to,
    subject: "Your OTP Code - Action Required",
    // Deliverability: Always include a plain-text fallback to prevent spam filter blocking
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
    // Structured Logging: Log the exact error codes without leaking the whole raw trace to monitoring tools
    console.error(`[EmailService] ERROR sending to ${maskedEmail}:`, {
      message: err.message,
      code: err.code,
      command: err.command,
    });
    
    // Do not leak internal SMTP errors to the client/frontend
    throw new Error("Failed to send verification email. Please try again later.");
  }
};