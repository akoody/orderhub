import { PrismaClient } from "@prisma/client";

export type OrderItem = {
  price: number;
  quantity: number;
};

export async function createOrder(
  prisma: PrismaClient,
  input: { userId: string; items: OrderItem[] }
) {
  const total = input.items.reduce(
    (sum, item) => sum + item.price * item.quantity,
    0
  );

  const order = await prisma.order.create({
    data: {
      userId: input.userId,
      total
    }
  });

  return order;
}
