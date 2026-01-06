import { PrismaClient, type OrderStatus } from "@prisma/client";

export async function changeOrderStatus(
  prisma: PrismaClient,
  input: { orderId: string; status: OrderStatus; expectedVersion: number }
) {
  const updated = await prisma.order.updateMany({
    where: { id: input.orderId, version: input.expectedVersion },
    data: { status: input.status, version: { increment: 1 } }
  });

  if (updated.count === 0) {
    throw new Error("VERSION_MISMATCH");
  }

  return prisma.order.findUnique({
    where: { id: input.orderId }
  });
}
