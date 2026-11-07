import { type FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../../shared/db/prisma";
import { createPayment } from "../../modules/payments/usecases/createPayment";
import { handlePaymentWebhook } from "../../modules/payments/usecases/handlePaymentWebhook";
import {
  isValidWebhookSignature,
  signWebhookBody,
  WEBHOOK_SIGNATURE_HEADER
} from "../../modules/payments/webhookSignature";

const paymentErrors: Record<string, { status: number; error: string }> = {
  ORDER_NOT_FOUND: { status: 404, error: "order not found" },
  ORDER_NOT_PAYABLE: { status: 409, error: "order is not awaiting payment" },
  IDEMPOTENCY_KEY_REUSED: {
    status: 422,
    error: "idempotency key was already used for a different request"
  }
};

export async function paymentRoutes(app: FastifyInstance) {
  // Подпись вебхука считается по сырому телу, поэтому сохраняем его
  // до разбора JSON. Парсер действует только внутри этого плагина.
  app.addContentTypeParser(
    "application/json",
    { parseAs: "buffer" },
    (request, body, done) => {
      const raw = body as Buffer;
      request.rawBody = raw;
      try {
        done(null, raw.length ? JSON.parse(raw.toString("utf8")) : {});
      } catch (err) {
        (err as Error & { statusCode?: number }).statusCode = 400;
        done(err as Error, undefined);
      }
    }
  );

  app.post(
    "/payments",
    { preHandler: app.authenticate },
    async (request, reply) => {
      const idempotencyKey = request.headers["idempotency-key"];
      if (typeof idempotencyKey !== "string" || !idempotencyKey.trim()) {
        reply.code(400);
        return { error: "missing idempotency key" };
      }

      const body = z.object({ orderId: z.string().uuid() }).parse(request.body);

      try {
        const payment = await createPayment(prisma, {
          orderId: body.orderId,
          userId: request.user.sub,
          idempotencyKey
        });
        return { paymentId: payment.id, status: payment.status };
      } catch (err) {
        const known = err instanceof Error && paymentErrors[err.message];
        if (known) {
          reply.code(known.status);
          return { error: known.error };
        }
        throw err;
      }
    }
  );

  app.post("/payments/webhook", async (request, reply) => {
    const signature = request.headers[WEBHOOK_SIGNATURE_HEADER];
    if (
      !request.rawBody ||
      !isValidWebhookSignature(
        request.rawBody,
        typeof signature === "string" ? signature : undefined,
        app.config.PAYMENT_WEBHOOK_SECRET
      )
    ) {
      reply.code(401);
      return { error: "invalid signature" };
    }

    const body = z
      .object({
        paymentId: z.string().uuid(),
        status: z.enum(["SUCCESS", "FAILED"]),
        providerRef: z.string().optional()
      })
      .parse(request.body);

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

  // Имитация провайдера для локальной разработки: подписывает и отправляет
  // вебхук так же, как это сделал бы настоящий провайдер.
  if (app.config.MOCK_PROVIDER_ENABLED) {
    app.post("/provider/mock/pay", async (request) => {
      const body = z
        .object({ paymentId: z.string().uuid() })
        .parse(request.body);
      const payload = JSON.stringify({
        paymentId: body.paymentId,
        status: "SUCCESS",
        providerRef: `mock-${body.paymentId}`
      });

      const response = await app.inject({
        method: "POST",
        url: "/payments/webhook",
        headers: {
          "content-type": "application/json",
          [WEBHOOK_SIGNATURE_HEADER]: signWebhookBody(
            payload,
            app.config.PAYMENT_WEBHOOK_SECRET
          )
        },
        payload
      });

      return response.json();
    });
  }
}
