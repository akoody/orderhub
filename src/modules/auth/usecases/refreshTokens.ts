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

export async function revokeRefreshToken(prisma: PrismaClient, token: string) {
  const tokenHash = hashToken(token);
  return prisma.refreshToken.updateMany({
    where: { tokenHash, revokedAt: null },
    data: { revokedAt: new Date() }
  });
}

/**
 * Атомарно гасит действующий refresh-токен и возвращает его владельца.
 * Проверка и отзыв — один UPDATE, поэтому два параллельных запроса
 * с одним токеном не получат по новой паре токенов.
 */
export async function consumeRefreshToken(prisma: PrismaClient, token: string) {
  const tokenHash = hashToken(token);
  const now = new Date();
  const consumed = await prisma.refreshToken.updateMany({
    where: { tokenHash, revokedAt: null, expiresAt: { gt: now } },
    data: { revokedAt: now }
  });
  if (consumed.count === 0) {
    return null;
  }
  const record = await prisma.refreshToken.findUnique({
    where: { tokenHash },
    select: { user: { select: { id: true, role: true } } }
  });
  return record?.user ?? null;
}
