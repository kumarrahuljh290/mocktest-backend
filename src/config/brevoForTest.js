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
    subject: "PrepMaster: Secure Verification Code",
    textContent: `Your secure verification code is: ${otp}. This code expires in 10 minutes. If you did not request this, please ignore this email.`,
    htmlContent: `
      <div style="background-color: #f9fafb; padding: 40px 20px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; -webkit-font-smoothing: antialiased;">
        <div style="max-width: 500px; margin: 0 auto; background-color: #ffffff; border-radius: 16px; overflow: hidden; border: 1px solid #e5e7eb; box-shadow: 0 4px 20px rgba(0, 0, 0, 0.03);">
          
          <!-- Premium Header -->
          <div style="padding: 32px 40px; text-align: center; border-bottom: 1px solid #f3f4f6;">
            <h2 style="margin: 0; font-size: 22px; font-weight: 700; color: #111827; letter-spacing: -0.5px;">
              <span style="color: #4f46e5;">Prep</span>Master
            </h2>
          </div>
          
          <!-- Body Content -->
          <div style="padding: 40px;">
            <h3 style="margin: 0 0 12px; font-size: 18px; font-weight: 600; color: #111827;">Secure Verification</h3>
            <p style="margin: 0 0 32px; font-size: 15px; line-height: 24px; color: #4b5563;">
              You recently requested to securely log in or verify your account. Please enter the authentication code below to proceed.
            </p>

            <!-- High-Contrast OTP Container -->
            <div style="background-color: #0f172a; border-radius: 12px; padding: 24px; text-align: center;">
              <span style="font-family: 'Courier New', Courier, monospace; font-size: 36px; font-weight: 700; color: #ffffff; letter-spacing: 12px; margin-left: 12px;">
                ${otp}
              </span>
            </div>

            <!-- Expiry & Security Warning -->
            <div style="margin-top: 32px; padding-top: 24px; border-top: 1px solid #f3f4f6;">
              <p style="margin: 0 0 8px; font-size: 13px; color: #6b7280;">
                <strong style="color: #111827;">Security Notice:</strong> This code will expire in exactly 10 minutes.
              </p>
              <p style="margin: 0; font-size: 13px; color: #9ca3af; line-height: 20px;">
                If you did not initiate this request, please disregard this email. Your account remains completely secure.
              </p>
            </div>
          </div>

        </div>

        <!-- Muted Footer -->
        <div style="max-width: 500px; margin: 24px auto 0; text-align: center;">
          <p style="margin: 0; font-size: 12px; color: #9ca3af;">
            © ${new Date().getFullYear()} PrepMaster. All rights reserved.
          </p>
        </div>
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