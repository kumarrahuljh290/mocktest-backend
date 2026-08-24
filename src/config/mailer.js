import nodemailer from "nodemailer";
import dotenv from "dotenv";
dotenv.config();
export const transporter = nodemailer.createTransport({
  service: "gmail", // or use SMTP config
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS, // use App Password (IMPORTANT)
  },
});

export const sendOtpEmail = async (to, otp) => {
  const mailOptions = {
    from: `"Testbook" <${process.env.EMAIL_USER}>`,
    to,
    subject: "Your OTP Code",
    html: `
      <h2>Verify Your Account</h2>
      <p>Your OTP is:</p>
      <h1 style="letter-spacing:5px;">${otp}</h1>
      <p>This OTP expires in 10 minutes.</p>
    `,
  };

  try {
  const info = await transporter.sendMail(mailOptions);
  console.log("SUCCESS:", info.response);
} catch (err) {
  console.error("ERROR:", err);
}
};