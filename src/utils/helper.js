import prisma from "../config/prisma.js";

export const generateOTP = (length = 6) => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};


