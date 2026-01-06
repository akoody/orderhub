import { type FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../../shared/db/prisma";
import { createPayment } from "../../modules/payments/usecases/createPayment";
import { handlePaymentWebhook } from "../../modules/payments/usecases/handlePaymentWebhook";

export async function paymentRoutes(app: FastifyInstance) {
  app.post(
    "/payments",
    { preHandler: app.authenticate },
    async (request, reply) => {
      const idempotencyKey = request.headers["idempotency-key"];
      if (typeof idempotencyKey !== "string") {
        reply.code(400);
        return { error: "missing idempotency key" };
      }

      const bodySchema = z.object({
        orderId: z.string().uuid()
      });

      const body = bodySchema.parse(request.body);

      let payment;
      try {
        payment = await createPayment(prisma, {
          orderId: body.orderId,
          userId: request.user.sub,
          idempotencyKey
        });
      } catch (err) {
        if (err instanceof Error && err.message === "ORDER_NOT_FOUND") {
          reply.code(404);
          return { error: "order not found" };
        }
        throw err;
      }

      return { paymentId: payment.id, status: payment.status };
    }
  );

  app.post("/payments/webhook", async (request, reply) => {
    const bodySchema = z.object({
      paymentId: z.string().uuid(),
      status: z.enum(["SUCCESS", "FAILED"]),
      providerRef: z.string().optional()
    });

    const body = bodySchema.parse(request.body);

    try {
      const result = await handlePaymentWebhook(prisma, body);
      return { ok: true, processed: result.processed };
    } catch (err) {
      if (err instanceof Error && err.message === "PAYMENT_NOT_FOUND") {
        reply.code(404);
        return { error: "payment not found" };
      }
      throw err;
    }
  });

  app.post("/provider/mock/pay", async (request) => {
    const bodySchema = z.object({
      paymentId: z.string().uuid()
    });

    const body = bodySchema.parse(request.body);

    const response = await app.inject({
      method: "POST",
      url: "/payments/webhook",
      payload: {
        paymentId: body.paymentId,
        status: "SUCCESS",
        providerRef: `mock-${body.paymentId}`
      }
    });

    return response.json();
  });
}
