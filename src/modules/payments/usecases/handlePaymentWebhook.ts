import { PrismaClient, PaymentStatus, OutboxStatus } from "@prisma/client";

export async function handlePaymentWebhook(
  prisma: PrismaClient,
  input: { paymentId: string; status: "SUCCESS" | "FAILED"; providerRef?: string }
) {
  return prisma.$transaction(async (tx) => {
    const payment = await tx.payment.findUnique({
      where: { id: input.paymentId }
    });

    if (!payment) {
      throw new Error("PAYMENT_NOT_FOUND");
    }

    if (payment.status === PaymentStatus.SUCCESS) {
      return { payment, processed: false };
    }

    if (input.status === "FAILED") {
      if (payment.status !== PaymentStatus.PENDING) {
        return { payment, processed: false };
      }

      const updated = await tx.payment.updateMany({
        where: { id: payment.id, status: PaymentStatus.PENDING },
        data: { status: PaymentStatus.FAILED, providerRef: input.providerRef }
      });

      return {
        payment: { ...payment, status: PaymentStatus.FAILED },
        processed: updated.count > 0
      };
    }

    if (payment.status !== PaymentStatus.PENDING) {
      return { payment, processed: false };
    }

    const updated = await tx.payment.updateMany({
      where: { id: payment.id, status: PaymentStatus.PENDING },
      data: { status: PaymentStatus.SUCCESS, providerRef: input.providerRef }
    });

    if (updated.count === 0) {
      return { payment, processed: false };
    }

    const order = await tx.order.findUnique({
      where: { id: payment.orderId }
    });

    if (!order) {
      throw new Error("ORDER_NOT_FOUND");
    }

    await tx.order.updateMany({
      where: { id: order.id, status: { not: "PAID" } },
      data: { status: "PAID" }
    });

    await tx.outboxEvent.create({
      data: {
        type: "PaymentSucceeded",
        status: OutboxStatus.NEW,
        payload: {
          orderId: order.id,
          userId: order.userId,
          paymentId: payment.id
        }
      }
    });

    return { payment: { ...payment, status: PaymentStatus.SUCCESS }, processed: true };
  });
}
