import { Prisma, PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

export async function registerUser(
  prisma: PrismaClient,
  input: { email: string; password: string }
) {
  const passwordHash = await bcrypt.hash(input.password, 10);
  try {
    return await prisma.user.create({
      data: {
        email: input.email,
        passwordHash
      }
    });
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2002"
    ) {
      throw new Error("EMAIL_TAKEN");
    }
    throw err;
  }
}
