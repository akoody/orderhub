import { type FastifyInstance, type FastifyReply } from "fastify";
import { type Role } from "@prisma/client";
import { z } from "zod";
import crypto from "crypto";
import { prisma } from "../../shared/db/prisma";
import { registerUser } from "../../modules/auth/usecases/registerUser";
import { verifyCredentials } from "../../modules/auth/usecases/verifyCredentials";
import {
  consumeRefreshToken,
  createRefreshToken,
  revokeRefreshToken
} from "../../modules/auth/usecases/refreshTokens";

const REFRESH_COOKIE = "refresh_token";
const REFRESH_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8)
});

export async function authRoutes(app: FastifyInstance) {
  const cookieOptions = {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: app.config.COOKIE_SECURE,
    path: "/",
    maxAge: REFRESH_TTL_MS / 1000
  };

  /** Выдаёт access-токен с ролью и новый refresh-токен в httpOnly cookie. */
  async function issueTokens(
    reply: FastifyReply,
    user: { id: string; role: Role }
  ) {
    const refreshToken = crypto.randomUUID();
    await createRefreshToken(prisma, {
      userId: user.id,
      token: refreshToken,
      expiresAt: new Date(Date.now() + REFRESH_TTL_MS)
    });
    reply.setCookie(REFRESH_COOKIE, refreshToken, cookieOptions);
    return {
      accessToken: app.jwt.sign(
        { sub: user.id, role: user.role },
        { expiresIn: "15m" }
      )
    };
  }

  app.post("/auth/register", async (request, reply) => {
    const body = credentialsSchema.parse(request.body);
    try {
      const user = await registerUser(prisma, body);
      return await issueTokens(reply, user);
    } catch (err) {
      if (err instanceof Error && err.message === "EMAIL_TAKEN") {
        reply.code(409);
        return { error: "email already registered" };
      }
      throw err;
    }
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
      const body = credentialsSchema.parse(request.body);

      let user;
      try {
        user = await verifyCredentials(prisma, body);
      } catch {
        reply.code(401);
        return { error: "invalid credentials" };
      }

      return issueTokens(reply, user);
    }
  );

  app.post("/auth/refresh", async (request, reply) => {
    const token = request.cookies[REFRESH_COOKIE];
    if (!token) {
      reply.code(401);
      return { error: "missing refresh token" };
    }

    const user = await consumeRefreshToken(prisma, token);
    if (!user) {
      reply.code(401);
      return { error: "refresh token invalid" };
    }

    return issueTokens(reply, user);
  });

  app.post("/auth/logout", async (request, reply) => {
    const token = request.cookies[REFRESH_COOKIE];
    if (token) {
      await revokeRefreshToken(prisma, token);
    }

    reply.clearCookie(REFRESH_COOKIE, cookieOptions);
    return { ok: true };
  });

  app.get("/me", { preHandler: app.authenticate }, async (request) => {
    return { userId: request.user.sub, role: request.user.role };
  });
}
