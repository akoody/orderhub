import { PrismaClient } from "@prisma/client";
import { Prisma } from "@prisma/client";

export async function createPayment(
  prisma: PrismaClient,
  input: { orderId: string; userId: string; idempotencyKey: string }
) {
  const order = await prisma.order.findFirst({
    where: { id: input.orderId, userId: input.userId }
  });

  if (!order) {
    throw new Error("ORDER_NOT_FOUND");
  }

  try {
    const payment = await prisma.payment.create({
      data: {
        orderId: order.id,
        idempotencyKey: input.idempotencyKey
      }
    });

    return payment;
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2002"
    ) {
      const existing = await prisma.payment.findUnique({
        where: { idempotencyKey: input.idempotencyKey }
      });

      if (existing) {
        return existing;
      }
    }

    throw err;
  }
}
