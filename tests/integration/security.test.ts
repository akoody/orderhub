import { randomUUID } from "crypto";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it
} from "vitest";
import { buildServer } from "../../src/app/server";
import { loadConfig } from "../../src/shared/config/env";
import { prisma } from "../../src/shared/db/prisma";
import {
  signWebhookBody,
  WEBHOOK_SIGNATURE_HEADER
} from "../../src/modules/payments/webhookSignature";
import { cleanupDb, setupDb, teardownDb } from "../helpers/db";

type App = ReturnType<typeof buildServer>;

describe("security", () => {
  let app: App;

  beforeAll(setupDb);
  afterAll(teardownDb);
  beforeEach(async () => {
    await cleanupDb();
    app = buildServer();
    await app.ready();
  });
  afterEach(() => app.close());

  async function register(email: string) {
    const res = await app.inject({
      method: "POST",
      url: "/auth/register",
      payload: { email, password: "password123" }
    });
    expect(res.statusCode).toBe(200);
    return (res.json() as { accessToken: string }).accessToken;
  }

  async function createOrder(token: string) {
    const res = await app.inject({
      method: "POST",
      url: "/orders",
      headers: { authorization: `Bearer ${token}` },
      payload: { items: [{ price: 100, quantity: 1 }] }
    });
    return (res.json() as { orderId: string }).orderId;
  }

  function pay(token: string, orderId: string, key: string) {
    return app.inject({
      method: "POST",
      url: "/payments",
      headers: { authorization: `Bearer ${token}`, "idempotency-key": key },
      payload: { orderId }
    });
  }

  function webhook(payload: object, signature?: string) {
    const body = JSON.stringify(payload);
    return app.inject({
      method: "POST",
      url: "/payments/webhook",
      headers: {
        "content-type": "application/json",
        ...(signature !== undefined
          ? { [WEBHOOK_SIGNATURE_HEADER]: signature }
          : {})
      },
      payload: body
    });
  }

  describe("payment webhook", () => {
    it("rejects unsigned and forged webhooks without touching the order", async () => {
      const token = await register("buyer@example.com");
      const orderId = await createOrder(token);
      const { paymentId } = (
        await pay(token, orderId, randomUUID())
      ).json() as { paymentId: string };
      const payload = { paymentId, status: "SUCCESS" };

      expect((await webhook(payload)).statusCode).toBe(401);
      expect(
        (await webhook(payload, signWebhookBody("{}", "wrong-secret")))
          .statusCode
      ).toBe(401);
      // Подпись от другого тела не подходит к этому телу.
      const otherBody = JSON.stringify({ ...payload, status: "FAILED" });
      expect(
        (
          await webhook(
            payload,
            signWebhookBody(otherBody, loadConfig().PAYMENT_WEBHOOK_SECRET)
          )
        ).statusCode
      ).toBe(401);

      const order = await prisma.order.findUnique({ where: { id: orderId } });
      expect(order?.status).toBe("PENDING");
    });

    it("accepts a correctly signed webhook once", async () => {
      const token = await register("buyer@example.com");
      const orderId = await createOrder(token);
      const { paymentId } = (
        await pay(token, orderId, randomUUID())
      ).json() as { paymentId: string };
      const body = JSON.stringify({ paymentId, status: "SUCCESS" });
      const signature = signWebhookBody(
        body,
        loadConfig().PAYMENT_WEBHOOK_SECRET
      );

      const first = await webhook(JSON.parse(body), signature);
      const replay = await webhook(JSON.parse(body), signature);

      expect(first.json()).toEqual({ ok: true, processed: true });
      expect(replay.json()).toEqual({ ok: true, processed: false });
      expect(await prisma.outboxEvent.count()).toBe(1);
    });

    it("does not expose the mock provider unless it is enabled", async () => {
      const prodLike = buildServer({
        ...loadConfig(),
        MOCK_PROVIDER_ENABLED: false
      });
      await prodLike.ready();
      const res = await prodLike.inject({
        method: "POST",
        url: "/provider/mock/pay",
        payload: { paymentId: randomUUID() }
      });
      await prodLike.close();
      expect(res.statusCode).toBe(404);
    });
  });

  describe("idempotency", () => {
    it("returns the same payment for a retried request", async () => {
      const token = await register("buyer@example.com");
      const orderId = await createOrder(token);
      const key = randomUUID();

      const first = (await pay(token, orderId, key)).json();
      const retry = (await pay(token, orderId, key)).json();

      expect(retry).toEqual(first);
      expect(await prisma.payment.count()).toBe(1);
    });

    it("does not hand another user's payment to a reused key", async () => {
      const alice = await register("alice@example.com");
      const bob = await register("bob@example.com");
      const key = randomUUID();
      await pay(alice, await createOrder(alice), key);

      const res = await pay(bob, await createOrder(bob), key);

      expect(res.statusCode).toBe(422);
      expect(res.json()).not.toHaveProperty("paymentId");
    });

    it("rejects the same key for a different order", async () => {
      const token = await register("buyer@example.com");
      const key = randomUUID();
      await pay(token, await createOrder(token), key);

      const res = await pay(token, await createOrder(token), key);
      expect(res.statusCode).toBe(422);
    });

    it("refuses to pay another user's order", async () => {
      const alice = await register("alice@example.com");
      const bob = await register("bob@example.com");
      const res = await pay(bob, await createOrder(alice), randomUUID());
      expect(res.statusCode).toBe(404);
    });
  });

  describe("admin order status", () => {
    async function changeStatus(
      orderId: string,
      headers: Record<string, string>
    ) {
      return app.inject({
        method: "PATCH",
        url: `/admin/orders/${orderId}/status`,
        headers: { "x-order-version": "1", ...headers },
        payload: { status: "CANCELLED" }
      });
    }

    it("ignores the old x-admin header and requires an admin token", async () => {
      const token = await register("buyer@example.com");
      const orderId = await createOrder(token);

      expect(
        (await changeStatus(orderId, { "x-admin": "true" })).statusCode
      ).toBe(401);
      expect(
        (
          await changeStatus(orderId, {
            "x-admin": "true",
            authorization: `Bearer ${token}`
          })
        ).statusCode
      ).toBe(403);

      const order = await prisma.order.findUnique({ where: { id: orderId } });
      expect(order?.status).toBe("PENDING");
    });

    it("lets an admin change status with optimistic locking", async () => {
      const buyer = await register("buyer@example.com");
      const orderId = await createOrder(buyer);
      await register("admin@example.com");
      await prisma.user.update({
        where: { email: "admin@example.com" },
        data: { role: "ADMIN" }
      });
      const login = await app.inject({
        method: "POST",
        url: "/auth/login",
        payload: { email: "admin@example.com", password: "password123" }
      });
      const admin = (login.json() as { accessToken: string }).accessToken;

      const ok = await changeStatus(orderId, {
        authorization: `Bearer ${admin}`
      });
      expect(ok.statusCode).toBe(200);
      expect(ok.json()).toMatchObject({ status: "CANCELLED", version: 2 });

      const stale = await changeStatus(orderId, {
        authorization: `Bearer ${admin}`
      });
      expect(stale.statusCode).toBe(409);
    });
  });

  describe("auth", () => {
    it("returns 409 for a duplicate email instead of 500", async () => {
      await register("buyer@example.com");
      const res = await app.inject({
        method: "POST",
        url: "/auth/register",
        payload: { email: "buyer@example.com", password: "password123" }
      });
      expect(res.statusCode).toBe(409);
    });

    it("lets a refresh token be used only once, even concurrently", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/auth/register",
        payload: { email: "buyer@example.com", password: "password123" }
      });
      const cookie = res.cookies.find((c) => c.name === "refresh_token");
      expect(cookie).toBeDefined();
      const refresh = () =>
        app.inject({
          method: "POST",
          url: "/auth/refresh",
          cookies: { refresh_token: cookie!.value }
        });

      const results = await Promise.all([refresh(), refresh(), refresh()]);
      const codes = results.map((r) => r.statusCode).sort();
      expect(codes).toEqual([200, 401, 401]);
    });
  });

  it("refuses to start without secrets", () => {
    expect(() => loadConfig({})).toThrow(/JWT_SECRET/);
    expect(() =>
      loadConfig({
        JWT_SECRET: "short",
        PAYMENT_WEBHOOK_SECRET: "x".repeat(40)
      })
    ).toThrow(/at least 32/);
  });
});
