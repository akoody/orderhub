import { type FastifyInstance } from "fastify";
import { z } from "zod";
import crypto from "crypto";
import { prisma } from "../../shared/db/prisma";
import { registerUser } from "../../modules/auth/usecases/registerUser";
import { verifyCredentials } from "../../modules/auth/usecases/verifyCredentials";
import {
  createRefreshToken,
  findRefreshToken,
  revokeRefreshToken
} from "../../modules/auth/usecases/refreshTokens";

const refreshCookie = {
  name: "refresh_token",
  options: {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: false,
    path: "/",
    maxAge: 60 * 60 * 24 * 7
  }
};

function issueAccessToken(app: FastifyInstance, userId: string) {
  return app.jwt.sign({ sub: userId }, { expiresIn: "15m" });
}

function issueRefreshToken() {
  return crypto.randomUUID();
}

export async function authRoutes(app: FastifyInstance) {
  app.post("/auth/register", async (request, reply) => {
    const bodySchema = z.object({
      email: z.string().email(),
      password: z.string().min(8)
    });

    const body = bodySchema.parse(request.body);
    const user = await registerUser(prisma, body);

    const refreshToken = issueRefreshToken();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await createRefreshToken(prisma, {
      userId: user.id,
      token: refreshToken,
      expiresAt
    });

    const accessToken = issueAccessToken(app, user.id);
    reply.setCookie(refreshCookie.name, refreshToken, refreshCookie.options);

    return { accessToken };
  });

  app.post(
    "/auth/login",
    {
      config: {
        rateLimit: {
          max: 5,
          timeWindow: "1 minute"
        }
      }
    },
    async (request, reply) => {
      const bodySchema = z.object({
        email: z.string().email(),
        password: z.string().min(8)
      });

      const body = bodySchema.parse(request.body);

      let user;
      try {
        user = await verifyCredentials(prisma, body);
      } catch (err) {
        reply.code(401);
        return { error: "invalid credentials" };
      }

      const refreshToken = issueRefreshToken();
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      await createRefreshToken(prisma, {
        userId: user.id,
        token: refreshToken,
        expiresAt
      });

      const accessToken = issueAccessToken(app, user.id);
      reply.setCookie(refreshCookie.name, refreshToken, refreshCookie.options);

      return { accessToken };
    }
  );

  app.post("/auth/refresh", async (request, reply) => {
    const token = request.cookies[refreshCookie.name];
    if (!token) {
      reply.code(401);
      return { error: "missing refresh token" };
    }

    const record = await findRefreshToken(prisma, token);
    if (!record || record.revokedAt || record.expiresAt < new Date()) {
      reply.code(401);
      return { error: "refresh token invalid" };
    }

    await revokeRefreshToken(prisma, token);

    const newRefreshToken = issueRefreshToken();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await createRefreshToken(prisma, {
      userId: record.userId,
      token: newRefreshToken,
      expiresAt
    });

    const accessToken = issueAccessToken(app, record.userId);
    reply.setCookie(refreshCookie.name, newRefreshToken, refreshCookie.options);

    return { accessToken };
  });

  app.post("/auth/logout", async (request, reply) => {
    const token = request.cookies[refreshCookie.name];
    if (token) {
      await revokeRefreshToken(prisma, token);
    }

    reply.clearCookie(refreshCookie.name, refreshCookie.options);
    return { ok: true };
  });

  app.get("/me", { preHandler: app.authenticate }, async (request) => {
    return { userId: request.user.sub };
  });
}
