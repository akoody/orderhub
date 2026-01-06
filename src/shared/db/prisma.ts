import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

const datasourceUrl = process.env.DATABASE_URL;
if (!datasourceUrl) {
  throw new Error("DATABASE_URL is not set");
}

const pool = new Pool({ connectionString: datasourceUrl });
const adapter = new PrismaPg(pool);

export const prisma = new PrismaClient({ adapter });

export async function connectPrisma() {
  await prisma.$connect();
  return prisma;
}

export async function disconnectPrisma() {
  await prisma.$disconnect();
  await pool.end();
}
