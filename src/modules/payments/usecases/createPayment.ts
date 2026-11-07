import { OrderStatus, Prisma, PrismaClient } from "@prisma/client";

/**
 * Создание платежа с ключом идемпотентности.
 *
 * Повтор с тем же ключом и тем же заказом возвращает уже созданный платёж.
 * Ключ, использованный для другого заказа или другим пользователем, даёт
 * IDEMPOTENCY_KEY_REUSED: чужой платёж наружу не отдаётся.
 */
export async function createPayment(
  prisma: PrismaClient,
  input: { orderId: string; userId: string; idempotencyKey: string }
) {
  const replay = await findReplay(prisma, input);
  if (replay) {
    return replay;
  }

  const order = await prisma.order.findFirst({
    where: { id: input.orderId, userId: input.userId }
  });

  if (!order) {
    throw new Error("ORDER_NOT_FOUND");
  }
  if (order.status !== OrderStatus.PENDING) {
    throw new Error("ORDER_NOT_PAYABLE");
  }

  try {
    return await prisma.payment.create({
      data: {
        orderId: order.id,
        idempotencyKey: input.idempotencyKey
      }
    });
  } catch (err) {
    // Параллельный запрос с тем же ключом успел создать платёж первым.
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2002"
    ) {
      const existing = await findReplay(prisma, input);
      if (existing) {
        return existing;
      }
    }
    throw err;
  }
}

async function findReplay(
  prisma: PrismaClient,
  input: { orderId: string; userId: string; idempotencyKey: string }
) {
  const existing = await prisma.payment.findUnique({
    where: { idempotencyKey: input.idempotencyKey },
    include: { order: { select: { userId: true } } }
  });
  if (!existing) {
    return null;
  }
  if (
    existing.orderId !== input.orderId ||
    existing.order.userId !== input.userId
  ) {
    throw new Error("IDEMPOTENCY_KEY_REUSED");
  }
  const { order: _order, ...payment } = existing;
  return payment;
}
