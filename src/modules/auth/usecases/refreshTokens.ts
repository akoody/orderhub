import { PrismaClient } from "@prisma/client";
import crypto from "crypto";

function hashToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export async function createRefreshToken(
  prisma: PrismaClient,
  input: { userId: string; token: string; expiresAt: Date }
) {
  const tokenHash = hashToken(input.token);
  return prisma.refreshToken.create({
    data: {
      userId: input.userId,
      tokenHash,
      expiresAt: input.expiresAt
    }
  });
}

export async function revokeRefreshToken(
  prisma: PrismaClient,
  token: string
) {
  const tokenHash = hashToken(token);
  return prisma.refreshToken.updateMany({
    where: { tokenHash, revokedAt: null },
    data: { revokedAt: new Date() }
  });
}

export async function findRefreshToken(prisma: PrismaClient, token: string) {
  const tokenHash = hashToken(token);
  return prisma.refreshToken.findUnique({
    where: { tokenHash }
  });
}
