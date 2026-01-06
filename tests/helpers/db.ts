import "dotenv/config";
import { prisma, connectPrisma, disconnectPrisma } from "../../src/shared/db/prisma";

export async function setupDb() {
  await connectPrisma();
}

export async function cleanupDb() {
  await prisma.outboxEvent.deleteMany();
  await prisma.payment.deleteMany();
  await prisma.order.deleteMany();
  await prisma.refreshToken.deleteMany();
  await prisma.user.deleteMany();
}

export async function teardownDb() {
  await disconnectPrisma();
}
