import fastify from "fastify";
import cookie from "@fastify/cookie";
import jwt from "@fastify/jwt";
import rateLimit from "@fastify/rate-limit";
import { ZodError } from "zod";
import { authRoutes } from "./routes/auth";
import { orderRoutes } from "./routes/orders";
import { paymentRoutes } from "./routes/payments";
import { prisma } from "../shared/db/prisma";
import { connectRedis } from "../shared/redis/redis";
import { connectRabbit } from "../shared/queue/rabbit";
import {
  httpRequestDuration,
  httpRequestsTotal,
  outboxLag,
  register
} from "../shared/metrics/metrics";

export function buildServer() {
  const app = fastify({
    logger: true
  });

  app.register(cookie);
  app.register(jwt, {
    secret: process.env.JWT_SECRET ?? "dev-secret"
  });
  app.register(rateLimit, { global: false });

  app.decorate("authenticate", async (request, reply) => {
    try {
      await request.jwtVerify();
    } catch (err) {
      reply.code(401);
      throw err;
    }
  });

  app.setErrorHandler((err, _request, reply) => {
    if (err instanceof ZodError) {
      reply.code(400).send({ error: "validation_error", issues: err.issues });
      return;
    }

    reply.send(err);
  });

  app.addHook("onRequest", async (request) => {
    request.metricsStart = process.hrtime.bigint();
  });

  app.addHook("onResponse", async (request, reply) => {
    const start = request.metricsStart;
    if (!start) {
      return;
    }
    const durationSeconds = Number(process.hrtime.bigint() - start) / 1e9;
    const route = request.routeOptions?.url ?? "unknown";
    const labels = {
      method: request.method,
      route,
      status: String(reply.statusCode)
    };
    httpRequestDuration.observe(labels, durationSeconds);
    httpRequestsTotal.inc(labels);
  });

  app.get("/metrics", async (_request, reply) => {
    const count = await prisma.outboxEvent.count({
      where: { status: "NEW" }
    });
    outboxLag.set(count);
    reply.header("Content-Type", register.contentType);
    return register.metrics();
  });

  app.get("/ready", async (_request, reply) => {
    try {
      await prisma.$queryRawUnsafe("SELECT 1");
      const redis = await connectRedis();
      await redis.ping();
      await connectRabbit();
      return { status: "ok" };
    } catch (err) {
      reply.code(503);
      return { status: "not_ready" };
    }
  });

  app.get("/health", async () => ({ status: "ok" }));

  app.register(authRoutes);
  app.register(orderRoutes);
  app.register(paymentRoutes);

  return app;
}
