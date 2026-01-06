import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

export async function verifyCredentials(
  prisma: PrismaClient,
  input: { email: string; password: string }
) {
  const user = await prisma.user.findUnique({
    where: { email: input.email }
  });

  if (!user) {
    throw new Error("INVALID_CREDENTIALS");
  }

  const ok = await bcrypt.compare(input.password, user.passwordHash);
  if (!ok) {
    throw new Error("INVALID_CREDENTIALS");
  }

  return user;
}
