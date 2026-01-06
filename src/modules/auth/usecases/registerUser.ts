import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

export async function registerUser(
  prisma: PrismaClient,
  input: { email: string; password: string }
) {
  const passwordHash = await bcrypt.hash(input.password, 10);
  const user = await prisma.user.create({
    data: {
      email: input.email,
      passwordHash
    }
  });

  return user;
}
