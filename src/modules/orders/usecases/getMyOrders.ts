import { PrismaClient } from "@prisma/client";

export async function getMyOrders(prisma: PrismaClient, userId: string) {
  return prisma.order.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" }
  });
}
