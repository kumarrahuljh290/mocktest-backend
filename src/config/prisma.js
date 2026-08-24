import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient({
  log: ['query', 'error'], // optional
  // accelerateUrl: process.env.DATABASE_URL
});

export default prisma;