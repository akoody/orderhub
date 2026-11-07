import "fastify";
import type { AppConfig } from "../../shared/config/env";

declare module "fastify" {
  interface FastifyRequest {
    metricsStart?: bigint;
    /** Сырое тело JSON-запроса: нужно для проверки подписи вебхука. */
    rawBody?: Buffer;
  }

  interface FastifyInstance {
    config: AppConfig;
    authenticate: (
      request: FastifyRequest,
      reply: FastifyReply
    ) => Promise<void>;
    requireAdmin: (
      request: FastifyRequest,
      reply: FastifyReply
    ) => Promise<void>;
  }
}
