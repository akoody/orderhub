import { beforeAll, afterAll, beforeEach, describe, expect, it } from "vitest";
import { buildServer } from "../../src/app/server";
import { prisma } from "../../src/shared/db/prisma";
import { setupDb, cleanupDb, teardownDb } from "../helpers/db";

describe("payment flow", () => {
  beforeAll(setupDb);
  afterAll(teardownDb);
  beforeEach(cleanupDb);

  it("creates order, payment, webhook -> order paid", async () => {
    const app = buildServer();
    await app.ready();

    try {
      const registerRes = await app.inject({
        method: "POST",
        url: "/auth/register",
        payload: {
          email: "flow@example.com",
          password: "password123"
        }
      });

      const { accessToken } = registerRes.json();

      const orderRes = await app.inject({
        method: "POST",
        url: "/orders",
        headers: {
          authorization: `Bearer ${accessToken}`
        },
        payload: {
          items: [{ price: 100, quantity: 1 }]
        }
      });

      const { orderId } = orderRes.json();

      const paymentRes = await app.inject({
        method: "POST",
        url: "/payments",
        headers: {
          authorization: `Bearer ${accessToken}`,
          "idempotency-key": "0ec7d9fb-0d8a-4e5b-8b10-8c3d76dc8f1a"
        },
        payload: { orderId }
      });

      const { paymentId } = paymentRes.json();

      await app.inject({
        method: "POST",
        url: "/provider/mock/pay",
        payload: { paymentId }
      });

      const order = await prisma.order.findUnique({
        where: { id: orderId }
      });

      expect(order?.status).toBe("PAID");

      const outbox = await prisma.outboxEvent.findMany({
        where: { status: "NEW" }
      });

      expect(outbox.length).toBe(1);
    } finally {
      await app.close();
    }
  });
});
